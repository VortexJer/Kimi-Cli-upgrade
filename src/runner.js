const { spawn } = require('child_process');
const CONFIG = require('./config');
const { buildPrompt } = require('./prompt-builder');
const { installSkill, removeSkill } = require('./skill-manager');
const { formatHeader, formatError, formatSuccess, formatInfo, prettyPrint } = require('./formatter');
const { autoRenameLatestSession } = require('./history');

function tailLines(text, n) {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length <= n) return lines.join('\n');
  return lines.slice(-n).join('\n');
}

function pruneHistory(history) {
  // Keep only the latest user prompt, the latest assistant response, and any error turns.
  if (history.length <= 2) return history;
  const lastUser = history.filter(h => h.role === 'user').pop();
  const lastAssistant = history.filter(h => h.role === 'assistant').pop();
  const errors = history.filter(h => h.role === 'error');
  const pruned = [];
  if (lastUser) pruned.push(lastUser);
  if (lastAssistant) pruned.push(lastAssistant);
  pruned.push(...errors);
  return pruned;
}

function runKimi(prompt) {
  return new Promise((resolve) => {
    const args = ['-p', prompt, '--output-format', 'text'];
    const child = spawn(CONFIG.KIMI_EXE, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ stdout, stderr, code });
    });

    child.on('error', (err) => {
      resolve({ stdout, stderr: err.message, code: 1 });
    });
  });
}

async function runWithAutoFix(userPrompt, context) {
  let history = [];
  let currentPrompt = buildPrompt(userPrompt, context, { history });
  let retries = 0;

  console.log(formatHeader('kimi1 wrapper active'));

  while (retries <= CONFIG.MAX_RETRIES) {
    history.push({ role: 'user', content: currentPrompt });
    const result = await runKimi(currentPrompt);

    // Pretty-print stdout from Kimi
    if (result.stdout) {
      console.log(prettyPrint(result.stdout));
    }

    if (result.code === 0 && !result.stderr) {
      history.push({ role: 'assistant', content: result.stdout });
      console.log(formatSuccess('Execution completed.'));
      await autoRenameLatestSession(process.cwd());
      return;
    }

    // Error detected -> auto-fix loop
    const errorSnippet = tailLines(result.stderr || result.stdout || 'Unknown error', CONFIG.ERROR_TAIL_LINES);
    history.push({ role: 'error', content: errorSnippet });

    console.log(formatError(`Error detected (attempt ${retries + 1}/${CONFIG.MAX_RETRIES + 1}):`));
    console.log(errorSnippet);

    if (retries >= CONFIG.MAX_RETRIES) {
      console.log(formatError('Max retries reached. Stopping auto-fix loop.'));
      await autoRenameLatestSession(process.cwd());
      return;
    }

    // Build next prompt with auto-fix context, compressed and filtered by relevance
    history = pruneHistory(history);
    currentPrompt = buildPrompt(userPrompt, context, {
      autoFix: true,
      previousError: errorSnippet,
      compress: true,
      history
    });

    retries++;
  }
}

function launchWithArgs(args, context) {
  return new Promise((resolve) => {
    const skillPath = installSkill(context);
    console.log(formatInfo('Contexto local inyectado via skill temporal.'));
    console.log(formatInfo(`Skill: ${skillPath}`));

    const child = spawn(CONFIG.KIMI_EXE, args, {
      stdio: 'inherit',
      windowsHide: false
    });

    function cleanup() {
      removeSkill();
      autoRenameLatestSession(process.cwd());
      console.log(formatInfo('Skill temporal de kimi1 eliminado.'));
    }

    child.on('close', async (code) => {
      cleanup();
      await autoRenameLatestSession(process.cwd());
      resolve(code);
    });

    child.on('error', (err) => {
      cleanup();
      console.error(formatError(`Failed to launch Kimi: ${err.message}`));
      resolve(1);
    });

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  });
}

function launchInteractive(context) {
  return launchWithArgs([], context);
}

module.exports = { runWithAutoFix, launchWithArgs, launchInteractive, tailLines, pruneHistory };
