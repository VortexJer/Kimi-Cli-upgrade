const path = require('path');
const fs = require('fs');
const os = require('os');
const CONFIG = require('./config');
const { loadContext } = require('./context-loader');
const { runWithAutoFix, launchWithArgs } = require('./runner');
const { buildPrompt } = require('./prompt-builder');
const { uninstall } = require('./uninstall');
const { listHistory, showSessionDetail, resumeSessionInteractive, cleanEmptySessions, renameAllSessionsWithAI } = require('./history');
const { enableKimiRedirect, disableKimiRedirect } = require('./profile-manager');
const { formatHeader, formatInfo, formatSuccess, createTable } = require('./formatter');

const SESSION_INDEX = path.join(os.homedir(), '.kimi-code', 'session_index.jsonl');

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
  '-id': '--id'
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
  console.log('kimi1 --history (-h)  pick session with arrow keys');
  console.log('kimi1 --list (-l)     plain table of sessions');
  console.log('kimi1 --history --id <id> (-id)');
  console.log('kimi1 --history --resume <id> (-r)');
  console.log('kimi1 --clean-empty (-ce)');
  console.log('kimi1 --rename-sessions (-rs)');
  console.log('');
  console.log('kimi1 --enable-kimi (-e)   redirect "kimi" -> "kimi1"');
  console.log('kimi1 --disable-kimi (-d)  restore original "kimi"');
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
    renameAllSessionsWithAI({ force: true });
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

  // --dry-run mode
  if (args.includes('--dry-run')) {
    const filteredArgs = args.filter(arg => arg !== '--dry-run');
    const userPrompt = filteredArgs.join(' ');
    const cwd = process.cwd();
    const context = loadContext(cwd);
    console.log(formatHeader('DRY RUN - Prompt que se enviaria a Kimi'));
    console.log(buildPrompt(userPrompt, context));
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
  const userPrompt = args.join(' ');
  const cwd = process.cwd();
  const context = loadContext(cwd);

  if (Object.keys(context).length > 0) {
    console.log(formatInfo(`Contexto cargado desde: ${Object.keys(context).join(', ')}`));
  }

  await runWithAutoFix(userPrompt, context);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
