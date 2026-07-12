const { spawn } = require('child_process');
const path = require('path');
const chalk = require('chalk');
const CONFIG = require('./config');
const { buildPrompt } = require('./prompt-builder');
const { installSkill, removeSkill } = require('./skill-manager');
const { formatHeader, formatError, formatSuccess, formatInfo, prettyPrint } = require('./formatter');
const { saveSessionTitleByPrompt } = require('./history');
const { compactSession, compactLatestSession } = require('./session-compactor');
const { getCachedResponse, setCachedResponse } = require('./response-cache');

function ensureKimi1Env() {
  CONFIG.setupKimi1Home();
  return { ...process.env, KIMI_CODE_HOME: CONFIG.KIMI1_HOME };
}

function tailLines(text, n) {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length <= n) return lines.join('\n');
  return lines.slice(-n).join('\n');
}

function getArgValue(args, flags) {
  for (const flag of flags) {
    const idx = args.indexOf(flag);
    if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  }
  return null;
}

function isContinuation(args) {
  return args.includes('-c') || args.includes('--continue') ||
         args.includes('-S') || args.includes('--session');
}

function compactBeforeContinue(args) {
  const sessionId = getArgValue(args, ['-S', '--session']);
  let result;
  if (sessionId) {
    result = compactSession(sessionId);
  } else if (args.includes('-c') || args.includes('--continue')) {
    result = compactLatestSession();
  }
  if (result && result.compacted) {
    console.log(formatInfo(
      `Session context compacted: ${(result.originalSize / 1024).toFixed(1)} KB -> ${(result.newSize / 1024).toFixed(1)} KB (${result.droppedEvents} events dropped)`
    ));
  }
}

function runKimi(prompt) {
  return new Promise((resolve) => {
    const args = ['-p', prompt, '--output-format', 'text'];
    const child = spawn(CONFIG.KIMI_EXE, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: ensureKimi1Env()
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

async function runWithAutoFix(userPrompt, context, options = {}) {
  const { fix = false, compress = false, cache = false } = options;

  console.log(formatHeader('kimi1 wrapper active'));

  // Always run from an isolated home with strict loop_control.
  ensureKimi1Env();

  const finalPrompt = buildPrompt(userPrompt, context, {
    compress: compress || false
  });

  // Optional response cache for repeated prompts.
  if (cache) {
    const cached = getCachedResponse(finalPrompt);
    if (cached) {
      console.log(formatInfo('Respuesta recuperada de cache.'));
      console.log(prettyPrint(cached));
      return;
    }
  }

  // 1. Single attempt
  const firstResult = await runKimi(finalPrompt);

  if (firstResult.stdout) {
    console.log(prettyPrint(firstResult.stdout));
  }

  const success = firstResult.code === 0 && !firstResult.stderr;

  if (success) {
    if (cache) setCachedResponse(finalPrompt, firstResult.stdout);
    console.log(formatSuccess('Execution completed.'));
    saveSessionTitleByPrompt(userPrompt, process.cwd());
    return;
  }

  if (!fix) {
    console.log(formatError('Execution failed. Use --fix to retry with auto-correction.'));
    saveSessionTitleByPrompt(userPrompt, process.cwd());
    return;
  }

  // 2. Single correction attempt (opt-in)
  const errorSnippet = tailLines(firstResult.stderr || firstResult.stdout || 'Unknown error', CONFIG.ERROR_TAIL_LINES);
  console.log(formatError('Error detected:'));
  console.log(errorSnippet);

  const correctionPrompt = buildPrompt(userPrompt, context, {
    autoFix: true,
    previousError: errorSnippet,
    previousOutput: firstResult.stdout,
    compress: true
  });

  console.log(formatInfo('Running single correction attempt...'));
  const finalResult = await runKimi(correctionPrompt);

  if (finalResult.stdout) {
    console.log(prettyPrint(finalResult.stdout));
  }

  if (finalResult.code === 0 && !finalResult.stderr) {
    if (cache) setCachedResponse(correctionPrompt, finalResult.stdout);
    console.log(formatSuccess('Correction applied.'));
  } else {
    console.log(formatError('Correction failed. Manual review required.'));
  }

  saveSessionTitleByPrompt(userPrompt, process.cwd());
}

function showSplash() {
  return new Promise(resolve => {
    console.clear();
    console.log('\n\n');
    console.log(chalk.cyan.bold('  ╔═══════════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('  ║                                           ║'));
    console.log(chalk.cyan.bold('  ║         K I M I 1   A C T I V E           ║'));
    console.log(chalk.cyan.bold('  ║                                           ║'));
    console.log(chalk.cyan.bold('  ╚═══════════════════════════════════════════╝'));
    console.log('\n');
    setTimeout(() => {
      console.clear();
      resolve();
    }, 1000);
  });
}

async function launchWithArgs(args, context) {
  if (args.length === 0) {
    await showSplash();
  }

  return new Promise((resolve) => {
    ensureKimi1Env();

    // If the user is continuing a session, aggressively compact old loop events
    // before the binary loads the wire and starts burning tokens.
    if (isContinuation(args)) {
      compactBeforeContinue(args);
    }

    installSkill();

    const child = spawn(CONFIG.KIMI_EXE, args, {
      stdio: 'inherit',
      windowsHide: false,
      env: ensureKimi1Env()
    });

    function cleanup() {
      removeSkill();
    }

    child.on('close', (code) => {
      cleanup();
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

module.exports = { runWithAutoFix, launchWithArgs, launchInteractive, tailLines };
