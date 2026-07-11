const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');

const OFFICIAL_INDEX = path.join(CONFIG.KIMI_HOME, 'session_index.jsonl');
const ISOLATED_INDEX = path.join(CONFIG.KIMI1_HOME, 'session_index.jsonl');

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function writeJsonl(filePath, entries) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, entries.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8');
}

function copyDirRecursive(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function migrateOfficialSessions() {
  CONFIG.setupKimi1Home();
  const officialEntries = readJsonl(OFFICIAL_INDEX);
  if (officialEntries.length === 0) return { migrated: 0, skipped: 0 };

  const isolatedEntries = readJsonl(ISOLATED_INDEX);
  const existingIds = new Set(isolatedEntries.map(e => e.sessionId));

  let migrated = 0;
  let skipped = 0;
  const newEntries = [...isolatedEntries];

  for (const entry of officialEntries) {
    if (!entry.sessionId || !entry.sessionDir) continue;
    if (existingIds.has(entry.sessionId)) {
      skipped++;
      continue;
    }

    const officialSessionDir = entry.sessionDir;
    const isolatedSessionDir = officialSessionDir.replace(
      /\\\.kimi-code\\/g,
      path.sep + '.kimi-code-kimi1' + path.sep
    ).replace(/\/.kimi-code\//g, '/.kimi-code-kimi1/');

    if (fs.existsSync(officialSessionDir)) {
      copyDirRecursive(officialSessionDir, isolatedSessionDir);
    }

    const newEntry = {
      ...entry,
      sessionDir: isolatedSessionDir
    };
    newEntries.push(newEntry);
    existingIds.add(entry.sessionId);
    migrated++;
  }

  writeJsonl(ISOLATED_INDEX, newEntries);
  return { migrated, skipped };
}

module.exports = { migrateOfficialSessions };
