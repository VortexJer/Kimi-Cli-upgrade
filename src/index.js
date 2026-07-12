const path = require('path');
const fs = require('fs');
const os = require('os');
const CONFIG = require('./config');
const { loadContext } = require('./context-loader');
const { runWithAutoFix, launchWithArgs, launchInteractive } = require('./runner');
const { buildPrompt } = require('./prompt-builder');
const { uninstall } = require('./uninstall');
const { listHistory, showSessionDetail, resumeSessionInteractive, cleanEmptySessions, renameAllSessions } = require('./history');
const { migrateOfficialSessions } = require('./session-migrator');
const { compactSession, compactLatestSession, compactAllSessions, setAutoCompactMode, getAutoCompactMode } = require('./session-compactor');
const { enableKimiRedirect, disableKimiRedirect } = require('./profile-manager');
const { formatHeader, formatInfo, formatSuccess, createTable } = require('./formatter');

const SESSION_INDEX = path.join(CONFIG.KIMI1_HOME, 'session_index.jsonl');

// Short flags: first letter, then first+second if there is a collision
// (including reserved native Kimi flags: -c, -S, -v). Help intentionally
// does NOT take -h so that -h can be --history (most-used command).
const SHORT_FLAGS = {
  '-he': '--help',
  '-h': '--history',
  '-i': '--interactive',
  '-l': '--list-history',
  '-r': '--resume',
  '-u': '--uninstall',
  '-e': '--enable-kimi',
  '-d': '--disable-kimi',
  '-dr': '--dry-run',
  '-ce': '--clean-empty',
  '-rs': '--rename-sessions',
  '-id': '--id',
  '-ms': '--max-steps',
  '-th': '--thinking',
  '-cp': '--compress',
  '-ca': '--cache',
  '-nc': '--no-context',
  '-f': '--fix',
  '-mh': '--migrate-history',
  '-cs': '--compact-session',
  '-ac': '--auto-compact'
};

function normalizeArgs(args) {
  return args.map(arg => SHORT_FLAGS[arg] || arg);
}

function showHelp() {
  console.log(formatHeader('kimi1 - Kimi CLI upgrade wrapper'));
  console.log('kimi1 [prompt]        ask Kimi with auto-fix and context');
  console.log('kimi1                 start Kimi interactively with local context');
  console.log('kimi1 -S <id>         resume session');
  console.log('kimi1 -c              continue previous session');
  console.log('');
  console.log('After install, these commands also work with "kimi":');
  console.log('kimi --history (-h)   pick session with arrow keys');
  console.log('kimi1 --list (-l)     plain table of sessions');
  console.log('kimi1 --history --id <id> (-id)');
  console.log('kimi1 --history --resume <id> (-r)');
  console.log('kimi1 --clean-empty (-ce)');
  console.log('kimi1 --rename-sessions (-rs)');
  console.log('kimi1 --compact-session (-cs) [--id <id>] [--aggressive]');
  console.log('kimi1 --auto-compact safe|aggressive|off (-ac)');
  console.log('kimi1 --migrate-history (-mh)');
  console.log('');
  console.log('kimi1 --enable-kimi (-e)   redirect "kimi" -> "kimi1"');
  console.log('kimi1 --disable-kimi (-d)  restore original "kimi"');
  console.log('');
  console.log('kimi1 --max-steps <n> (-ms)  (binary observed cap ~5)');
  console.log('kimi1 --thinking on|off (-th)');
  console.log('');
  console.log('Note: kimi1 auto-continues a prompt when Kimi hits its per-turn');
  console.log('      max_steps limit, so large tasks still finish.');
  console.log('');
  console.log('Token-saving flags (opt-in):');
  console.log('kimi1 --compress (-cp)        compress prompt before sending');
  console.log('kimi1 --cache (-ca)           cache identical prompts');
  console.log('kimi1 --no-context (-nc)      skip KIMI.md/shared context');
  console.log('kimi1 --fix (-f)              enable single auto-correction retry');
  console.log('');
  console.log('kimi1 --dry-run (-dr) [prompt]');
  console.log('kimi1 --uninstall (-u)');
  console.log('kimi1 --help (-he)');
}

function findSessionWorkDir(sessionId) {
  if (!fs.existsSync(SESSION_INDEX)) return null;
  const lines = fs.readFileSync(SESSION_INDEX, 'utf-8').split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.sessionId === sessionId || entry.sessionId.replace('session_', '').startsWith(sessionId)) {
        return entry.workDir || null;
      }
    } catch (err) {
      // ignore
    }
  }
  return null;
}

