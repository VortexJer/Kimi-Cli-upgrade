const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');

const SESSION_INDEX = path.join(CONFIG.KIMI1_HOME, 'session_index.jsonl');

// "Fork" a session the SAFE way: instead of rewriting Kimi's append-only
// wire.jsonl (which owns its own event/reference invariants and breaks on
// resume when edited), read the old session locally, build a short summary
// with ZERO API calls, and let the caller launch a BRAND NEW session seeded
// with that summary. The old session is never touched.

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
        wires.push({ sessionId: session.name, wirePath });
      }
    }
  }
  return wires;
}

function findWire(sessionId) {
  const sessionsDir = path.join(CONFIG.KIMI1_HOME, 'sessions');
  const wires = findWireFiles(sessionsDir);
  if (wires.length === 0) return null;
  if (!sessionId) {
    // Most recently modified session.
    return wires.sort((a, b) => fs.statSync(b.wirePath).mtimeMs - fs.statSync(a.wirePath).mtimeMs)[0];
  }
  const needle = sessionId.replace(/^session_/, '');
  return wires.find(w => w.sessionId.includes(needle)) || null;
}

function messageText(message) {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content.filter(c => c.type === 'text').map(c => c.text).join(' ');
  }
  return '';
}

// Extract (role, text) pairs in order from the wire.
function readMessages(wirePath) {
  const out = [];
  if (!fs.existsSync(wirePath)) return out;
  const lines = fs.readFileSync(wirePath, 'utf-8').split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    try {
      const evt = JSON.parse(line);
      if (evt.type === 'context.append_message' && evt.message && evt.message.role) {
        const text = messageText(evt.message).trim();
        if (text) out.push({ role: evt.message.role, text });
      }
    } catch {
      // ignore malformed line
    }
  }
  return out;
}

function workDirForSession(sessionId) {
  if (!fs.existsSync(SESSION_INDEX)) return null;
  const needle = sessionId ? sessionId.replace(/^session_/, '') : null;
  const lines = fs.readFileSync(SESSION_INDEX, 'utf-8').split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (!needle || e.sessionId === sessionId || e.sessionId.replace(/^session_/, '').startsWith(needle)) {
        return e.workDir || null;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function truncate(text, max) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, max - 1) + '…';
}

// Harness-injected <system-reminder> blocks and trivial fillers ("continua",
// "sigue", "ok") carry no task signal and just dilute the fork seed.
const FILLERS = new Set(['continua', 'continúa', 'continue', 'sigue', 'ok', 'okay', 'vale', 'dale', 'si', 'sí', 'yes']);

function cleanUserText(text) {
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, ' ')
    .replace(/<system-reminder>[\s\S]*$/i, ' ') // unterminated (truncated) reminder
    .replace(/<notification\b[\s\S]*?<\/notification>/gi, ' ')
    .replace(/<notification\b[\s\S]*$/i, ' ') // unterminated notification
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningfulUserMessages(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const cleaned = cleanUserText(m.text);
    if (!cleaned) continue;
    if (FILLERS.has(cleaned.toLowerCase())) continue;
    out.push(cleaned);
  }
  return out;
}

// Build a compact seed prompt from the old session. Keeps the original goal
// (first user message) plus the tail of the conversation, all truncated.
function buildForkSummary(sessionId, opts = {}) {
  const tailMessages = opts.tailMessages || 6;
  const wire = findWire(sessionId);
  if (!wire) return null;

  const messages = readMessages(wire.wirePath);
  if (messages.length === 0) return null;

  // Kimi stores assistant output in loop events, not append_message, so the
  // useful signal here is the user's own instructions (the task trajectory),
  // minus injected reminders and one-word fillers.
  const userMsgs = meaningfulUserMessages(messages);
  if (userMsgs.length === 0) return null;

  const goal = userMsgs[0];
  const tail = userMsgs.slice(1).slice(-tailMessages);

  const parts = [];
  parts.push('Continuas una tarea de una sesion previa. No repitas trabajo ya hecho.');
  parts.push(`Objetivo original: ${truncate(goal, 400)}`);
  if (tail.length > 0) {
    parts.push('Instrucciones posteriores del usuario (resumen local, puede faltar detalle):');
    for (const t of tail) {
      parts.push(`- ${truncate(t, 220)}`);
    }
  }
  parts.push('Continua desde el ultimo punto pendiente.');

  return {
    text: parts.join('\n'),
    workDir: wire ? workDirForSession(wire.sessionId) : null,
    sourceSessionId: wire.sessionId,
    messageCount: messages.length,
    usefulMessages: userMsgs.length
  };
}

module.exports = { buildForkSummary, readMessages, findWire };
