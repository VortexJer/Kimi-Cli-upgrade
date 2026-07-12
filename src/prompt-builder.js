const { getContextSummary } = require('./context-loader');
const CONFIG = require('./config');

function maxStepsRule() {
  const n = CONFIG.getMaxSteps();
  return `LOOP BUDGET: max_steps_per_turn is ${n}. Complete your work within ${n} tool steps. Batch operations into single shell commands. If you cannot finish, emit "[CONTINUE]" so the wrapper resumes.`;
}

const STRICT_NO_VERBIAGE = `
TERSE OUTPUT:
- No greetings, apologies, explanations, or filler.
- Output only code, commands, paths, tables, or concise technical facts.
- Use bullets/tables, not paragraphs.
`.trim();

const BINARY_GUARD = `
PAYLOAD GUARD:
- NEVER read bytes of binary/media files (.png,.jpg,.mp4,.exe,.zip,.pdf,etc).
- NEVER index inside node_modules,.git,dependency folders.
- Reference blocked files by name+extension only.
`.trim();

const COMPRESSED_CODE_RULE = `
CODE FORMAT:
- Compact code blocks: no decorative blank lines or trailing spaces.
- Keep readability; do not minify symbols.
`.trim();

const TOOL_AVOIDANCE = `
TOOL USE:
- Do NOT call tools for simple questions, greetings, or explanations.
- Use tools ONLY when you must read files or run commands to answer.
- Batch multiple file reads into one shell command when possible.
`.trim();

const AUTO_FIX_PERSONA = `
MODE: AUTO-CORRECTION.
- Minimal fix only.
- Output corrected command/code; no commentary.
`.trim();

const NO_PREVIEW_RULE = `
PREVIEW POLICY (token saving):
- Do NOT generate screenshots, images, PDFs, or visual previews.
- Do NOT read media files to verify appearance.
- Focus only on writing clean, correct HTML/CSS/JS code.
`.trim();

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'as', 'it',
  'this', 'that', 'these', 'those', 'you', 'i', 'we', 'they', 'he', 'she',
  'el', 'la', 'los', 'las', 'de', 'en', 'y', 'o', 'que', 'por', 'para',
  'con', 'del', 'al', 'un', 'una', 'como', 'su', 'se', 'es', 'son'
]);

function compress(text) {
  return text
    .replace(/\b(please|kindly|could you|would you|I need you to)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(text) {
  const words = text.toLowerCase().match(/[a-z0-9_./\\-]+/g) || [];
  const keywords = new Set();
  for (const word of words) {
    if (word.length >= 3 && !STOP_WORDS.has(word)) {
      keywords.add(word);
    }
  }
  return keywords;
}

function relevanceScore(messageKeywords, currentKeywords) {
  if (!messageKeywords || messageKeywords.size === 0) return 0;
  let matches = 0;
  for (const kw of currentKeywords) {
    if (messageKeywords.has(kw)) matches++;
  }
  return matches / Math.max(messageKeywords.size, currentKeywords.size);
}

function filterHistoryByRelevance(history, currentPrompt, threshold = 0.1) {
  const currentKeywords = extractKeywords(currentPrompt);
  if (currentKeywords.size === 0) return history;

  return history.filter(msg => {
    if (!msg.content) return false;
    const msgKeywords = extractKeywords(msg.content);
    const score = relevanceScore(msgKeywords, currentKeywords);
    return score >= threshold;
  });
}

function cleanHistory(history) {
  return history.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
}

function buildPrompt(userPrompt, context, options = {}) {
  const {
    autoFix = false,
    previousError = null,
    previousOutput = null,
    compress: doCompress = false,
    history = [],
    preview = true
  } = options;

  const parts = [];

  // 1. Static system rules at the very top for potential caching
  parts.push('<system_rules>');
  parts.push(STRICT_NO_VERBIAGE);
  parts.push(BINARY_GUARD);
  parts.push(COMPRESSED_CODE_RULE);
  parts.push(TOOL_AVOIDANCE);
  parts.push(maxStepsRule());
  if (!preview) {
    parts.push(NO_PREVIEW_RULE);
  }
  if (autoFix) {
    parts.push(AUTO_FIX_PERSONA);
  }
  parts.push('</system_rules>');

  // 2. Static context (KIMI.md, shared context)
  const contextBlock = getContextSummary(context);
  if (contextBlock) {
    parts.push('<contexto_estatico>');
    parts.push(contextBlock);
    parts.push('</contexto_estatico>');
  }

  // 3. Filtered session history (metadata stripped), capped to save tokens
  const relevantHistory = filterHistoryByRelevance(cleanHistory(history), userPrompt).slice(-3);
  if (relevantHistory.length > 0) {
    parts.push('<historial_relevante>');
    for (const msg of relevantHistory) {
      parts.push(`<${msg.role}>${msg.content}</${msg.role}>`);
    }
    parts.push('</historial_relevante>');
  }

  // 4. User instruction or auto-fix payload
  if (autoFix && previousError) {
    parts.push('<instruccion>');
    parts.push('Previous attempt failed. Fix the error and return only the corrected command or code.');
    parts.push('</instruccion>');
    parts.push('<error>');
    parts.push(previousError);
    parts.push('</error>');
    if (previousOutput) {
      parts.push('<codigo_previo>');
      parts.push(previousOutput);
      parts.push('</codigo_previo>');
    }
  } else {
    parts.push('<instruccion>');
    parts.push(userPrompt);
    parts.push('</instruccion>');
  }

  let finalPrompt = parts.join('\n');

  if (doCompress) {
    finalPrompt = compress(finalPrompt);
  }

  return finalPrompt;
}

module.exports = { buildPrompt, compress, extractKeywords, filterHistoryByRelevance };
