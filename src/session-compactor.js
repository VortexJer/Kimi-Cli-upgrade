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
  const normalized = ['off', 'aggressive'].includes(mode) ? mode : 'safe';
  CONFIG.setupKimi1Home();
  if (normalized === 'off') {
    try { fs.unlinkSync(AUTO_COMPACT_MARKER); } catch {}
  } else {
    fs.writeFileSync(AUTO_COMPACT_MARKER, normalized, 'utf-8');
  }
  return normalized;
}

function autoCompactOpts() {
  const mode = getAutoCompactMode();
  if (!mode) return null;
  return mode === 'aggressive' ? { keepMessages: 10 } : { keepMessages: 30 };
}

// Safe stripping: only remove fields that are clearly non-semantic metadata.
// Do NOT remove event types, loop events, or tool schemas — kimi.exe needs them.
function stripEvent(evt) {
  if (!evt || typeof evt !== 'object') return evt;

  // Remove timing/ids that change every run and bloat the wire.
  delete evt.time;
  delete evt.timestamp;
  delete evt.event_id;
  delete evt.eventId;
  delete evt.request_id;

  // Strip message metadata that does not affect context semantics.
  if (evt.type === 'context.append_message' && evt.message) {
    delete evt.message.name;
    delete evt.message.origin;
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
      if (evt.type === 'context.append_message' && i < keepFrom) continue;
      kept.push(JSON.stringify(stripEvent(evt)));
    } catch {
      // drop malformed
    }
  }

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
  stripEvent
};
