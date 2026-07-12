const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const CONFIG = require('./config');
const { buildPrompt } = require('./prompt-builder');
const { installSkill, removeSkill } = require('./skill-manager');
const { formatHeader, formatError, formatSuccess, formatInfo, prettyPrint } = require('./formatter');
const { saveSessionTitleByPrompt } = require('./history');
const { compactSession: manualCompactSession, compactLatestSession: manualCompactLatestSession } = require('./session-compactor');
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

function findSessionWire(sessionId) {
  const sessionsDir = path.join(CONFIG.KIMI1_HOME, 'sessions');
  if (!fs.existsSync(sessionsDir)) return null;
  const needle = sessionId ? sessionId.replace(/^session_/, '') : null;
  const wires = [];
  for (const workspace of fs.readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!workspace.isDirectory()) continue;
    const workspacePath = path.join(sessionsDir, workspace.name);
    for (const session of fs.readdirSync(workspacePath, { withFileTypes: true })) {
      if (!session.isDirectory()) continue;
      const sid = session.name;
      if (needle && !sid.includes(needle)) continue;
      const wirePath = path.join(workspacePath, sid, 'agents', 'main', 'wire.jsonl');
      if (fs.existsSync(wirePath)) {
        wires.push({ sessionId: sid, wirePath, mtime: fs.statSync(wirePath).mtimeMs });
      }
    }
  }
  if (wires.length === 0) return null;
  wires.sort((a, b) => b.mtime - a.mtime);
  return wires[0];
}

function analyzeWire(wirePath) {
  if (!fs.existsSync(wirePath)) return { sizeMB: 0, messages: 0 };
  const sizeMB = fs.statSync(wirePath).size / (1024 * 1024);
  const raw = fs.readFileSync(wirePath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  let messages = 0;
  for (const line of lines) {
    try {
      const evt = JSON.parse(line);
      if (evt.type === 'context.append_message') messages++;
    } catch {}
  }
  return { sizeMB, messages };
}

function showCompactReminder(args) {
  const mode = CONFIG.getCompactMode();
  if (mode === CONFIG.COMPACT_MODES.OFF) return;

  const sessionId = getArgValue(args, ['-S', '--session']);
  const wireInfo = sessionId
    ? findSessionWire(sessionId)
    : (args.includes('-c') || args.includes('--continue') ? findSessionWire(null) : null);

  if (!wireInfo) return;

  const thresholds = CONFIG.COMPACT_THRESHOLDS[mode];
  const stats = analyzeWire(wireInfo.wirePath);

  const sizeExceeded = stats.sizeMB >= thresholds.wireSizeMB;
  const messagesExceeded = stats.messages >= thresholds.messages;

  if (!sizeExceeded && !messagesExceeded) return;

  console.log(formatInfo(''));
  console.log(formatInfo('╭─ Session context is getting large ──────────────────────────'));
  console.log(formatInfo(`│  Mode: ${mode}`));
  console.log(formatInfo(`│  Size: ${stats.sizeMB.toFixed(2)} MB (threshold: ${thresholds.wireSizeMB} MB)`));
  console.log(formatInfo(`│  Messages: ${stats.messages} (threshold: ${thresholds.messages})`));
  console.log(formatInfo('│'));
  console.log(formatInfo('│  Tip: type /compact inside the chat to summarize old context'));
  console.log(formatInfo('│       and reduce token usage. You can also run:'));
  console.log(formatInfo('│       kimi1 --compact-session --id <sessionId>  (expert mode)'));
  console.log(formatInfo('╰─────────────────────────────────────────────────────────────'));
  console.log(formatInfo(''));
}

function runKimi(prompt, sessionId = null) {
  return new Promise((resolve) => {
    const args = sessionId
      ? ['-S', sessionId, '-p', prompt, '--output-format', 'text']
      : ['-p', prompt, '--output-format', 'text'];
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

function extractSessionId(output) {
  const match = output.match(/kimi\s+-r\s+(session_[a-f0-9-]+)/i);
  return match ? match[1] : null;
}

function isMaxStepsExceeded(output) {
  return /loop\.max_steps_exceeded|Turn exceeded maxSteps/i.test(output || '');
}

const CONTINUE_PROMPT = `The previous turn hit the max_steps_per_turn limit. Continue the same task from exactly where you stopped. Do not repeat work already completed. Use the prior context and proceed with the next pending action.`;

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
  let result = await runKimi(finalPrompt);
  let sessionId = extractSessionId(result.stdout || '');
  if (result.stdout) {
    console.log(prettyPrint(result.stdout));
  }

  // 2. Auto-continue on max_steps_exceeded (Kimi caps per-turn steps at 5)
  let continuations = 0;
  while (isMaxStepsExceeded(result.stderr || result.stdout) && continuations < CONFIG.MAX_CONTINUATIONS) {
    continuations++;
    console.log(formatInfo(`Turn hit max_steps limit. Auto-continuing (${continuations}/${CONFIG.MAX_CONTINUATIONS})...`));
    if (!sessionId) {
      console.log(formatError('Could not extract session ID for continuation.'));
      break;
    }
    result = await runKimi(CONTINUE_PROMPT, sessionId);
    sessionId = extractSessionId(result.stdout || '') || sessionId;
    if (result.stdout) {
      console.log(prettyPrint(result.stdout));
    }
  }

  const success = result.code === 0 && !result.stderr && !isMaxStepsExceeded(result.stderr || result.stdout);

  if (success) {
    if (cache) setCachedResponse(finalPrompt, result.stdout);
    console.log(formatSuccess('Execution completed.'));
    saveSessionTitleByPrompt(userPrompt, process.cwd());
    return;
  }

  // If we auto-continued and still hit the limit, report it cleanly.
  if (isMaxStepsExceeded(result.stderr || result.stdout)) {
    console.log(formatError(`Still hitting max_steps limit after ${continuations} continuation(s). The task is too large for one Kimi turn; resume manually with: kimi -S ${sessionId}`));
    saveSessionTitleByPrompt(userPrompt, process.cwd());
    return;
  }

  if (!fix) {
    console.log(formatError('Execution failed. Use --fix to retry with auto-correction.'));
    saveSessionTitleByPrompt(userPrompt, process.cwd());
    return;
  }

  // 3. Single correction attempt (opt-in)
  const errorSnippet = tailLines(result.stderr || result.stdout || 'Unknown error', CONFIG.ERROR_TAIL_LINES);
  console.log(formatError('Error detected:'));
  console.log(errorSnippet);

  const correctionPrompt = buildPrompt(userPrompt, context, {
    autoFix: true,
    previousError: errorSnippet,
    previousOutput: result.stdout,
    compress: true
  });

  console.log(formatInfo('Running single correction attempt...'));
  const finalResult = await runKimi(correctionPrompt, sessionId);

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

  // Show a reminder if the session context is getting large.
  // We cannot auto-trigger Kimi's /compact from outside the TUI; the user must
  // type it inside the interactive session.
  if (isContinuation(args)) {
    showCompactReminder(args);
  }

  return new Promise((resolve) => {
    ensureKimi1Env();

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
