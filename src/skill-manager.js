const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');

const SKILL_NAME = 'kimi1-local-context';
const SKILL_DIR = path.join(CONFIG.KIMI1_HOME, 'skills', SKILL_NAME);
const SKILL_PATH = path.join(SKILL_DIR, 'SKILL.md');

const BASE_RULES = `
# Kimi1 Skill Rules

- Output only code, commands, file paths, tables, or concise technical facts.
- No greetings, introductions, apologies, or closing remarks.
- If the conversation history grows beyond ~50 turns or the session feels slow, proactively run "/compact" to summarize old context and reduce token usage.
`.trim();

const TOOL_RULES = `
- If a terminal command fails, show only the last 20 relevant lines or key stack trace.
- Batch multiple file reads or shell commands into a single tool call when possible.
- Do NOT call tools for simple questions, greetings, or explanations.
`.trim();

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function buildSkillContent(needsTools) {
  const parts = [
    '---',
    `name: ${SKILL_NAME}`,
    `description: Reglas operativas minimas inyectadas por kimi1 (${needsTools ? 'tool mode' : 'chat mode'}).`,
    '---',
    '',
    BASE_RULES
  ];
  if (needsTools) {
    parts.push('');
    parts.push(TOOL_RULES);
  }
  return parts.join('\n');
}

function installSkill({ needsTools = true } = {}) {
  ensureDir(SKILL_DIR);
  fs.writeFileSync(SKILL_PATH, buildSkillContent(needsTools), 'utf-8');
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
