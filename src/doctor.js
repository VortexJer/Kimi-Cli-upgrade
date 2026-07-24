const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const CONFIG = require('./config');
const { isRedirectEnabled } = require('./profile-manager');

// Health check for the wrapper + the underlying kimi binary. Returns a list of
// { name, value, level } where level is 'ok' | 'warn' | 'error' | 'info'.

function kimiVersion() {
  try {
    return execFileSync(CONFIG.KIMI_EXE, ['--version'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\s+/)[0];
  } catch {
    return null;
  }
}

function cmp(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
  return 0;
}

function countSessions() {
  const idx = path.join(CONFIG.KIMI1_HOME, 'session_index.jsonl');
  try {
    return fs.readFileSync(idx, 'utf-8').split(/\r?\n/).filter(Boolean).length;
  } catch { return 0; }
}

function runDoctor() {
  const checks = [];

  const ver = kimiVersion();
  if (!ver) {
    checks.push({ name: 'kimi binary', value: `NOT FOUND at ${CONFIG.KIMI_EXE}`, level: 'error' });
  } else {
    const old = cmp(ver, '0.29.0') < 0;
    checks.push({ name: 'kimi version', value: ver + (old ? '  (upgrade for [tools] support: kimi upgrade)' : ''), level: old ? 'warn' : 'ok' });
  }

  checks.push({ name: 'node version', value: process.version, level: 'ok' });

  // Isolated config
  try {
    checks.push({ name: 'thinking', value: CONFIG.getThinking() ? 'on' : 'off (token-saving)', level: 'ok' });
    checks.push({ name: 'max_steps_per_turn', value: String(CONFIG.getMaxSteps()), level: 'ok' });
    const dis = CONFIG.getDisabledTools();
    checks.push({ name: 'tools', value: dis.length ? `lean (${dis.length} disabled)` : 'full', level: 'info' });
  } catch (err) {
    checks.push({ name: 'isolated config', value: 'unreadable: ' + err.message, level: 'error' });
  }

  // Credentials in the isolated home
  const cred = path.join(CONFIG.KIMI1_HOME, 'credentials');
  checks.push({
    name: 'credentials',
    value: fs.existsSync(cred) ? 'present' : 'MISSING (run: kimi login)',
    level: fs.existsSync(cred) ? 'ok' : 'error'
  });

  // Redirect
  checks.push({ name: 'kimi -> kimi1 redirect', value: isRedirectEnabled() ? 'enabled' : 'disabled', level: 'info' });

  // Sessions
  checks.push({ name: 'sessions tracked', value: String(countSessions()), level: 'info' });

  // Isolated home path
  checks.push({ name: 'isolated home', value: CONFIG.KIMI1_HOME, level: 'info' });

  return checks;
}

module.exports = { runDoctor, kimiVersion };
