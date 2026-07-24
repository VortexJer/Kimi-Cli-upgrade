const path = require('path');
const fs = require('fs');
const os = require('os');
const CONFIG = require('./config');
const { loadContext, loadFileMentions } = require('./context-loader');
const { runWithAutoFix, launchWithArgs, launchInteractive } = require('./runner');
const { buildPrompt } = require('./prompt-builder');
const { uninstall } = require('./uninstall');
const { listHistory, showSessionDetail, resumeSessionInteractive, cleanEmptySessions, renameAllSessions, getSessions } = require('./history');
const usage = require('./usage');
const commands = require('./commands');
const checkpoint = require('./checkpoint');
const { migrateOfficialSessions } = require('./session-migrator');
const { buildForkSummary } = require('./session-fork');
const { enableKimiRedirect, disableKimiRedirect } = require('./profile-manager');
const { formatHeader, formatInfo, formatSuccess, formatError, createTable } = require('./formatter');
const { showMenu } = require('./menu');
const { likelyNeedsTools } = require('./prompt-classifier');
const { estimateTokens, formatTokenCount } = require('./token-estimator');

const SESSION_INDEX = path.join(CONFIG.KIMI1_HOME, 'session_index.jsonl');

// Short flags: first letter, then first+second if there is a collision
// (including reserved native Kimi flags: -c, -S, -v). -h/--help is help
// (universal convention); the session selector is --sessions/-s.
const SHORT_FLAGS = {
  '-h': '--help',
  '-s': '--sessions',
  '-i': '--interactive',
  '-l': '--list-history',
  '-r': '--resume',
  '-u': '--uninstall',
  '-e': '--enable-kimi',
  '-d': '--disable-kimi',
  '-roc': '--restore-official-config',
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
  '-pr': '--preview',
  '-np': '--no-preview',
  '-mh': '--migrate-history',
  '-cm': '--compact-mode',
  '-fk': '--fork',
  '-us': '--usage',
  '-fa': '--fast',
  '-tl': '--tools'
};

function fmtTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

