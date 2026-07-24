const fs = require('fs');
const path = require('path');
const os = require('os');
const CONFIG = require('./config');

const HOME = os.homedir();
const KIMI1_SCRIPT = path.resolve(__dirname, '..', 'bin', 'kimi1.js');
const REDIRECT_FLAG = path.join(HOME, '.kimi-code-kimi1', 'redirect-enabled');
const IS_WIN = os.platform() === 'win32';

const PS_PROFILE_PATHS = [
  path.join(HOME, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
  path.join(HOME, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1')
];

// Unix: write to whichever rc files already exist so the redirect works in the
// user's actual shell; if none exist yet, default to ~/.bashrc.
function unixProfilePaths() {
  const candidates = [
    path.join(HOME, '.zshrc'),
    path.join(HOME, '.bashrc'),
    path.join(HOME, '.bash_profile'),
    path.join(HOME, '.profile')
  ];
  const existing = candidates.filter(p => fs.existsSync(p));
  return existing.length ? existing : [path.join(HOME, '.bashrc')];
}

function getProfilePaths() {
  return IS_WIN ? PS_PROFILE_PATHS : unixProfilePaths();
}

function findProfiles() {
  return getProfilePaths().filter(p => fs.existsSync(p));
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

function isRedirectEnabled() {
  return fs.existsSync(REDIRECT_FLAG);
}

function setRedirectEnabled(enabled) {
  const dir = path.dirname(REDIRECT_FLAG);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (enabled) {
    fs.writeFileSync(REDIRECT_FLAG, '1', 'utf-8');
  } else {
    try { fs.unlinkSync(REDIRECT_FLAG); } catch {}
  }
}

function hasKimiWrapper(profilePath) {
  return /#\s*BEGIN kimi1 wrapper/.test(readProfile(profilePath));
}

function hasKimi1Redirect(profilePath) {
  return /function\s+kimi1\s*\{/.test(readProfile(profilePath));
}

function removeAnyKimiBlocks(profilePath) {
  let content = readProfile(profilePath);
  let changed = false;

  // Remove current wrapper blocks
  const startMarker = '# BEGIN kimi1 wrapper';
  const endMarker = '# END kimi1 wrapper';
  let startIdx = content.indexOf(startMarker);
  while (startIdx !== -1) {
    const endIdx = content.indexOf(endMarker, startIdx);
    if (endIdx === -1) break;
    content = content.substring(0, startIdx) + content.substring(endIdx + endMarker.length);
    changed = true;
    startIdx = content.indexOf(startMarker);
  }

  // Remove old hybrid wrapper markers
  const oldStartMarker = '# BEGIN kimi hybrid wrapper';
  const oldEndMarker = '# END kimi hybrid wrapper';
  startIdx = content.indexOf(oldStartMarker);
  while (startIdx !== -1) {
    const endIdx = content.indexOf(oldEndMarker, startIdx);
    if (endIdx === -1) break;
    content = content.substring(0, startIdx) + content.substring(endIdx + oldEndMarker.length);
    changed = true;
    startIdx = content.indexOf(oldStartMarker);
  }

  // Remove standalone kimi1 alias line and history module import
  const lines = content.split(/\r?\n/);
  const filtered = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('# kimi1 alias')) continue;
    if (line.includes('function kimi1')) continue;
    if (/^\s*alias kimi1=/.test(line)) continue;      // unix alias from install.sh
    if (/^\s*kimi1\s*\(\)\s*\{/.test(line)) continue;  // stray unix function line
    if (line.includes('KimiHistory.psm1')) continue;
    if (line.includes('Kimi session history selector')) continue;
    filtered.push(line);
  }
  const newContent = filtered.join('\n');
  if (newContent !== content) changed = true;

  if (changed) {
    writeProfile(profilePath, newContent);
  }
  return changed;
}

function buildKimiWrapperBlock(kimi1Script) {
  const flagPath = REDIRECT_FLAG.replace(/\\/g, '\\');
  return `
# BEGIN kimi1 wrapper
if (Get-Alias kimi -ErrorAction SilentlyContinue) { Remove-Alias kimi -Force }
function kimi1 { node "${kimi1Script}" @args }

function kimi {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$KimiArgs)
    $kimiExe = (Get-Command kimi -CommandType Application | Select-Object -First 1).Source
    if (($KimiArgs -contains '--help') -or ($KimiArgs -contains '-h')) {
        & $kimiExe --help
        Write-Host ''
        Write-Host 'The kimi1 wrapper adds more commands. See them with: kimi1 --help' -ForegroundColor DarkGray
        return
    }
    $redirectFlag = "${flagPath}"
    $redirectEnabled = Test-Path $redirectFlag
    if ($redirectEnabled) {
        node "${kimi1Script}" @KimiArgs
        return
    }
    $kimi1Flags = @{
        '--sessions' = $true; '--select' = $true; '--pick' = $true; '-s' = $true;
        '--list' = $true; '--list-history' = $true; '--table' = $true;
        '--rename-sessions' = $true; '--rs' = $true;
        '--clean-empty' = $true; '--clean' = $true; '--purge' = $true;
        '--dry-run' = $true; '--dr' = $true;
        '--enable-kimi' = $true; '--e-k' = $true;
        '--disable-kimi' = $true; '--d-k' = $true;
        '--max-steps' = $true; '--ms' = $true;
        '--thinking' = $true; '--th' = $true;
        '--compress' = $true; '--cp' = $true;
        '--cache' = $true; '--ca' = $true;
        '--no-context' = $true; '--nc' = $true;
        '--fix' = $true; '-f' = $true; '--fork' = $true; '-fk' = $true;
        '-l' = $true; '-rs' = $true; '-ce' = $true; '-dr' = $true;
        '-e' = $true; '-d' = $true; '-i' = $true; '-r' = $true
    }
    $useKimi1 = $false
    foreach ($arg in $KimiArgs) {
        if ($kimi1Flags.ContainsKey($arg)) { $useKimi1 = $true; break }
    }
    if ($useKimi1) {
        node "${kimi1Script}" @KimiArgs
    } else {
        & $kimiExe @KimiArgs
    }
}
# END kimi1 wrapper
`;
}

// Bash/zsh equivalent of the PowerShell hybrid wrapper. Same marker so the
// block-removal logic is shared across platforms. The real kimi binary is
// invoked by absolute path to avoid the function recursing into itself.
function buildUnixWrapperBlock(kimi1Script, kimiExe, flagPath) {
  const wrapperFlags = [
    '--sessions', '-s', '--list', '--list-history', '-l',
    '--rename-sessions', '-rs', '--clean-empty', '-ce',
    '--dry-run', '-dr', '--enable-kimi', '-e', '--disable-kimi', '-d',
    '--restore-official-config', '-roc',
    '--max-steps', '-ms', '--thinking', '-th',
    '--compress', '-cp', '--cache', '-ca', '--no-context', '-nc', '--fix', '-f',
    '--fork', '-fk', '--migrate-history', '-mh', '--compact-mode', '-cm',
    '--uninstall', '-u', '--help', '-h', '--interactive', '-i',
    '--resume', '-r', '--id', '-id'
  ];
  const cases = wrapperFlags.join('|');
  return `
# BEGIN kimi1 wrapper
kimi1() { node "${kimi1Script}" "$@"; }
kimi() {
  if [ -f "${flagPath}" ]; then
    node "${kimi1Script}" "$@"
    return
  fi
  case "$1" in
    ${cases})
      node "${kimi1Script}" "$@"
      ;;
    *)
      "${kimiExe}" "$@"
      ;;
  esac
}
# END kimi1 wrapper
`;
}

function addKimiWrapper(profilePath) {
  ensureProfileDir(profilePath);
  removeAnyKimiBlocks(profilePath);
  const block = IS_WIN
    ? buildKimiWrapperBlock(KIMI1_SCRIPT)
    : buildUnixWrapperBlock(KIMI1_SCRIPT, CONFIG.KIMI_EXE, REDIRECT_FLAG);
  const content = readProfile(profilePath) + block;
  writeProfile(profilePath, content);
  return true;
}

function removeKimiWrapper(profilePath) {
  return removeAnyKimiBlocks(profilePath);
}

function enableKimiRedirect() {
  setRedirectEnabled(true);
  // Backup official config before first sync, then copy isolated settings over.
  const configBackupCreated = CONFIG.backupOfficialConfig();
  const configSynced = CONFIG.syncOfficialConfigFromIsolated();
  const results = [];
  for (const profilePath of getProfilePaths()) {
    const backup = backupProfile(profilePath);
    // Always (re)install a fresh block. addKimiWrapper removes any prior block
    // first, so re-running --enable-kimi upgrades an outdated wrapper instead of
    // leaving a stale one in place.
    const added = addKimiWrapper(profilePath);
    results.push({ profilePath, backup, added, configBackupCreated, configSynced });
  }
  return results;
}

function disableKimiRedirect() {
  setRedirectEnabled(false);
  // Restore official Kimi config so direct 'kimi' calls are not affected by
  // wrapper settings anymore. If no backup exists, reset to sane defaults.
  const configRestored = CONFIG.restoreOfficialConfig();
  const configReset = configRestored ? false : CONFIG.resetOfficialConfigToDefaults();
  const results = [];
  for (const profilePath of getProfilePaths()) {
    const backup = backupProfile(profilePath);
    const removed = removeKimiWrapper(profilePath);
    results.push({ profilePath, backup, removed, configRestored, configReset });
  }
  return results;
}

function installAll() {
  const results = [];
  for (const profilePath of getProfilePaths()) {
    const backup = backupProfile(profilePath);
    const added = addKimiWrapper(profilePath);
    results.push({ profilePath, backup, added });
  }
  return results;
}

function uninstallAll() {
  setRedirectEnabled(false);
  const results = [];
  for (const profilePath of getProfilePaths()) {
    const backup = backupProfile(profilePath);
    const removed = removeKimiWrapper(profilePath);
    results.push({ profilePath, backup, removed });
  }
  return results;
}

module.exports = {
  findProfiles,
  hasKimiRedirect: hasKimiWrapper,
  hasKimi1Redirect,
  isRedirectEnabled,
  enableKimiRedirect,
  disableKimiRedirect,
  installAll,
  uninstallAll,
  buildUnixWrapperBlock,
  buildKimiWrapperBlock
};