function getArgValue(args, flags) {
  for (const flag of flags) {
    const idx = args.indexOf(flag);
    if (idx !== -1 && args[idx + 1]) {
      return args[idx + 1];
    }
  }
  return null;
}

function removeKnownFlags(args, flags) {
  const result = [...args];
  for (const flag of flags) {
    const idx = result.indexOf(flag);
    if (idx !== -1) {
      result.splice(idx, 2);
    }
  }
  return result;
}

async function main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.includes('--help') || rawArgs.includes('-he')) {
    showHelp();
    return;
  }

  const args = normalizeArgs(rawArgs);

  // Interactive mode: no args -> launch Kimi TUI with wrapper context
  if (args.length === 0) {
    const cwd = process.cwd();
    const context = loadContext(cwd);
    await launchInteractive(context);
    return;
  }

  const maxStepsIdx = args.indexOf('--max-steps');
  if (maxStepsIdx !== -1) {
    const val = args[maxStepsIdx + 1];
    if (val && /^[0-9]+$/.test(val)) {
      const requested = parseInt(val, 10);
      CONFIG.setMaxSteps(val);
      if (requested > CONFIG.EFFECTIVE_MAX_STEPS) {
        console.log(formatInfo(`Set to ${requested}.`));
        console.log(formatInfo(`Warning: official Kimi binary has been observed to cap at ${CONFIG.EFFECTIVE_MAX_STEPS}; higher values may be ignored.`));
      } else {
        console.log(formatSuccess(`max_steps_per_turn ajustado a ${requested}`));
      }
    } else {
      const current = CONFIG.getMaxSteps();
      console.log(formatInfo(`max_steps_per_turn actual: ${current}`));
      if (current > CONFIG.EFFECTIVE_MAX_STEPS) {
        console.log(formatInfo(`(Warning: binary observed cap is ${CONFIG.EFFECTIVE_MAX_STEPS})`));
      }
    }
    return;
  }

  const thinkingIdx = args.indexOf('--thinking');
  if (thinkingIdx !== -1) {
    const val = args[thinkingIdx + 1];
    if (val && /^(true|false|on|off|1|0)$/i.test(val)) {
      const bool = CONFIG.setThinking(val);
      console.log(formatSuccess(`thinking.enabled ajustado a ${bool}`));
    } else {
      console.log(formatInfo(`thinking.enabled actual: ${CONFIG.getThinking()}`));
    }
    return;
  }

  if (args.includes('--migrate-history')) {
    const result = migrateOfficialSessions();
    console.log(formatInfo(`Sesiones oficiales migradas: ${result.migrated}`));
    if (result.skipped > 0) {
      console.log(formatInfo(`Sesiones ya presentes en kimi1: ${result.skipped}`));
    }
    return;
  }

  if (args.includes('--uninstall')) {
    uninstall();
    return;
  }

  if (args.includes('--enable-kimi')) {
    const results = enableKimiRedirect();
    console.log(formatHeader('Redireccion "kimi" -> "kimi1" activada'));
    for (const r of results) {
      console.log(formatInfo(r.profilePath));
      if (r.backup) console.log(formatInfo(`  Backup: ${r.backup}`));
      console.log(r.added ? formatSuccess('  Redireccion anadida.') : formatInfo('  Ya existia.'));
    }
    console.log(formatInfo('Reinicia PowerShell para aplicar los cambios.'));
    return;
  }

  if (args.includes('--disable-kimi')) {
    const results = disableKimiRedirect();
    console.log(formatHeader('Redireccion "kimi" -> "kimi1" desactivada'));
    for (const r of results) {
      console.log(formatInfo(r.profilePath));
      if (r.backup) console.log(formatInfo(`  Backup: ${r.backup}`));
      console.log(r.removed ? formatSuccess('  Redireccion eliminada.') : formatInfo('  No estaba activa.'));
    }
    console.log(formatInfo('Reinicia PowerShell para aplicar los cambios.'));
    return;
  }

  if (args.includes('--clean-empty')) {
    cleanEmptySessions();
    return;
  }

  if (args.includes('--rename-sessions')) {
    renameAllSessions({ force: true });
    return;
  }

  if (args.includes('--compact-session')) {
    const idIndex = args.indexOf('--id');
    const aggressive = args.includes('--aggressive');
    const opts = aggressive ? { keepMessages: 10 } : {};
    let result;
    if (idIndex !== -1 && args[idIndex + 1]) {
      result = compactSession(args[idIndex + 1], opts);
    } else {
      result = compactLatestSession(opts);
    }
    if (result.compacted) {
      console.log(formatSuccess(
        `Compacted: ${(result.originalSize / 1024).toFixed(1)} KB -> ${(result.newSize / 1024).toFixed(1)} KB (${result.droppedEvents} events dropped)`
      ));
      if (aggressive) console.log(formatInfo('Aggressive mode: only last 10 messages kept.'));
      console.log(formatInfo(`Backup: ${result.backup}`));
    } else {
      console.log(formatInfo(`No compaction needed: ${result.reason}`));
    }
    return;
  }

  if (args.includes('--auto-compact')) {
    const val = getArgValue(args, ['--auto-compact']);
    if (val && ['safe', 'aggressive', 'off'].includes(val.toLowerCase())) {
      const mode = setAutoCompactMode(val.toLowerCase());
      console.log(formatSuccess(`Auto-compaction set to ${mode}`));
    } else {
      const mode = getAutoCompactMode();
      console.log(formatInfo(`Auto-compaction: ${mode || 'off'}`));
    }
    return;
  }

  const historyAliases = ['--history', '--list-history', '--interactive'];
  if (historyAliases.some(a => args.includes(a))) {
    const removed = cleanEmptySessions({ silent: true });
    if (removed > 0) {
      console.log(formatInfo(`Auto-cleaned ${removed} empty session(s).`));
    }
    const idIndex = args.indexOf('--id');
    const resumeIndex = args.indexOf('--resume') !== -1 ? args.indexOf('--resume') : args.indexOf('-r');
    const interactive = args.includes('--interactive') || args.includes('--history');
    const plainList = args.includes('--list-history');

    if (resumeIndex !== -1 && args[resumeIndex + 1]) {
      const sessionId = args[resumeIndex + 1];
      const workDir = findSessionWorkDir(sessionId) || process.cwd();
      const context = loadContext(workDir);
      await launchWithArgs(['-S', sessionId], context);
    } else if (interactive && !plainList) {
      await resumeSessionInteractive((sessionId) => {
        const workDir = findSessionWorkDir(sessionId) || process.cwd();
        const context = loadContext(workDir);
        return launchWithArgs(['-S', sessionId], context);
      });
    } else if (idIndex !== -1 && args[idIndex + 1]) {
      showSessionDetail(args[idIndex + 1]);
    } else {
      listHistory();
    }
    return;
  }

  // Session resume: kimi -S <id>
  const sessionId = getArgValue(args, ['-S', '--session']);
  if (sessionId) {
    const workDir = findSessionWorkDir(sessionId) || process.cwd();
    const context = loadContext(workDir);
    const remainingArgs = removeKnownFlags(args, ['-S', '--session']);
    await launchWithArgs(remainingArgs, context);
    return;
  }

  // Wrapper-only flags (do not reach Kimi's binary)
  const WRAPPER_FLAGS = ['--compress', '--cache', '--no-context', '--fix'];
  const compress = args.includes('--compress');
  const cache = args.includes('--cache');
  const noContext = args.includes('--no-context');
  const fix = args.includes('--fix');
  const stripWrapperFlags = (arr) => arr.filter(arg => !WRAPPER_FLAGS.includes(arg));

  // --dry-run mode
  if (args.includes('--dry-run')) {
    const filteredArgs = stripWrapperFlags(args.filter(arg => arg !== '--dry-run'));
    const userPrompt = filteredArgs.join(' ');
    const cwd = process.cwd();
    const context = noContext ? {} : loadContext(cwd);
    console.log(formatHeader('DRY RUN - Prompt que se enviaria a Kimi'));
    console.log(buildPrompt(userPrompt, context, { compress }));
    return;
  }

  // Continue previous session: kimi -c
  if (args.includes('-c') || args.includes('--continue')) {
    const cwd = process.cwd();
    const context = loadContext(cwd);
    await launchWithArgs(args, context);
    return;
  }

  // Any other native Kimi flag or subcommand (export, vis, provider, etc.)
  // Treat as native passthrough but with local context injected
  if (args.length > 0 && (args[0].startsWith('-') || isNaN(parseInt(args[0])))) {
    const cwd = process.cwd();
    const context = loadContext(cwd);
    await launchWithArgs(args, context);
    return;
  }

  // Default: prompt mode
  const userPrompt = stripWrapperFlags(args).join(' ');
  const cwd = process.cwd();
  const context = noContext ? {} : loadContext(cwd);

  if (Object.keys(context).length > 0) {
    console.log(formatInfo(`Contexto cargado desde: ${Object.keys(context).join(', ')}`));
  }

  await runWithAutoFix(userPrompt, context, { fix, compress, cache });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