function showUsage() {
  const per = usage.collectPerSession().filter(s =>
    s.totals.inputOther || s.totals.output || s.totals.cacheRead);
  if (per.length === 0) {
    console.log(formatInfo('No usage data yet (run some prompts first).'));
    return;
  }
  const g = usage.grandTotals(per);
  const rates = usage.loadRates();

  console.log(formatHeader('Kimi token usage'));
  console.log(`Sessions with usage: ${per.length}   Turns: ${g.turns}`);
  console.log(`Input (fresh):   ${fmtTokens(g.inputOther)}`);
  console.log(`Output:          ${fmtTokens(g.output)}`);
  console.log(`Cache read:      ${fmtTokens(g.cacheRead)}   ${formatInfo(`(${(usage.cacheHitRate(g) * 100).toFixed(0)}% of input served from cache)`)}`);
  console.log(`Cache creation:  ${fmtTokens(g.cacheCreation)}`);
  const cost = usage.estimateCost(g, rates);
  if (cost != null) {
    console.log(`Est. cost:       ~$${cost.toFixed(2)}   ${formatInfo('(from your usage-rates.json)')}`);
  } else {
    console.log(formatInfo(`Cost estimate off. Add ${usage.RATES_FILE} with {"inputPerMtok":..,"outputPerMtok":..} to enable.`));
  }

  const titles = {};
  for (const s of getSessions()) titles[s.sessionId] = s.title;
  const rows = per
    .map(s => ({ ...s, spend: s.totals.inputOther + s.totals.output }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 12)
    .map(s => [
      (titles[s.sessionId] || s.sessionId.replace('session_', '').slice(0, 8)).slice(0, 32),
      fmtTokens(s.totals.inputOther),
      fmtTokens(s.totals.output),
      fmtTokens(s.totals.cacheRead),
      String(s.totals.turns)
    ]);
  console.log('');
  console.log(createTable(['Session', 'In', 'Out', 'Cache', 'Turns'], rows));
  console.log(formatInfo('Tip: huge Cache per turn = a large context carried every turn. Use --fork to start fresh.'));
}

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
  console.log('kimi --sessions (-s)  pick session with arrow keys (-> submenu)');
  console.log('kimi1 --list (-l)     plain table of sessions');
  console.log('kimi1 --sessions --id <id> (-id)');
  console.log('kimi1 --sessions --resume <id> (-r)');
  console.log('Reference files inline with @path in any prompt, e.g. kimi1 "fix @src/x.js"');
  console.log('kimi1 --do <name> [args]         run a saved prompt template');
  console.log('kimi1 --commands                 list saved commands');
  console.log('kimi1 --save-command <name> "..."  save a template ($ARGUMENTS, $1, $2)');
  console.log('kimi1 --usage (-us)   token/cache usage per session + totals');
  console.log('kimi1 --tools [lean|full] (-tl)  trim per-turn tool schemas (needs kimi>=0.29)');
  console.log('kimi1 --diff          show what changed since the last run (git)');
  console.log('kimi1 --undo          roll the working dir back to the last checkpoint (git)');
  console.log('kimi1 --clean-empty (-ce)');
  console.log('kimi1 --rename-sessions (-rs)');
  console.log('kimi1 --migrate-history (-mh)');
  console.log('');
  console.log('Context compaction reminder (type /compact inside the chat yourself):');
  console.log('kimi1 --compact-mode off|safe|aggressive (-cm)  default: off');
  console.log('  off       = no reminder');
  console.log('  safe      = remind when >24 messages or wire >1 MB');
  console.log('  aggressive= remind when >12 messages or wire >500 KB');
  console.log('');
  console.log('Fork a large session into a fresh one seeded with a local summary (0 tokens):');
  console.log('kimi1 --fork <id> (-fk)   start a NEW session continuing an old one');
  console.log('');
  console.log('kimi1 --enable-kimi (-e)          redirect "kimi" -> "kimi1"');
  console.log('kimi1 --disable-kimi (-d)         restore original "kimi"');
  console.log('kimi1 --restore-official-config (-roc)  reset official Kimi config (max_steps/thinking)');
  console.log('');
  console.log('kimi1 --max-steps [<n>] (-ms)  interactive menu if no value');
  console.log('kimi1 --thinking [on|off] (-th)  interactive menu if no value');
  console.log('');
  console.log('Note: kimi1 auto-continues a prompt when Kimi hits its per-turn');
  console.log('      max_steps limit, so large tasks still finish.');
  console.log('');
  console.log('Token-saving flags (opt-in):');
  console.log('kimi1 --compress (-cp)        compress prompt before sending');
  console.log('kimi1 --cache (-ca)           cache identical prompts');
  console.log('kimi1 --no-context (-nc)      skip KIMI.md/shared context');
  console.log('kimi1 --fix (-f)              enable single auto-correction retry');
  console.log('kimi1 --fast (-fa)           use the highspeed model (chat prompts use it by default)');
  console.log('kimi1 --preview (-pr)         allow screenshots/PDF previews (more tokens)');
  console.log('kimi1 --no-preview (default)  skip visual previews to save tokens');
  console.log('');
  console.log('kimi1 --dry-run (-dr) [prompt]');
  console.log('kimi1 --uninstall (-u)');
  console.log('kimi1 --help (-h)');
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

async function main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
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
      const stepsOptions = [
        '3   - aggressive token saving',
        '5   - balanced',
        '10  - conservative',
        `current (${current})`,
        'unlimited - let Kimi use as many as allowed'
      ];
      const defaultIdx = current > 10 ? 3 : (current === 10 ? 2 : (current === 5 ? 1 : 0));
      const selected = await showMenu('Choose max_steps_per_turn:', stepsOptions, defaultIdx);
      let requested;
      switch (selected) {
        case 0: requested = 3; break;
        case 1: requested = 5; break;
        case 2: requested = 10; break;
        case 3: requested = current; break;
        default: requested = 1000;
      }
      CONFIG.setMaxSteps(requested);
      if (requested > CONFIG.EFFECTIVE_MAX_STEPS) {
        console.log(formatInfo(`Set to ${requested}.`));
        console.log(formatInfo(`Warning: official Kimi binary has been observed to cap at ${CONFIG.EFFECTIVE_MAX_STEPS}; higher values may be ignored.`));
      } else {
        console.log(formatSuccess(`max_steps_per_turn ajustado a ${requested}`));
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
      const current = CONFIG.getThinking();
      const thinkingOptions = [
        'OFF - fewer tokens, faster',
        'ON  - reasoning chain visible, more tokens'
      ];
      const selected = await showMenu('Choose thinking mode:', thinkingOptions, current ? 1 : 0);
      const bool = CONFIG.setThinking(selected === 1 ? 'true' : 'false');
      console.log(formatSuccess(`thinking.enabled ajustado a ${bool}`));
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
      if (r.backup) console.log(formatInfo(`  Backup perfil: ${r.backup}`));
      console.log(r.added ? formatSuccess('  Redireccion anadida.') : formatInfo('  Ya existia.'));
      if (r.configBackupCreated) console.log(formatSuccess('  Config oficial de Kimi respaldada.'));
      if (r.configSynced) console.log(formatSuccess('  Config oficial sincronizada con kimi1.'));
    }
    console.log(formatInfo('Reinicia tu terminal (o recarga tu perfil: source ~/.bashrc | . $PROFILE) para aplicar los cambios.'));
    return;
  }

  if (args.includes('--disable-kimi')) {
    const results = disableKimiRedirect();
    console.log(formatHeader('Redireccion "kimi" -> "kimi1" desactivada'));
    for (const r of results) {
      console.log(formatInfo(r.profilePath));
      if (r.backup) console.log(formatInfo(`  Backup perfil: ${r.backup}`));
      console.log(r.removed ? formatSuccess('  Redireccion eliminada.') : formatInfo('  No estaba activa.'));
      if (r.configRestored) console.log(formatSuccess('  Config oficial de Kimi restaurada desde backup.'));
      if (r.configReset) console.log(formatInfo('  Config oficial de Kimi reseteada a valores por defecto (no habia backup).'));
    }
    console.log(formatInfo('Reinicia tu terminal (o recarga tu perfil: source ~/.bashrc | . $PROFILE) para aplicar los cambios.'));
    return;
  }

  if (args.includes('--restore-official-config')) {
    const restored = CONFIG.restoreOfficialConfig();
    const reset = restored ? false : CONFIG.resetOfficialConfigToDefaults();
    if (restored) {
      console.log(formatSuccess('Configuracion oficial de Kimi restaurada desde backup.'));
    } else if (reset) {
      console.log(formatInfo('No habia backup. Configuracion oficial reseteada a max_steps=1000, thinking=true.'));
    } else {
      console.log(formatError('No se pudo restaurar la configuracion oficial.'));
    }
    return;
  }

  if (args.includes('--diff')) {
    const res = checkpoint.diffSince(process.cwd());
    if (!res.ok) {
      console.log(formatInfo(res.reason === 'no-checkpoint'
        ? 'No checkpoint for this directory yet (run a prompt here first).'
        : `No diff: ${res.reason}`));
      return;
    }
    console.log(formatHeader('Changes since last run'));
    console.log(res.diff.trim() ? res.diff : formatInfo('No changes.'));
    return;
  }

  if (args.includes('--undo')) {
    const cwd = process.cwd();
    const cp = checkpoint.lastCheckpoint(cwd);
    if (!checkpoint.isGitRepo(cwd) || !cp) {
      console.log(formatInfo('Nothing to undo (need a git repo with a prior run here).'));
      return;
    }
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const when = new Date(cp.ts).toLocaleString();
    const answer = await new Promise(res =>
      rl.question(formatError(`Restore files to the checkpoint from ${when}? Uncommitted changes since then will be lost. (y/N) `), res));
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log(formatInfo('Cancelled.'));
      return;
    }
    const res = checkpoint.restoreLast(cwd);
    if (!res.ok) {
      console.log(formatError(`Undo failed: ${res.reason}`));
      return;
    }
    console.log(formatSuccess('Restored to checkpoint.'));
    if (res.newFiles.length) {
      console.log(formatInfo(`Note: files created after the checkpoint were NOT deleted:`));
      for (const f of res.newFiles) console.log(formatInfo(`  ${f}`));
    }
    return;
  }

  if (args.includes('--usage')) {
    showUsage();
    return;
  }

  if (args.includes('--commands')) {
    const list = commands.listCommands();
    console.log(formatHeader('Saved commands'));
    if (list.length === 0) {
      console.log(formatInfo(`None yet. Create one: kimi1 --save-command <name> "<prompt with $ARGUMENTS>"`));
      console.log(formatInfo(`Or drop a .md file in ${commands.COMMANDS_DIR}`));
    } else {
      for (const c of list) console.log(`  ${c.name}  ${formatInfo('— ' + c.summary)}`);
      console.log(formatInfo('Run one: kimi1 --do <name> [args]'));
    }
    return;
  }

  if (args.includes('--save-command')) {
    const idx = args.indexOf('--save-command');
    const name = args[idx + 1];
    const text = args.slice(idx + 2).join(' ');
    if (!name || !text) {
      console.log(formatError('Usage: kimi1 --save-command <name> "<prompt text with $ARGUMENTS>"'));
      return;
    }
    const p = commands.saveCommand(name, text);
    console.log(formatSuccess(`Saved command "${name}" -> ${p}`));
    return;
  }

  if (args.includes('--do')) {
    const idx = args.indexOf('--do');
    const name = args[idx + 1];
    const extra = args.slice(idx + 2).filter(a => !a.startsWith('-'));
    if (!name) {
      console.log(formatError('Usage: kimi1 --do <name> [args]'));
      return;
    }
    const expanded = commands.expandCommand(name, extra);
    if (expanded == null) {
      console.log(formatError(`No command named "${name}". List them: kimi1 --commands`));
      return;
    }
    const cwd = process.cwd();
    const context = loadContext(cwd);
    const files = loadFileMentions(expanded, cwd);
    console.log(formatInfo(`Running command "${name}"...`));
    await runWithAutoFix(expanded, context, { fix: false, compress: false, cache: false, preview: false, fast: false, files });
    return;
  }

  if (args.includes('--tools')) {
    const val = getArgValue(args, ['--tools']);
    if (val === 'lean') {
      CONFIG.setDisabledTools(CONFIG.LEAN_DISABLED_TOOLS);
      console.log(formatSuccess(`Lean toolset: disabled ${CONFIG.LEAN_DISABLED_TOOLS.length} rarely-used tools.`));
    } else if (val === 'full') {
      CONFIG.setDisabledTools([]);
      console.log(formatSuccess('Full toolset: no tools disabled.'));
    } else {
      const cur = CONFIG.getDisabledTools();
      console.log(formatHeader('Tool trimming (per-turn fixed cost)'));
      console.log(cur.length
        ? `Disabled (${cur.length}): ${cur.join(', ')}`
        : 'No tools disabled (full set).');
      console.log(formatInfo('Use: kimi1 --tools lean   (cut ~9k tokens/turn)  |  kimi1 --tools full'));
    }
    console.log(formatInfo('NOTE: tool trimming needs kimi >= 0.29.0. Check: kimi --version ; upgrade: kimi upgrade'));
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

  if (args.includes('--compact-mode')) {
    const val = getArgValue(args, ['--compact-mode']);
    if (val && ['safe', 'aggressive', 'off'].includes(val.toLowerCase())) {
      const mode = CONFIG.setCompactMode(val.toLowerCase());
      console.log(formatSuccess(`Compact reminder mode set to ${mode}`));
    } else {
      const current = CONFIG.getCompactMode();
      const compactOptions = [
        'off        - no reminder (default)',
        'safe       - remind at >24 messages or wire >1 MB',
        'aggressive - remind at >12 messages or wire >500 KB'
      ];
      const defaultIdx = current === 'aggressive' ? 2 : (current === 'safe' ? 1 : 0);
      const selected = await showMenu('Choose compact reminder mode (reminds you to type /compact inside the chat):', compactOptions, defaultIdx);
      const mode = selected === 2 ? 'aggressive' : (selected === 1 ? 'safe' : 'off');
      CONFIG.setCompactMode(mode);
      console.log(formatSuccess(`Compact reminder mode set to ${mode}`));
    }
    return;
  }

  if (args.includes('--fork')) {
    const idIndex = args.indexOf('--fork');
    const sessionId = args[idIndex + 1] && !args[idIndex + 1].startsWith('-')
      ? args[idIndex + 1]
      : (args.indexOf('--id') !== -1 ? args[args.indexOf('--id') + 1] : null);
    const summary = buildForkSummary(sessionId);
    if (!summary) {
      console.log(formatError('No se encontro la sesion a forkear o esta vacia.'));
      return;
    }
    console.log(formatHeader('Fork: nueva sesion sembrada con un resumen local (0 tokens de resumen)'));
    console.log(formatInfo(`Resumen (${estimateTokens(summary.text)} tokens aprox.):`));
    console.log(summary.text);
    console.log(formatInfo(''));
    const workDir = summary.workDir || process.cwd();
    const context = loadContext(workDir);
    // Fresh session (no -S): a brand new, valid wire.jsonl is created by Kimi.
    await runWithAutoFix(summary.text, context, { fix: false, compress: false, cache: false, preview: false });
    return;
  }

  const historyAliases = ['--sessions', '--list-history', '--list', '--interactive'];
  if (historyAliases.some(a => args.includes(a))) {
    const removed = cleanEmptySessions({ silent: true });
    if (removed > 0) {
      console.log(formatInfo(`Auto-cleaned ${removed} empty session(s).`));
    }
    const idIndex = args.indexOf('--id');
    const resumeIndex = args.indexOf('--resume');
    const interactive = args.includes('--interactive') || args.includes('--sessions');
    const plainList = args.includes('--list-history') || args.includes('--list');

    if (resumeIndex !== -1 && args[resumeIndex + 1]) {
      const sessionId = args[resumeIndex + 1];
      const workDir = findSessionWorkDir(sessionId) || process.cwd();
      const context = loadContext(workDir);
      await launchWithArgs(['-S', sessionId], context);
    } else if (interactive && !plainList) {
      await resumeSessionInteractive({
        open: (sessionId) => {
          const workDir = findSessionWorkDir(sessionId) || process.cwd();
          const context = loadContext(workDir);
          return launchWithArgs(['-S', sessionId], context);
        },
        fork: (sessionId) => {
          const summary = buildForkSummary(sessionId);
          if (!summary) {
            console.log(formatError('Could not fork: session empty or not found.'));
            return;
          }
          const workDir = summary.workDir || process.cwd();
          const context = loadContext(workDir);
          console.log(formatInfo(`Fork seed (${estimateTokens(summary.text)} tokens):`));
          console.log(summary.text);
          console.log(formatInfo(''));
          return runWithAutoFix(summary.text, context, { fix: false, compress: false, cache: false, preview: false });
        }
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
    // Keep -S and the session ID in the args passed to Kimi; we only extracted
    // the ID to load the right local context and optional compact reminder.
    await launchWithArgs(args, context);
    return;
  }

  // Wrapper-only flags (do not reach Kimi's binary)
  const WRAPPER_FLAGS = ['--compress', '--cache', '--no-context', '--fix', '--preview', '--no-preview', '--fast'];
  const compress = args.includes('--compress');
  const cache = args.includes('--cache');
  const noContext = args.includes('--no-context');
  const fix = args.includes('--fix');
  const fast = args.includes('--fast');
  // Default: no-preview (saves tokens). Use --preview to enable screenshots/PDF.
  const preview = args.includes('--preview') && !args.includes('--no-preview');
  const stripWrapperFlags = (arr) => arr.filter(arg => !WRAPPER_FLAGS.includes(arg));

  // Remove wrapper flags from args so they don't trigger native passthrough logic.
  const cleanArgs = stripWrapperFlags(args);

  // --dry-run mode
  if (args.includes('--dry-run')) {
    const filteredArgs = stripWrapperFlags(args.filter(arg => arg !== '--dry-run'));
    const userPrompt = filteredArgs.join(' ');
    const cwd = process.cwd();
    const context = noContext ? {} : loadContext(cwd);
    const needsTools = likelyNeedsTools(userPrompt);
    const files = loadFileMentions(userPrompt, cwd);
    const built = buildPrompt(userPrompt, context, { compress, preview, needsTools, files });
    const contextTokens = estimateTokens(Object.values(context).join('\n'));
    const promptTokens = estimateTokens(built);
    console.log(formatHeader('DRY RUN - Prompt que se enviaria a Kimi'));
    console.log(formatInfo(`Mode: ${needsTools ? 'tools' : 'chat'} | Context files: ${formatTokenCount(contextTokens)} tokens | Total prompt: ${formatTokenCount(promptTokens)} tokens | Preview: ${preview ? 'on' : 'off'}`));
    console.log(built);
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
  // Treat as native passthrough but with local context injected.
  // A plain word is treated as a prompt below unless it starts with '-'.
  if (cleanArgs.length > 0 && cleanArgs[0].startsWith('-')) {
    const cwd = process.cwd();
    const context = loadContext(cwd);
    await launchWithArgs(args, context);
    return;
  }

  // Default: prompt mode
  const userPrompt = cleanArgs.join(' ');
  const cwd = process.cwd();
  const context = noContext ? {} : loadContext(cwd);

  if (Object.keys(context).length > 0) {
    console.log(formatInfo(`Contexto cargado desde: ${Object.keys(context).join(', ')}`));
  }

  const files = loadFileMentions(userPrompt, cwd);
  if (files.length > 0) {
    console.log(formatInfo(`Archivos inline (@): ${files.map(f => f.path).join(', ')}`));
  }

  // Snapshot the working dir first so the run can be reviewed (--diff) or rolled
  // back (--undo). No-op outside a git repo.
  if (checkpoint.createCheckpoint(cwd, userPrompt)) {
    console.log(formatInfo('Checkpoint saved (kimi1 --diff to review, --undo to roll back).'));
  }

  await runWithAutoFix(userPrompt, context, { fix, compress, cache, preview, fast, files });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
