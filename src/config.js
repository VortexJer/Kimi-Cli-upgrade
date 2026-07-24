const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const HOME = os.homedir();
const PLATFORM = os.platform();

function findKimiExecutable() {
  // 1. Try PATH first
  try {
    const cmd = PLATFORM === 'win32' ? 'where.exe kimi' : 'which kimi';
    const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (output) {
      const first = output.split(/\r?\n/)[0].trim();
      if (first) return first;
    }
  } catch (err) {
    // ignore
  }

  // 2. Common install locations
  const candidates = [];
  if (PLATFORM === 'win32') {
    candidates.push(path.join(HOME, '.kimi-code', 'bin', 'kimi.exe'));
  } else if (PLATFORM === 'darwin') {
    candidates.push(path.join(HOME, '.kimi-code', 'bin', 'kimi'));
    candidates.push('/usr/local/bin/kimi');
    candidates.push('/opt/homebrew/bin/kimi');
  } else {
    candidates.push(path.join(HOME, '.kimi-code', 'bin', 'kimi'));
    candidates.push('/usr/local/bin/kimi');
    candidates.push('/usr/bin/kimi');
  }

  for (const candidate of candidates) {
    try {
      const stats = require('fs').statSync(candidate);
      if (stats.isFile()) return candidate;
    } catch (err) {
      // ignore
    }
  }

  // Fallback for error messaging
  return PLATFORM === 'win32'
    ? path.join(HOME, '.kimi-code', 'bin', 'kimi.exe')
    : path.join(HOME, '.kimi-code', 'bin', 'kimi');
}

const KIMI_EXE = findKimiExecutable();

// Isolated home for the kimi1 wrapper. Keeps the official ~/.kimi-code untouched
// and lets us inject a stricter loop_control configuration.
const KIMI_HOME = path.join(HOME, '.kimi-code');
const KIMI1_HOME = path.join(HOME, '.kimi-code-kimi1');

// --- Section-scoped TOML helpers -------------------------------------------
// The isolated config is edited in place. Editing keys with a plain
// line-anchored regex (e.g. /^enabled\s*=/m) matches the FIRST occurrence in
// ANY table, so a `[telemetry] enabled = true` above `[thinking]` would get
// clobbered. These helpers restrict read/write to the target section only.

function readTomlKey(toml, section, key) {
  const lines = toml.split(/\r?\n/);
  const header = `[${section}]`;
  const keyRe = new RegExp(`^${key}\\s*=\\s*(\\S+)`);
  let inSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === header) { inSection = true; continue; }
    if (inSection && /^\[.+\]$/.test(trimmed)) break; // next table
    if (inSection) {
      const m = trimmed.match(keyRe);
      if (m) return m[1];
    }
  }
  return null;
}

function editTomlKey(toml, section, key, value) {
  const lines = toml.split(/\r?\n/);
  const header = `[${section}]`;
  const keyRe = new RegExp(`^${key}\\s*=`);
  let sectionStart = -1;
  let keyLineIdx = -1;
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === header) { inSection = true; sectionStart = i; continue; }
    if (inSection && /^\[.+\]$/.test(trimmed)) break; // next table
    if (inSection && keyRe.test(trimmed)) { keyLineIdx = i; break; }
  }
  if (sectionStart === -1) {
    const nl = toml.endsWith('\n') || toml === '' ? '' : '\n';
    return `${toml}${nl}[${section}]\n${key} = ${value}\n`;
  }
  if (keyLineIdx !== -1) {
    lines[keyLineIdx] = `${key} = ${value}`;
  } else {
    lines.splice(sectionStart + 1, 0, `${key} = ${value}`);
  }
  return lines.join('\n');
}

function copyDirRecursive(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else {
      try {
        fs.copyFileSync(srcPath, dstPath);
      } catch (err) {
        // ignore individual credential copy failures
      }
    }
  }
}

function shouldCopy(src, dst) {
  return fs.existsSync(src) && (!fs.existsSync(dst) || fs.statSync(src).mtime > fs.statSync(dst).mtime);
}

