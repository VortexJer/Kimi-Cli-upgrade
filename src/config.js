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

  // config.toml: copy from official home and enforce loop_control limits
  const srcConfig = path.join(KIMI_HOME, 'config.toml');
  const dstConfig = path.join(KIMI1_HOME, 'config.toml');
  if (shouldCopy(srcConfig, dstConfig)) {
    let toml = fs.readFileSync(srcConfig, 'utf-8');
    if (!/^\[loop_control\]$/m.test(toml)) {
      toml += '\n[loop_control]\nmax_steps_per_turn = 5\nmax_retries_per_step = 1\nreserved_context_size = 8192\n';
    } else {
      // Preserve user's max_steps choice (do not downgrade); only ensure values exist.
      if (!/^max_steps_per_turn\s*=/m.test(toml)) {
        toml = toml.replace(/^\[loop_control\]$/m, '[loop_control]\nmax_steps_per_turn = 5');
      }
      toml = toml.replace(/^max_retries_per_step\s*=\s*\S.*$/m, 'max_retries_per_step = 1');
      if (!/^reserved_context_size\s*=/m.test(toml)) {
        toml = toml.replace(/^(\[loop_control\][\s\S]*?)(?=\n\[|\n*$)/, '$1reserved_context_size = 8192\n');
      }
    }
    fs.writeFileSync(dstConfig, toml, 'utf-8');
  }

  // thinking: default to off to save tokens; user can re-enable with --thinking on.
  // Only apply the default once via a marker so explicit user changes are preserved.
  const thinkingMarker = path.join(KIMI1_HOME, '.thinking-default-set');
  if (!fs.existsSync(thinkingMarker)) {
    let isolatedToml = fs.readFileSync(dstConfig, 'utf-8');
    if (!/^\[thinking\]$/m.test(isolatedToml)) {
      isolatedToml += '\n[thinking]\nenabled = false\n';
    } else {
      isolatedToml = isolatedToml.replace(/^enabled\s*=\s*\S.*$/m, 'enabled = false');
    }
    fs.writeFileSync(dstConfig, isolatedToml, 'utf-8');
    fs.writeFileSync(thinkingMarker, '1', 'utf-8');
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
  const match = toml.match(/^max_steps_per_turn\s*=\s*(\d+)/m);
  return match ? parseInt(match[1], 10) : EFFECTIVE_MAX_STEPS;
}

function setMaxSteps(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`Valor invalido para max_steps_per_turn: ${value}. Debe ser un entero >= 1.`);
  }
  setupKimi1Home();
  const configPath = path.join(KIMI1_HOME, 'config.toml');
  let toml = fs.readFileSync(configPath, 'utf-8');
  if (!/^\[loop_control\]$/m.test(toml)) {
    toml += `\n[loop_control]\nmax_steps_per_turn = ${n}\n`;
  } else {
    toml = toml.replace(/^max_steps_per_turn\s*=\s*\S.*$/m, `max_steps_per_turn = ${n}`);
  }
  fs.writeFileSync(configPath, toml, 'utf-8');
  return n;
}

function getThinking() {
  const toml = readIsolatedConfig();
  if (!toml) return false;
  const match = toml.match(/^enabled\s*=\s*(true|false)/m);
  return match ? match[1] === 'true' : false;
}

function setThinking(value) {
  const normalized = String(value).toLowerCase().trim();
  if (!['true', 'false', 'on', 'off', '1', '0'].includes(normalized)) {
    throw new Error(`Valor invalido para thinking.enabled: ${value}. Usa true/false.`);
  }
  const bool = ['true', 'on', '1'].includes(normalized);
  setupKimi1Home();
  const configPath = path.join(KIMI1_HOME, 'config.toml');
  let toml = fs.readFileSync(configPath, 'utf-8');
  if (!/^\[thinking\]$/m.test(toml)) {
    toml += `\n[thinking]\nenabled = ${bool}\n`;
  } else {
    toml = toml.replace(/^enabled\s*=\s*\S.*$/m, `enabled = ${bool}`);
  }
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
  PROJECT_DIR: path.join(HOME, 'kimi-cli-upgrade'),
  MAX_RETRIES: 3,
  MAX_CONTINUATIONS: 5,
  ERROR_TAIL_LINES: 20,
  WIRE_COMPACT_THRESHOLD_BYTES: 200 * 1024, // 200 KB
  CONTEXT_FILES: [
    'KIMI.md',
    '.ai-shared-context.md',
    '.globalcontext.md'
  ]
};

module.exports = CONFIG;
