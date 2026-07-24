const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');

// Reusable prompt templates (like Claude Code's custom slash commands). Each is
// a Markdown file in ~/.kimi-code-kimi1/commands/<name>.md. Placeholders:
//   $ARGUMENTS  -> all extra args joined with spaces
//   $1, $2, ... -> individual extra args
const COMMANDS_DIR = path.join(CONFIG.KIMI1_HOME, 'commands');

function ensureDir() {
  fs.mkdirSync(COMMANDS_DIR, { recursive: true });
}

function commandPath(name) {
  return path.join(COMMANDS_DIR, `${name}.md`);
}

function listCommands() {
  ensureDir();
  return fs.readdirSync(COMMANDS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const name = f.replace(/\.md$/, '');
      let firstLine = '';
      try {
        firstLine = fs.readFileSync(path.join(COMMANDS_DIR, f), 'utf-8')
          .split(/\r?\n/).find(l => l.trim()) || '';
      } catch { /* ignore */ }
      return { name, summary: firstLine.slice(0, 60) };
    });
}

function saveCommand(name, text) {
  ensureDir();
  fs.writeFileSync(commandPath(name), text, 'utf-8');
  return commandPath(name);
}

// Load a command template and substitute placeholders with the extra args.
function expandCommand(name, extraArgs = []) {
  const file = commandPath(name);
  if (!fs.existsSync(file)) return null;
  let text = fs.readFileSync(file, 'utf-8');
  text = text.replace(/\$ARGUMENTS\b/g, extraArgs.join(' '));
  text = text.replace(/\$(\d+)/g, (_, n) => extraArgs[parseInt(n, 10) - 1] || '');
  return text.trim();
}

module.exports = { COMMANDS_DIR, listCommands, saveCommand, expandCommand };
