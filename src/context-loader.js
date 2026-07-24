const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp', '.ico',
  '.mp4', '.mov', '.avi', '.mkv', '.webm',
  '.mp3', '.wav', '.ogg', '.flac',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.ttf', '.otf', '.woff', '.woff2', '.eot'
]);

function isBinaryFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function minifyText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function readFileIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      if (isBinaryFile(filePath)) {
        return `[ARCHIVO BINARIO BLOQUEADO: ${path.basename(filePath)}]`;
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return minifyText(content);
    }
  } catch (err) {
    // Silently ignore read errors
  }
  return null;
}

function loadContext(cwd) {
  const context = {};

  for (const filename of CONFIG.CONTEXT_FILES) {
    const filePath = path.join(cwd, filename);
    const content = readFileIfExists(filePath);
    if (content) {
      context[filename] = content;
    }
  }

  return context;
}

// Inline files the user referenced with @path in the prompt. Reading them here
// (controlled, capped) is cheaper and more precise than letting the agent burn
// tool steps/tokens discovering and reading them. Binary/huge files are skipped.
function loadFileMentions(prompt, cwd) {
  const mentions = prompt.match(/@[^\s@]+/g) || [];
  const files = [];
  const seen = new Set();
  for (const raw of mentions) {
    const rel = raw.slice(1).replace(/[.,;:)\]]+$/, ''); // drop trailing punctuation
    if (!rel || seen.has(rel)) continue;
    const full = path.isAbsolute(rel) ? rel : path.join(cwd, rel);
    try {
      const st = fs.statSync(full);
      if (!st.isFile()) continue;
      seen.add(rel);
      if (isBinaryFile(full)) {
        files.push({ path: rel, content: '[binary file omitted]' });
      } else if (st.size > 100 * 1024) {
        files.push({ path: rel, content: `[file too large to inline: ${(st.size / 1024).toFixed(0)} KB]` });
      } else {
        files.push({ path: rel, content: minifyText(fs.readFileSync(full, 'utf-8')) });
      }
    } catch (err) {
      // not an existing file — leave the @token as plain text
    }
  }
  return files;
}

function getContextSummary(context) {
  const parts = [];
  if (context['KIMI.md']) {
    parts.push(`[KIMI.md]\n${context['KIMI.md']}`);
  }
  if (context['.ai-shared-context.md']) {
    parts.push(`[SHARED_CONTEXT]\n${context['.ai-shared-context.md']}`);
  }
  if (context['.globalcontext.md']) {
    parts.push(`[GLOBAL_CONTEXT]\n${context['.globalcontext.md']}`);
  }
  return parts.join('\n\n---\n\n');
}

module.exports = { loadContext, getContextSummary, minifyText, isBinaryFile, BINARY_EXTENSIONS, loadFileMentions };
