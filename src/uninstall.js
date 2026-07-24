const fs = require('fs');
const path = require('path');
const os = require('os');
const { uninstallAll } = require('./profile-manager');
const { restoreOfficialConfig } = require('./config');
const { formatHeader, formatSuccess, formatError, formatInfo } = require('./formatter');

function uninstall() {
  console.log(formatHeader('kimi1 uninstall'));

  if (restoreOfficialConfig()) {
    console.log(formatSuccess('Official Kimi config restored from backup.'));
  } else {
    console.log(formatInfo('No official config backup found.'));
  }

  const results = uninstallAll();
  for (const result of results) {
    if (result.backup) {
      console.log(formatInfo(`Backup created: ${result.backup}`));
    }
    if (result.removed) {
      console.log(formatSuccess(`Wrapper 'kimi'/'kimi1' removed from: ${result.profilePath}`));
    } else {
      console.log(formatInfo(`No changes in: ${result.profilePath}`));
    }
  }

  const projectDir = path.join(os.homedir(), 'kimi-cli-upgrade');
  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
    console.log(formatSuccess(`Project directory removed: ${projectDir}`));
  } else {
    console.log(formatInfo('Project directory not found.'));
  }

  const isolatedHome = path.join(os.homedir(), '.kimi-code-kimi1');
  if (fs.existsSync(isolatedHome)) {
    fs.rmSync(isolatedHome, { recursive: true, force: true });
    console.log(formatSuccess(`kimi1 isolated home removed: ${isolatedHome}`));
  }

  console.log(formatSuccess('Uninstall complete. Restart your PowerShell session.'));
}

module.exports = { uninstall };
