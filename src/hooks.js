const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const CONFIG = require('./config');

// User-defined shell commands run around each prompt-mode turn (like Claude Code
// hooks). Stored in ~/.kimi-code-kimi1/hooks.json as { pre, post }. The command
// runs in the current working directory with its output shown. A non-zero exit
// on a pre-hook aborts the run.
const HOOKS_FILE = path.join(CONFIG.KIMI1_HOME, 'hooks.json');

function loadHooks() {
  try {
    if (fs.existsSync(HOOKS_FILE)) return JSON.parse(fs.readFileSync(HOOKS_FILE, 'utf-8'));
  } catch { /* ignore */ }
  return {};
}

function setHook(type, cmd) {
  CONFIG.setupKimi1Home();
  const hooks = loadHooks();
  if (cmd) hooks[type] = cmd; else delete hooks[type];
  fs.writeFileSync(HOOKS_FILE, JSON.stringify(hooks, null, 2), 'utf-8');
  return hooks;
}

// Run a hook. Returns true if it may proceed (pre-hook succeeded or no hook),
// false if a pre-hook failed and the run should abort.
function runHook(type, cwd) {
  const cmd = loadHooks()[type];
  if (!cmd) return true;
  try {
    execSync(cmd, { cwd, stdio: 'inherit' });
    return true;
  } catch (err) {
    return type !== 'pre'; // a failing pre-hook aborts; post-hook failure is non-fatal
  }
}

module.exports = { HOOKS_FILE, loadHooks, setHook, runHook };
