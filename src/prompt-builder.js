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

function compress(text) {
  return text
    .replace(/\b(please|kindly|could you|would you|I need you to)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPrompt(userPrompt, context, options = {}) {
  const {
    autoFix = false,
    previousError = null,
    previousOutput = null,
    compress: doCompress = false,
    preview = true,
    needsTools = true,
    files = []
  } = options;

  const parts = [];

  // 1. Static system rules at the very top for potential caching.
  // Chat mode keeps ONLY rules that apply to a no-tools answer (terse output +
  // code formatting). File/media/tool rules (payload guard, tool avoidance,
  // loop budget, preview policy) are irrelevant when no tools run, so they are
  // gated behind needsTools to cut ~90 tokens per conversational prompt.
  parts.push('<system_rules>');
  parts.push(STRICT_NO_VERBIAGE);
  parts.push(COMPRESSED_CODE_RULE);
  if (needsTools) {
    parts.push(BINARY_GUARD);
    parts.push(TOOL_AVOIDANCE);
    parts.push(maxStepsRule());
    if (!preview) {
      parts.push(NO_PREVIEW_RULE);
    }
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

  // 2b. Files the user inlined with @path
  if (files && files.length > 0) {
    parts.push('<archivos_referenciados>');
    for (const f of files) {
      parts.push(`<archivo path="${f.path}">`);
      parts.push(f.content);
      parts.push('</archivo>');
    }
    parts.push('</archivos_referenciados>');
  }

  // 3. User instruction or auto-fix payload
  // NOTE: no session history is injected here on purpose. Kimi maintains the
  // conversation context server-side per session, so re-sending prior messages
  // would duplicate that context and waste tokens.
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

module.exports = { buildPrompt, compress };