function setupKimi1Home() {
  // Directory skeleton (credentials handled separately)
  for (const d of ['bin', 'sessions', 'skills', 'logs', 'telemetry', 'updates', 'user-history']) {
    fs.mkdirSync(path.join(KIMI1_HOME, d), { recursive: true });
  }

  // config.toml: SEED ONCE from the official config, then it becomes the
  // wrapper's own file. It is deliberately NOT re-copied when the official
  // config changes: an mtime-based re-copy would silently clobber the wrapper's
  // token-saving settings (thinking off, low max_steps) every time the official
  // kimi touched its config. To pull in new official models/providers later,
  // delete the isolated config or run --restore-official-config.
  const srcConfig = path.join(KIMI_HOME, 'config.toml');
  const dstConfig = path.join(KIMI1_HOME, 'config.toml');
  if (!fs.existsSync(dstConfig) && fs.existsSync(srcConfig)) {
    let toml = fs.readFileSync(srcConfig, 'utf-8');
    // Token-saving defaults, applied once at seed time. User overrides via
    // --max-steps / --thinking persist afterwards (never clobbered).
    toml = editTomlKey(toml, 'loop_control', 'max_steps_per_turn', 5);
    toml = editTomlKey(toml, 'loop_control', 'max_retries_per_step', 1);
    toml = editTomlKey(toml, 'loop_control', 'reserved_context_size', 8192);
    toml = editTomlKey(toml, 'thinking', 'enabled', 'false');
    // NOTE: tools are NOT trimmed by default. Measured impact of [tools] disabled
    // is negligible (the schemas are served from cache), so the full toolset stays
    // on to avoid removing a tool the user might want. Opt in with: kimi1 --tools lean.
    fs.writeFileSync(dstConfig, toml, 'utf-8');
  }

  // tui.toml: keep UI settings consistent
  const srcTui = path.join(KIMI_HOME, 'tui.toml');
  const dstTui = path.join(KIMI1_HOME, 'tui.toml');
  if (shouldCopy(srcTui, dstTui)) {
    fs.copyFileSync(srcTui, dstTui);
  }

  // Helper binaries used by Kimi
  for (const exe of ['rg.exe', 'fd.exe']) {
    const src = path.join(KIMI_HOME, 'bin', exe);
    const dst = path.join(KIMI1_HOME, 'bin', exe);
    if (shouldCopy(src, dst)) fs.copyFileSync(src, dst);
  }

  // Credentials: try a junction first (no extra disk use), fall back to copy.
  const srcCred = path.join(KIMI_HOME, 'credentials');
  const dstCred = path.join(KIMI1_HOME, 'credentials');
  if (!fs.existsSync(dstCred) && fs.existsSync(srcCred)) {
    try {
      fs.symlinkSync(srcCred, dstCred, 'junction');
    } catch (err) {
      copyDirRecursive(srcCred, dstCred);
    }
  }

  // device_id so the isolated home does not register as a new device every run
  const srcDev = path.join(KIMI_HOME, 'device_id');
  const dstDev = path.join(KIMI1_HOME, 'device_id');
  if (shouldCopy(srcDev, dstDev)) fs.copyFileSync(srcDev, dstDev);

  return KIMI1_HOME;
}

function readIsolatedConfig() {
  setupKimi1Home();
  const configPath = path.join(KIMI1_HOME, 'config.toml');
  if (!fs.existsSync(configPath)) return null;
  return fs.readFileSync(configPath, 'utf-8');
}

function writeIsolatedConfig(toml) {
  const configPath = path.join(KIMI1_HOME, 'config.toml');
  fs.writeFileSync(configPath, toml, 'utf-8');
}

// Kimi binary has been observed to cap max_steps_per_turn at 5, but the user
// can still request a higher value in case their binary/plan allows it.
const EFFECTIVE_MAX_STEPS = 5;

function getMaxSteps() {
  const toml = readIsolatedConfig();
  if (!toml) return EFFECTIVE_MAX_STEPS;
  const val = readTomlKey(toml, 'loop_control', 'max_steps_per_turn');
  return val && /^\d+$/.test(val) ? parseInt(val, 10) : EFFECTIVE_MAX_STEPS;
}

function applyMaxStepsToConfig(configPath, n) {
  let toml;
  try {
    toml = fs.readFileSync(configPath, 'utf-8');
  } catch (err) {
    return false;
  }
  toml = editTomlKey(toml, 'loop_control', 'max_steps_per_turn', n);
  fs.writeFileSync(configPath, toml, 'utf-8');
  return true;
}

const OFFICIAL_CONFIG_BACKUP = path.join(KIMI1_HOME, 'official-config-backup.toml');

const COMPACT_MODE_MARKER = path.join(KIMI1_HOME, '.compact-reminder-mode');

const COMPACT_MODES = {
  OFF: 'off',
  SAFE: 'safe',
  AGGRESSIVE: 'aggressive'
};

const COMPACT_THRESHOLDS = {
  [COMPACT_MODES.SAFE]: { messages: 24, wireSizeMB: 1.0 },
  [COMPACT_MODES.AGGRESSIVE]: { messages: 12, wireSizeMB: 0.5 }
};

function getCompactMode() {
  if (!fs.existsSync(COMPACT_MODE_MARKER)) return COMPACT_MODES.OFF;
  const mode = fs.readFileSync(COMPACT_MODE_MARKER, 'utf-8').trim();
  return Object.values(COMPACT_MODES).includes(mode) ? mode : COMPACT_MODES.OFF;
}

