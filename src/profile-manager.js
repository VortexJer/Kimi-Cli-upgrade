const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const KIMI1_SCRIPT = path.resolve(__dirname, '..', 'bin', 'kimi1.js');

const PROFILE_PATHS = [
  path.join(HOME, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
  path.join(HOME, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1')
];

function findProfiles() {
  return PROFILE_PATHS.filter(p => fs.existsSync(p));
}

function ensureProfileDir(profilePath) {
  const dir = path.dirname(profilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function backupProfile(profilePath) {
  if (!fs.existsSync(profilePath)) return null;
  const backupPath = `${profilePath}.kimi1-backup-${Date.now()}`;
  fs.copyFileSync(profilePath, backupPath);
  return backupPath;
}

function readProfile(profilePath) {
  if (!fs.existsSync(profilePath)) return '';
  return fs.readFileSync(profilePath, 'utf-8');
}

function writeProfile(profilePath, content) {
  fs.writeFileSync(profilePath, content, 'utf-8');
}

function hasKimi1Redirect(profilePath) {
  const content = readProfile(profilePath);
  return /function\s+kimi1\s*\{/.test(content);
}

function hasKimiRedirect(profilePath) {
  const content = readProfile(profilePath);
  return /#\s*kimi redirect to kimi1/.test(content) || /function\s+kimi\s*\{/.test(content);
}

function addKimi1Redirect(profilePath) {
  ensureProfileDir(profilePath);
  const block = `\n# kimi1 alias\nfunction kimi1 { node "${KIMI1_SCRIPT}" @args }\n`;

  let content = readProfile(profilePath);
  if (!hasKimi1Redirect(profilePath)) {
    content += block;
    writeProfile(profilePath, content);
    return true;
  }
  return false;
}

function removeKimi1Redirect(profilePath) {
  let content = readProfile(profilePath);
  const lines = content.split(/\r?\n/);
  const filtered = [];
  let skip = false;
  for (const line of lines) {
    if (line.includes('# kimi1 alias')) {
      skip = true;
      continue;
    }
    if (skip && line.trim() === '') {
      skip = false;
      continue;
    }
    if (skip && !line.includes('function kimi1')) {
      skip = false;
    }
    if (line.includes('function kimi1')) {
      skip = false;
      continue;
    }
    filtered.push(line);
  }
  const newContent = filtered.join('\n');
  if (newContent !== content) {
    writeProfile(profilePath, newContent);
    return true;
  }
  return false;
}

function addKimiRedirect(profilePath) {
  ensureProfileDir(profilePath);
  const block = `\n# kimi redirect to kimi1\nfunction kimi { node "${KIMI1_SCRIPT}" @args }\n`;

  let content = readProfile(profilePath);
  if (!hasKimiRedirect(profilePath)) {
    content += block;
    writeProfile(profilePath, content);
    return true;
  }
  return false;
}

function removeKimiRedirect(profilePath) {
  let content = readProfile(profilePath);
  const lines = content.split(/\r?\n/);
  const filtered = [];
  let skip = false;
  for (const line of lines) {
    if (line.includes('# kimi redirect to kimi1')) {
      skip = true;
      continue;
    }
    if (skip && line.trim() === '') {
      skip = false;
      continue;
    }
    if (skip && !line.includes('function kimi {')) {
      skip = false;
    }
    if (line.includes('function kimi {')) {
      skip = false;
      continue;
    }
    filtered.push(line);
  }
  const newContent = filtered.join('\n');
  if (newContent !== content) {
    writeProfile(profilePath, newContent);
    return true;
  }
  return false;
}

function enableKimiRedirect() {
  const results = [];
  for (const profilePath of PROFILE_PATHS) {
    const backup = backupProfile(profilePath);
    const added = addKimiRedirect(profilePath);
    results.push({ profilePath, backup, added });
  }
  return results;
}

function disableKimiRedirect() {
  const results = [];
  for (const profilePath of PROFILE_PATHS) {
    const backup = backupProfile(profilePath);
    const removed = removeKimiRedirect(profilePath);
    results.push({ profilePath, backup, removed });
  }
  return results;
}

function installAll() {
  const results = [];
  for (const profilePath of PROFILE_PATHS) {
    const backup = backupProfile(profilePath);
    const addedKimi1 = addKimi1Redirect(profilePath);
    const addedKimi = addKimiRedirect(profilePath);
    results.push({ profilePath, backup, addedKimi1, addedKimi });
  }
  return results;
}

function removeHistoryModule(profilePath) {
  if (!fs.existsSync(profilePath)) return false;
  const content = fs.readFileSync(profilePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const filtered = lines.filter(line => {
    return !line.includes('KimiHistory.psm1') &&
           !line.includes('Kimi session history selector');
  });
  if (filtered.length !== lines.length) {
    fs.writeFileSync(profilePath, filtered.join('\n'), 'utf-8');
    return true;
  }
  return false;
}

function uninstallAll() {
  const results = [];
  for (const profilePath of PROFILE_PATHS) {
    const backup = backupProfile(profilePath);
    const removedKimi = removeKimiRedirect(profilePath);
    const removedKimi1 = removeKimi1Redirect(profilePath);
    const removedHistory = removeHistoryModule(profilePath);
    results.push({ profilePath, backup, removedKimi, removedKimi1, removedHistory });
  }
  return results;
}

module.exports = {
  findProfiles,
  hasKimiRedirect,
  hasKimi1Redirect,
  enableKimiRedirect,
  disableKimiRedirect,
  installAll,
  uninstallAll
};
