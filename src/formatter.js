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

// Light-touch inline markdown: headers, bold, inline code, bullets.
function renderInline(line) {
  const h = line.match(/^(#{1,6})\s+(.*)$/);
  if (h) return chalk.bold.cyan(h[2]);
  let out = line.replace(/^(\s*)[-*]\s+/, (_, s) => s + chalk.cyan('• '));
  out = out.replace(/\*\*([^*]+)\*\*/g, (_, t) => chalk.bold(t));
  out = out.replace(/`([^`]+)`/g, (_, t) => chalk.yellow(t));
  return out;
}

// Render Kimi's markdown-ish output: colorized inline elements and fenced code
// blocks framed with a dim border + language label (JSON blocks pretty-printed).
function prettyPrint(text) {
  if (typeof text !== 'string' || !text) return text;
  const parts = text.split('```');
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const seg = parts[i].replace(/^\n/, '');
      const nl = seg.indexOf('\n');
      const firstTok = nl > -1 ? seg.slice(0, nl).trim() : seg.trim();
      const hasLang = firstTok.length > 0 && !/\s/.test(firstTok) && firstTok.length < 20;
      const lang = hasLang ? firstTok : '';
      let body = hasLang && nl > -1 ? seg.slice(nl + 1) : seg;
      if (lang.toLowerCase() === 'json') body = prettyPrintJSON(body.trim()) + '\n';
      const label = lang || 'code';
      out.push(chalk.gray('┌─ ' + label + ' ' + '─'.repeat(Math.max(2, 42 - label.length))));
      for (const l of body.replace(/\n$/, '').split('\n')) out.push(chalk.gray('│ ') + l);
      out.push(chalk.gray('└' + '─'.repeat(44)));
    } else {
      for (const l of parts[i].split('\n')) out.push(renderInline(l));
    }
  }
  return out.join('\n');
}

module.exports = { formatHeader, formatError, formatSuccess, formatInfo, createTable, prettyPrint, prettyPrintJSON };
