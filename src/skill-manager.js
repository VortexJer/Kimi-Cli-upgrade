const fs = require('fs');
const path = require('path');
const os = require('os');
const { getContextSummary } = require('./context-loader');

const SKILL_NAME = 'kimi1-local-context';
const SKILL_DIR = path.join(os.homedir(), '.kimi-code', 'skills', SKILL_NAME);
const SKILL_PATH = path.join(SKILL_DIR, 'SKILL.md');

const SYSTEM_RULES = `
# Kimi1 Context Rules

## Strict No-Verbiage
- No greetings, introductions, apologies, or closing remarks.
- No explanations unless explicitly requested.
- Output only code, commands, file paths, tables, or concise technical facts.
- Use minimal words. Prefer bullet points and tables over paragraphs.

## Context Loading
- This skill has already loaded the local project context (KIMI.md and shared context files).
- Treat this context as the base state for the current session.

## Error Handling
- If a terminal command fails, stop and ask before retrying unless the user explicitly allowed auto-fix.
- When reporting errors, show only the last 20 relevant lines or the key stack trace.
`.trim();

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function installSkill(context) {
  ensureDir(SKILL_DIR);

  const contextBlock = getContextSummary(context);
  const parts = [
    '---',
    `name: ${SKILL_NAME}`,
    'description: Contexto local inyectado por kimi1 para esta sesion.',
    '---',
    '',
    SYSTEM_RULES
  ];

  if (contextBlock) {
    parts.push('', '# Local Context', '', contextBlock);
  }

  fs.writeFileSync(SKILL_PATH, parts.join('\n'), 'utf-8');
  return SKILL_PATH;
}

function removeSkill() {
  try {
    if (fs.existsSync(SKILL_DIR)) {
      fs.rmSync(SKILL_DIR, { recursive: true, force: true });
    }
  } catch (err) {
    // ignore cleanup errors
  }
}

module.exports = { installSkill, removeSkill, SKILL_PATH };
