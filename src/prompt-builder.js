const { getContextSummary } = require('./context-loader');

const STRICT_NO_VERBIAGE = `
STRICT OUTPUT RULES (token saving):
- No greetings, introductions, apologies, or closing remarks.
- No explanations unless explicitly requested.
- Output only: code, commands, file paths, tables, or concise technical facts.
- Use minimal words. Prefer bullet points and tables over paragraphs.
- If you must explain, keep it under one sentence.
`.trim();

const BINARY_GUARD = `
PAYLOAD GUARD:
- NEVER read the internal bytes of binary/multimedia files.
- Blocked extensions: .png .jpg .jpeg .gif .bmp .webp .ico .mp4 .mov .avi .mkv .mp3 .wav .exe .dll .zip .rar .7z .pdf .doc .docx.
- If you need to reference these files, use ONLY their name and extension.
- NEVER index or search inside node_modules, .git, or dependency folders; list filenames only when necessary.
`.trim();

const COMPRESSED_CODE_RULE = `
CODE TRANSMISSION FORMAT:
- Return code blocks in the most compact form possible: minimal whitespace, no decorative blank lines, no trailing spaces.
- Remove redundant indentation in transmitted code blocks.
- Do not minify to the point of being unreadable; just avoid decorative spacing.
`.trim();

const AUTO_FIX_PERSONA = `
MODE: AUTO-CORRECTION (temperature 0.0 implied).
- Analyze the error below with maximum precision.
- Propose the minimal fix.
- Output only the corrected command, code block, or exact file change.
- Do not add commentary.
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
    msg._relevance = score;
    return score >= threshold;
  });
}

function buildPrompt(userPrompt, context, options = {}) {
  const {
    autoFix = false,
    previousError = null,
    compress: doCompress = false,
    history = []
  } = options;

  const parts = [];

  // 1. System instruction at the very top for context caching
  parts.push('[SYSTEM]');
  parts.push(STRICT_NO_VERBIAGE);
  parts.push(BINARY_GUARD);
  parts.push(COMPRESSED_CODE_RULE);
  if (autoFix) {
    parts.push(AUTO_FIX_PERSONA);
  }

  // 2. Static context (KIMI.md, shared context) -> cached by provider
  const contextBlock = getContextSummary(context);
  if (contextBlock) {
    parts.push('\n[CONTEXT]');
    parts.push(contextBlock);
  }

  // 3. Filtered session history by relevance
  const relevantHistory = filterHistoryByRelevance(history, userPrompt);
  if (relevantHistory.length > 0) {
    parts.push('\n[RELEVANT_HISTORY]');
    for (const msg of relevantHistory) {
      parts.push(`${msg.role}: ${msg.content}`);
    }
  }

  // 4. User prompt or auto-fix payload
  if (autoFix && previousError) {
    parts.push('\n[AUTO_FIX_TRIGGER]');
    parts.push(`Previous attempt failed. Error:\n${previousError}`);
    parts.push('\nFix the error. Return only the corrected command or code.');
  } else {
    parts.push('\n[USER_PROMPT]');
    parts.push(userPrompt);
  }

  let finalPrompt = parts.join('\n');

  if (doCompress) {
    finalPrompt = compress(finalPrompt);
  }

  return finalPrompt;
}

module.exports = { buildPrompt, compress, extractKeywords, filterHistoryByRelevance };