function setCompactMode(mode) {
  const normalized = Object.values(COMPACT_MODES).includes(mode) ? mode : COMPACT_MODES.OFF;
  setupKimi1Home();
  if (normalized === COMPACT_MODES.OFF) {
    try { fs.unlinkSync(COMPACT_MODE_MARKER); } catch {}
  } else {
    fs.writeFileSync(COMPACT_MODE_MARKER, normalized, 'utf-8');
  }
  return normalized;
}

function shouldCompact(wirePath) {
  const mode = getCompactMode();
  if (mode === COMPACT_MODES.OFF) return false;
  if (!fs.existsSync(wirePath)) return false;

  const thresholds = COMPACT_THRESHOLDS[mode];
  const sizeMB = fs.statSync(wirePath).size / (1024 * 1024);
  if (sizeMB >= thresholds.wireSizeMB) return true;

  // Count user+assistant messages
  const raw = fs.readFileSync(wirePath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  let messageCount = 0;
  for (const line of lines) {
    try {
      const evt = JSON.parse(line);
      if (evt.type === 'context.append_message') messageCount++;
    } catch {}
  }
  return messageCount >= thresholds.messages;
}

function backupOfficialConfig() {
  const officialConfigPath = path.join(KIMI_HOME, 'config.toml');
  if (!fs.existsSync(officialConfigPath)) return false;
  setupKimi1Home();
  fs.copyFileSync(officialConfigPath, OFFICIAL_CONFIG_BACKUP);
  return true;
}

function restoreOfficialConfig() {
  if (!fs.existsSync(OFFICIAL_CONFIG_BACKUP)) return false;
  const officialConfigPath = path.join(KIMI_HOME, 'config.toml');
  fs.copyFileSync(OFFICIAL_CONFIG_BACKUP, officialConfigPath);
  return true;
}

function syncOfficialConfigFromIsolated() {
  setupKimi1Home();
  const isolatedConfigPath = path.join(KIMI1_HOME, 'config.toml');
  const officialConfigPath = path.join(KIMI_HOME, 'config.toml');
  if (!fs.existsSync(isolatedConfigPath)) return false;
  fs.copyFileSync(isolatedConfigPath, officialConfigPath);
  return true;
}

function resetOfficialConfigToDefaults() {
  const officialConfigPath = path.join(KIMI_HOME, 'config.toml');
  if (!fs.existsSync(officialConfigPath)) return false;
  let toml = fs.readFileSync(officialConfigPath, 'utf-8');
  toml = editTomlKey(toml, 'loop_control', 'max_steps_per_turn', 1000);
  toml = editTomlKey(toml, 'thinking', 'enabled', 'true');
  fs.writeFileSync(officialConfigPath, toml, 'utf-8');
  return true;
}

function setMaxSteps(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`Invalid max_steps_per_turn: ${value}. Must be an integer >= 1.`);
  }
  setupKimi1Home();

  // Only touch the isolated config here. Official config is synced only when
  // the kimi -> kimi1 redirect is explicitly enabled.
  const isolatedConfigPath = path.join(KIMI1_HOME, 'config.toml');
  applyMaxStepsToConfig(isolatedConfigPath, n);

  return n;
}

// Tools disabled by default to shrink the per-turn fixed cost. Each tool's JSON
// schema is sent to the model on EVERY turn (~18k tokens for the full 26-tool
// set in kimi 0.28). Disabling the ones a local coding workflow rarely needs
// removes their schemas from the request. NOTE: the [tools] config is only
// honored by kimi >= 0.29.0 — on older binaries this is a harmless no-op.
// The heavy, rarely-needed schemas: Cron* (~12KB), Goal/Budget* (~6KB),
// AgentSwarm, media/web/plan tools, and AskUserQuestion (useless in -p mode).
// Kept on: Read, Write, Edit, Grep, Glob, Bash, Agent, Task*, TodoList, Skill.
const LEAN_DISABLED_TOOLS = [
  'ReadMediaFile', 'FetchURL', 'WebSearch',
  'EnterPlanMode', 'ExitPlanMode', 'AskUserQuestion',
  'CronCreate', 'CronList', 'CronDelete',
  'CreateGoal', 'GetGoal', 'SetGoalBudget', 'UpdateGoal',
  'AgentSwarm'
];

function tomlStringArray(list) {
  return '[' + list.map(s => `"${s}"`).join(', ') + ']';
}

function getDisabledTools() {
  const toml = readIsolatedConfig();
  if (!toml) return [];
  const lines = toml.split(/\r?\n/);
  let inTools = false;
  for (const line of lines) {
    const t = line.trim();
    if (t === '[tools]') { inTools = true; continue; }
    if (inTools && /^\[.+\]$/.test(t)) break;
    if (inTools) {
      const m = t.match(/^disabled\s*=\s*(\[[^\]]*\])/);
      if (m) {
        try { return JSON.parse(m[1]); } catch { return []; }
      }
    }
  }
  return [];
}

