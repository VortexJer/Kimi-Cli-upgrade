const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');

// Token accounting is read straight from Kimi's own wire.jsonl `usage.record`
// events, so these numbers are exactly what the backend billed — not an
// estimate. Shape (observed): { model, usage: { inputOther, output,
// inputCacheRead, inputCacheCreation }, usageScope: 'turn', time }.

const RATES_FILE = path.join(CONFIG.KIMI1_HOME, 'usage-rates.json');

function walkWires(sessionsDir) {
  const out = [];
  if (!fs.existsSync(sessionsDir)) return out;
  for (const ws of fs.readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!ws.isDirectory()) continue;
    const wsPath = path.join(sessionsDir, ws.name);
    for (const s of fs.readdirSync(wsPath, { withFileTypes: true })) {
      if (!s.isDirectory()) continue;
      const wire = path.join(wsPath, s.name, 'agents', 'main', 'wire.jsonl');
      if (fs.existsSync(wire)) out.push({ sessionId: s.name, wirePath: wire });
    }
  }
  return out;
}

function emptyTotals() {
  return { inputOther: 0, output: 0, cacheRead: 0, cacheCreation: 0, turns: 0 };
}

function addUsage(acc, u) {
  if (!u) return;
  acc.inputOther += u.inputOther || 0;
  acc.output += u.output || 0;
  acc.cacheRead += u.inputCacheRead || 0;
  acc.cacheCreation += u.inputCacheCreation || 0;
}

// Parse a wire: totals across the whole session + the last turn's totals
// (usage.record events that appear after the final turn.prompt), which is what
// a single `kimi -p` run just spent.
function parseWireUsage(wirePath) {
  const totals = emptyTotals();
  const lastTurn = emptyTotals();
  const models = new Set();
  if (!fs.existsSync(wirePath)) return { totals, lastTurn, models: [] };

  const lines = fs.readFileSync(wirePath, 'utf-8').split(/\r?\n/).filter(Boolean);
  let lastPromptIdx = -1;
  const parsed = [];
  for (let i = 0; i < lines.length; i++) {
    let e;
    try { e = JSON.parse(lines[i]); } catch { parsed.push(null); continue; }
    parsed.push(e);
    if (e && e.type === 'turn.prompt') lastPromptIdx = i;
  }
  for (let i = 0; i < parsed.length; i++) {
    const e = parsed[i];
    if (!e || e.type !== 'usage.record') continue;
    addUsage(totals, e.usage);
    totals.turns; // turns counted from prompts below
    if (e.model) models.add(e.model);
    if (i > lastPromptIdx) addUsage(lastTurn, e.usage);
  }
  totals.turns = parsed.filter(e => e && e.type === 'turn.prompt').length;
  return { totals, lastTurn, models: [...models] };
}

function inputTotal(t) { return t.inputOther + t.cacheRead + t.cacheCreation; }

function cacheHitRate(t) {
  const inp = inputTotal(t);
  return inp > 0 ? t.cacheRead / inp : 0;
}

function loadRates() {
  try {
    if (fs.existsSync(RATES_FILE)) return JSON.parse(fs.readFileSync(RATES_FILE, 'utf-8'));
  } catch { /* ignore */ }
  return null; // no rates configured -> no dollar estimate (avoids fabricated cost)
}

// Cost per 1M tokens. Only used if the user configured rates.
function estimateCost(t, rates) {
  if (!rates) return null;
  const inRate = rates.inputPerMtok || 0;
  const outRate = rates.outputPerMtok || 0;
  const cacheRate = rates.cacheReadPerMtok != null ? rates.cacheReadPerMtok : inRate * 0.1;
  const cost = (t.inputOther / 1e6) * inRate
    + (t.cacheCreation / 1e6) * inRate
    + (t.cacheRead / 1e6) * cacheRate
    + (t.output / 1e6) * outRate;
  return cost;
}

function collectPerSession() {
  const wires = walkWires(path.join(CONFIG.KIMI1_HOME, 'sessions'));
  return wires.map(w => {
    const { totals, models } = parseWireUsage(w.wirePath);
    return { sessionId: w.sessionId, totals, models };
  });
}

function grandTotals(perSession) {
  const g = emptyTotals();
  for (const s of perSession) {
    g.inputOther += s.totals.inputOther;
    g.output += s.totals.output;
    g.cacheRead += s.totals.cacheRead;
    g.cacheCreation += s.totals.cacheCreation;
    g.turns += s.totals.turns;
  }
  return g;
}

// Context window fill for a session, as a fraction of the model's max context.
function contextFill(wirePath, maxContext) {
  const { lastTurn } = parseWireUsage(wirePath);
  const used = inputTotal(lastTurn);
  const max = maxContext || 262144;
  return { used, max, fraction: max > 0 ? used / max : 0 };
}

module.exports = {
  RATES_FILE,
  parseWireUsage,
  collectPerSession,
  grandTotals,
  inputTotal,
  cacheHitRate,
  loadRates,
  estimateCost,
  contextFill,
  emptyTotals,
  addUsage
};
