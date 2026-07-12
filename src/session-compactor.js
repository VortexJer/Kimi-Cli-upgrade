const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');

const AUTO_COMPACT_MARKER = path.join(CONFIG.KIMI1_HOME, '.auto-compact-mode');

function getAutoCompactMode() {
  if (!fs.existsSync(AUTO_COMPACT_MARKER)) return null;
  const mode = fs.readFileSync(AUTO_COMPACT_MARKER, 'utf-8').trim();
  return mode === 'aggressive' ? 'aggressive' : 'safe';
}

function setAutoCompactMode(mode) {
  const normalized = mode === 'aggressive' ? 'aggressive' : 'safe';
  CONFIG.setupKimi1Home();
  fs.writeFileSync(AUTO_COMPACT_MARKER, normalized, 'utf-8');
  return normalized;
}

function autoCompactOpts() {
  const mode = getAutoCompactMode();
  if (!mode) return null;
  return mode === 'aggressive' ? { keepMessages: 10 } : { keepMessages: 30 };
}

// Event types worth keeping when compacting a session wire.
// Everything else (loop events, usage records, permission prompts) is discarded.
const KEEP_EVENT_TYPES = new Set([
  'metadata',
  'config.update',
  'tools.set_active_tools',
  'llm.tools_snapshot',
  'context.append_message',
  'context.apply_compaction',
  'full_compaction.begin',
  'full_compaction.complete',
  'turn.cancel'
]);

// Fields to strip from kept events to reduce size without breaking the wire format.
function stripEvent(evt) {
  if (!evt || typeof evt !== 'object') return evt;

  // Remove timing/ids that change every run and bloat the wire.
  delete evt.time;
  delete evt.timestamp;
  delete evt.event_id;
  delete evt.eventId;
  delete evt.request_id;
  delete evt.turnId;
  delete evt.stepId;

  // Strip message metadata that does not affect context semantics.
  if (evt.type === 'context.append_message' && evt.message) {
    delete evt.message.name;
    delete evt.message.origin;
    if (Array.isArray(evt.message.content)) {
      evt.message.content = evt.message.content.map(part => {
        if (part && typeof part === 'object') {
          const clean = { type: part.type };
          if (part.text !== undefined) clean.text = part.text;
          if (part.toolUseId !== undefined) clean.toolUseId = part.toolUseId;
          if (part.toolCallId !== undefined) clean.toolCallId = part.toolCallId;
          if (part.content !== undefined) clean.content = part.content;
          if (part.input !== undefined) clean.input = part.input;
          return clean;
        }
        return part;
      });
    }
    delete evt.message.toolCalls;
  }

  // Strip large snapshots down to tool names only.
  if (evt.type === 'llm.tools_snapshot' && Array.isArray(evt.tools)) {
    evt.tools = evt.tools.map(t => ({
      name: t.name,
      description: t.description ? t.description.slice(0, 120) : undefined
    })).filter(t => t.name);
  }

  return evt;
}

function findWireFiles(sessionsDir) {
  const wires = [];
  if (!fs.existsSync(sessionsDir)) return wires;
  for (const workspace of fs.readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!workspace.isDirectory()) continue;
    const workspacePath = path.join(sessionsDir, workspace.name);
    for (const session of fs.readdirSync(workspacePath, { withFileTypes: true })) {
      if (!session.isDirectory()) continue;
      const wirePath = path.join(workspacePath, session.name, 'agents', 'main', 'wire.jsonl');
      if (fs.existsSync(wirePath)) {
        wires.push(wirePath);
      }
    }
  }
  return wires;
}

function findSessionWire(sessionId, sessionsDir) {
  if (!sessionId || !fs.existsSync(sessionsDir)) return null;
  const wires = findWireFiles(sessionsDir);
  const needle = sessionId.replace(/^session_/, '');
  return wires.find(w => w.includes(`session_${needle}`)) || null;
}

function findLatestWire(sessionsDir) {
  const wires = findWireFiles(sessionsDir);
  if (wires.length === 0) return null;
  return wires.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

function compactWire(wirePath, opts = {}) {
  const auto = autoCompactOpts();
  const threshold = opts.threshold || (auto && auto.threshold) || CONFIG.WIRE_COMPACT_THRESHOLD_BYTES;
  const keepMessages = opts.keepMessages || (auto && auto.keepMessages) || 30;
  if (!fs.existsSync(wirePath)) return { compacted: false, reason: 'missing' };
  const size = fs.statSync(wirePath).size;

  const raw = fs.readFileSync(wirePath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(Boolean);

  // Keep the most recent user/assistant messages; drop old loop noise.
  const messageIndices = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      const evt = JSON.parse(lines[i]);
      if (evt.type === 'context.append_message') messageIndices.push(i);
    } catch {
      // ignore malformed
    }
  }
  const keepFrom = messageIndices.length > keepMessages
    ? messageIndices[messageIndices.length - keepMessages]
    : 0;

  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      const evt = JSON.parse(lines[i]);
      if (KEEP_EVENT_TYPES.has(evt.type)) {
        if (evt.type === 'context.append_message' && i < keepFrom) continue;
        kept.push(JSON.stringify(stripEvent(evt)));
      }
    } catch {
      // drop malformed
    }
  }

  // Always rewrite if we dropped anything, even under threshold.
  const newRaw = kept.join('\n') + (kept.length ? '\n' : '');
  const wouldShrink = newRaw.length < raw.length;

  if (size < threshold && !wouldShrink) {
    return { compacted: false, size, reason: 'under-threshold-no-shrink' };
  }

  // Backup the original wire before rewriting
  const dir = path.dirname(wirePath);
  const backupName = `wire.jsonl.bak.${Date.now()}`;
  const backupPath = path.join(dir, backupName);
  fs.renameSync(wirePath, backupPath);

  // Rewrite the compacted wire
  fs.writeFileSync(wirePath, newRaw, 'utf-8');

  const newSize = fs.statSync(wirePath).size;
  return {
    compacted: true,
    originalSize: size,
    newSize,
    keptEvents: kept.length,
    droppedEvents: lines.length - kept.length,
    backup: backupPath
  };
}

function compactSession(sessionId, opts = {}) {
  const wirePath = findSessionWire(sessionId, path.join(CONFIG.KIMI1_HOME, 'sessions'));
  if (!wirePath) return { compacted: false, reason: 'session-not-found' };
  return compactWire(wirePath, opts);
}

function compactLatestSession(opts = {}) {
  const wirePath = findLatestWire(path.join(CONFIG.KIMI1_HOME, 'sessions'));
  if (!wirePath) return { compacted: false, reason: 'no-sessions' };
  return compactWire(wirePath, opts);
}

function compactAllSessions(opts = {}) {
  const wires = findWireFiles(path.join(CONFIG.KIMI1_HOME, 'sessions'));
  const results = [];
  for (const wire of wires) {
    results.push(compactWire(wire, opts));
  }
  return results;
}

module.exports = {
  findWireFiles,
  findSessionWire,
  findLatestWire,
  compactWire,
  compactSession,
  compactLatestSession,
  compactAllSessions,
  getAutoCompactMode,
  setAutoCompactMode,
  KEEP_EVENT_TYPES,
  stripEvent
};
