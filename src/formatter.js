const chalk = require('chalk');
const Table = require('cli-table3');

function formatHeader(text) {
  return chalk.bold.cyan(`\n=== ${text} ===\n`);
}

function formatError(text) {
  return chalk.bold.red(`\n[ERROR] ${text}`);
}

function formatSuccess(text) {
  return chalk.bold.green(`\n[OK] ${text}`);
}

function formatInfo(text) {
  return chalk.gray(text);
}

function createTable(headers, rows) {
  const table = new Table({
    head: headers.map(h => chalk.bold.white(h)),
    style: { border: ['gray'] }
  });
  rows.forEach(row => table.push(row));
  return table.toString();
}

function prettyPrintJSON(text) {
  try {
    const obj = JSON.parse(text);
    return JSON.stringify(obj, null, 2);
  } catch (err) {
    return text;
  }
}

function normalizeIndentation(lines) {
  // Detect base indentation from first non-empty line
  let baseIndent = Infinity;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const match = line.match(/^(\s*)/);
    const indent = match ? match[1].length : 0;
    if (indent < baseIndent) baseIndent = indent;
  }
  if (baseIndent === Infinity) baseIndent = 0;

  return lines.map(line => {
    if (line.trim() === '') return '';
    return line.substring(Math.min(baseIndent, line.length));
  });
}

function prettyPrintCodeBlock(code, language) {
  const lower = (language || '').toLowerCase();

  if (lower === 'json') {
    return prettyPrintJSON(code);
  }

  // General normalization: trim trailing spaces, normalize indentation
  const lines = code.split(/\r?\n/);
  const normalized = normalizeIndentation(lines);
  return normalized.join('\n').trim();
}

function prettyPrint(text) {
  // Match code blocks: ```lang\ncode\n```
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)\n```/g;
  let result = text;
  let match;
  const replacements = [];

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const [fullBlock, language, code] = match;
    const formatted = prettyPrintCodeBlock(code, language);
    replacements.push({ fullBlock, language, formatted });
  }

  // Apply replacements from end to start to preserve indices
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { fullBlock, language, formatted } = replacements[i];
    const start = text.lastIndexOf(fullBlock);
    if (start !== -1) {
      result = result.substring(0, start) + '```' + language + '\n' + formatted + '\n```' + result.substring(start + fullBlock.length);
    }
  }

  return result;
}

module.exports = { formatHeader, formatError, formatSuccess, formatInfo, createTable, prettyPrint, prettyPrintJSON };
