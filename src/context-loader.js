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

module.exports = { loadContext, getContextSummary, minifyText, isBinaryFile, BINARY_EXTENSIONS };
