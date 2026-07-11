const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');

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
  const threshold = opts.threshold || CONFIG.WIRE_COMPACT_THRESHOLD_BYTES;
  if (!fs.existsSync(wirePath)) return { compacted: false, reason: 'missing' };
  const size = fs.statSync(wirePath).size;
  if (size < threshold) return { compacted: false, size, reason: 'under-threshold' };

  const raw = fs.readFileSync(wirePath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(Boolean);

  // Keep the most recent user/assistant messages; drop old loop noise.
  const keepMessages = opts.keepMessages || 30;
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
        kept.push(lines[i]);
      }
    } catch {
      // drop malformed
    }
  }

  // Backup the original wire before rewriting
  const dir = path.dirname(wirePath);
  const backupName = `wire.jsonl.bak.${Date.now()}`;
  const backupPath = path.join(dir, backupName);
  fs.renameSync(wirePath, backupPath);

  // Rewrite the compacted wire
  fs.writeFileSync(wirePath, kept.join('\n') + (kept.length ? '\n' : ''), 'utf-8');

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

module.exports = {
  findWireFiles,
  findSessionWire,
  findLatestWire,
  compactWire,
  compactSession,
  compactLatestSession,
  KEEP_EVENT_TYPES
};
