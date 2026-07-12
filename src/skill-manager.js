const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');

const SKILL_NAME = 'kimi1-local-context';
const SKILL_DIR = path.join(CONFIG.KIMI1_HOME, 'skills', SKILL_NAME);
const SKILL_PATH = path.join(SKILL_DIR, 'SKILL.md');

const SKILL_RULES = `
# Kimi1 Skill Rules

- Output only code, commands, file paths, tables, or concise technical facts.
- No greetings, introductions, apologies, or closing remarks.
- If a terminal command fails, show only the last 20 relevant lines or key stack trace.
- If the conversation history grows beyond ~50 turns or the session feels slow, proactively run "/compact" to summarize old context and reduce token usage.
`.trim();

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function installSkill() {
  ensureDir(SKILL_DIR);

  const parts = [
    '---',
    `name: ${SKILL_NAME}`,
    'description: Reglas operativas minimas inyectadas por kimi1.',
    '---',
    '',
    SKILL_RULES
  ];

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
