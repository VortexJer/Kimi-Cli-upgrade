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

const CONFIG = {
  KIMI_EXE,
  PROJECT_DIR: path.join(HOME, 'kimi-cli-upgrade'),
  MAX_RETRIES: 3,
  ERROR_TAIL_LINES: 20,
  CONTEXT_FILES: [
    'KIMI.md',
    '.ai-shared-context.md',
    '.globalcontext.md'
  ]
};

module.exports = CONFIG;
