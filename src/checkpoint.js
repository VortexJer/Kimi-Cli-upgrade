const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const CONFIG = require('./config');

// Lightweight, git-based checkpoints so a prompt-mode run can be reviewed
// (--diff) or rolled back (--undo). A checkpoint is a snapshot TREE of the whole
// working directory (tracked + untracked) captured via a throwaway index, so it
// never touches the user's real index or working tree.
const CHECKPOINTS = path.join(CONFIG.KIMI1_HOME, 'checkpoints.jsonl');

function git(args, cwd, extraEnv) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function isGitRepo(cwd) {
  try {
    return git(['rev-parse', '--is-inside-work-tree'], cwd).trim() === 'true';
  } catch {
    return false;
  }
}

function snapshotTree(cwd) {
  const tmpIndex = path.join(os.tmpdir(), `kimi1-idx-${process.pid}-${Date.now()}`);
  try {
    git(['add', '-A'], cwd, { GIT_INDEX_FILE: tmpIndex });
    return git(['write-tree'], cwd, { GIT_INDEX_FILE: tmpIndex }).trim();
  } finally {
    try { fs.unlinkSync(tmpIndex); } catch { /* ignore */ }
  }
}

function createCheckpoint(cwd, prompt) {
  if (!isGitRepo(cwd)) return null;
  let tree;
  try { tree = snapshotTree(cwd); } catch { return null; }
  let head = null;
  try { head = git(['rev-parse', 'HEAD'], cwd).trim(); } catch { /* no commits yet */ }
  const entry = { ts: Date.now(), cwd: path.resolve(cwd), tree, head, prompt: (prompt || '').slice(0, 120) };
  try {
    CONFIG.setupKimi1Home();
    fs.appendFileSync(CHECKPOINTS, JSON.stringify(entry) + '\n', 'utf-8');
  } catch { return null; }
  return entry;
}

function lastCheckpoint(cwd) {
  if (!fs.existsSync(CHECKPOINTS)) return null;
  const lines = fs.readFileSync(CHECKPOINTS, 'utf-8').split(/\r?\n/).filter(Boolean);
  const target = path.resolve(cwd);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const e = JSON.parse(lines[i]);
      if (e.cwd && path.resolve(e.cwd) === target) return e;
    } catch { /* ignore */ }
  }
  return null;
}

function diffSince(cwd) {
  if (!isGitRepo(cwd)) return { ok: false, reason: 'not-a-git-repo' };
  const cp = lastCheckpoint(cwd);
  if (!cp) return { ok: false, reason: 'no-checkpoint' };
  let diff = '';
  try {
    // Diff the checkpoint tree against a fresh snapshot of the current working
    // dir (tracked + untracked), so newly created files show up too.
    const now = snapshotTree(cwd);
    diff = git(['--no-pager', 'diff', cp.tree, now], cwd);
  } catch (err) {
    return { ok: false, reason: err.message };
  }
  return { ok: true, diff, cp };
}

// Restore the working tree to the last checkpoint. Files that were CREATED after
// the checkpoint are not in its tree, so they are reported (not auto-deleted).
function restoreLast(cwd) {
  if (!isGitRepo(cwd)) return { ok: false, reason: 'not-a-git-repo' };
  const cp = lastCheckpoint(cwd);
  if (!cp) return { ok: false, reason: 'no-checkpoint' };
  // Files present now but absent in the checkpoint tree (i.e. created since).
  let newFiles = [];
  try {
    const now = snapshotTree(cwd);
    const changed = git(['--no-pager', 'diff', '--name-status', cp.tree, now], cwd).trim();
    newFiles = changed.split(/\r?\n/).filter(l => l.startsWith('A\t')).map(l => l.slice(2));
  } catch { /* best effort */ }
  try {
    git(['checkout', cp.tree, '--', '.'], cwd);
  } catch (err) {
    return { ok: false, reason: err.message };
  }
  return { ok: true, cp, newFiles };
}

module.exports = { CHECKPOINTS, isGitRepo, createCheckpoint, lastCheckpoint, diffSince, restoreLast };