function setDisabledTools(list) {
  setupKimi1Home();
  const configPath = path.join(KIMI1_HOME, 'config.toml');
  let toml = fs.readFileSync(configPath, 'utf-8');
  toml = editTomlKey(toml, 'tools', 'disabled', tomlStringArray(list));
  fs.writeFileSync(configPath, toml, 'utf-8');
  return list;
}

function getModel() {
  const toml = readIsolatedConfig();
  if (!toml) return null;
  const m = toml.match(/^default_model\s*=\s*"([^"]+)"/m);
  return m ? m[1] : null;
}

const EFFORT_LEVELS = ['low', 'high', 'max'];

function getEffort() {
  const toml = readIsolatedConfig();
  if (!toml) return null;
  const v = readTomlKey(toml, 'thinking', 'effort');
  return v ? v.replace(/^"|"$/g, '') : null;
}

// Reasoning effort for models that support it (fewer tokens on 'low').
function setEffort(value) {
  const v = String(value).toLowerCase().trim();
  if (!EFFORT_LEVELS.includes(v)) {
    throw new Error(`Invalid effort: ${value}. Use one of ${EFFORT_LEVELS.join('/')}.`);
  }
  setupKimi1Home();
  const configPath = path.join(KIMI1_HOME, 'config.toml');
  let toml = fs.readFileSync(configPath, 'utf-8');
  toml = editTomlKey(toml, 'thinking', 'effort', `"${v}"`);
  fs.writeFileSync(configPath, toml, 'utf-8');
  return v;
}

function setModel(alias) {
  setupKimi1Home();
  const configPath = path.join(KIMI1_HOME, 'config.toml');
  let toml = fs.readFileSync(configPath, 'utf-8');
  if (/^default_model\s*=/m.test(toml)) {
    toml = toml.replace(/^default_model\s*=.*$/m, `default_model = "${alias}"`);
  } else {
    toml = `default_model = "${alias}"\n` + toml;
  }
  fs.writeFileSync(configPath, toml, 'utf-8');
  return alias;
}

function listModels() {
  const toml = readIsolatedConfig() || '';
  const re = /^\[models\."([^"]+)"\]/gm;
  const out = [];
  let m;
  while ((m = re.exec(toml)) !== null) out.push(m[1]);
  return out;
}

function getThinking() {
  const toml = readIsolatedConfig();
  if (!toml) return false;
  return readTomlKey(toml, 'thinking', 'enabled') === 'true';
}

function setThinking(value) {
  const normalized = String(value).toLowerCase().trim();
  if (!['true', 'false', 'on', 'off', '1', '0'].includes(normalized)) {
    throw new Error(`Invalid thinking.enabled: ${value}. Use true/false.`);
  }
  const bool = ['true', 'on', '1'].includes(normalized);
  setupKimi1Home();
  // Only touch the isolated config here. Official config is synced only when
  // the kimi -> kimi1 redirect is explicitly enabled.
  const configPath = path.join(KIMI1_HOME, 'config.toml');
  let toml = fs.readFileSync(configPath, 'utf-8');
  toml = editTomlKey(toml, 'thinking', 'enabled', bool);
  fs.writeFileSync(configPath, toml, 'utf-8');
  return bool;
}

const CONFIG = {
  KIMI_EXE,
  KIMI_HOME,
  KIMI1_HOME,
  setupKimi1Home,
  getMaxSteps,
  setMaxSteps,
  EFFECTIVE_MAX_STEPS,
  getThinking,
  setThinking,
  getModel,
  setModel,
  listModels,
  getEffort,
  setEffort,
  EFFORT_LEVELS,
  getDisabledTools,
  setDisabledTools,
  LEAN_DISABLED_TOOLS,
  backupOfficialConfig,
  restoreOfficialConfig,
  syncOfficialConfigFromIsolated,
  resetOfficialConfigToDefaults,
  COMPACT_MODES,
  COMPACT_THRESHOLDS,
  getCompactMode,
  setCompactMode,
  shouldCompact,
  PROJECT_DIR: path.join(HOME, 'kimi-cli-upgrade'),
  FAST_MODEL: 'kimi-code/kimi-for-coding-highspeed',
  MODEL_MAX_CONTEXT: 262144,
  MAX_CONTINUATIONS: 5,
  ERROR_TAIL_LINES: 20,
  CONTEXT_FILES: [
    'KIMI.md',
    '.ai-shared-context.md',
    '.globalcontext.md'
  ]
};

module.exports = CONFIG;
