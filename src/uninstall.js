const fs = require('fs');
const path = require('path');
const os = require('os');
const { uninstallAll } = require('./profile-manager');
const { restoreOfficialConfig } = require('./config');
const { formatHeader, formatSuccess, formatError, formatInfo } = require('./formatter');

function uninstall() {
  console.log(formatHeader('kimi1 uninstall'));

  if (restoreOfficialConfig()) {
    console.log(formatSuccess('Configuracion oficial de Kimi restaurada desde backup.'));
  } else {
    console.log(formatInfo('No se encontro backup de la configuracion oficial.'));
  }

  const results = uninstallAll();
  for (const result of results) {
    if (result.backup) {
      console.log(formatInfo(`Backup creado: ${result.backup}`));
    }
    if (result.removedKimi) {
      console.log(formatSuccess(`Redireccion 'kimi' eliminada de: ${result.profilePath}`));
    }
    if (result.removedKimi1) {
      console.log(formatSuccess(`Alias 'kimi1' eliminado de: ${result.profilePath}`));
    }
    if (result.removedHistory) {
      console.log(formatSuccess(`Selector de historial eliminado de: ${result.profilePath}`));
    }
  }

  const projectDir = path.join(os.homedir(), 'kimi-cli-upgrade');
  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
    console.log(formatSuccess(`Directorio del proyecto eliminado: ${projectDir}`));
  } else {
    console.log(formatInfo('Directorio del proyecto no encontrado.'));
  }

  const isolatedHome = path.join(os.homedir(), '.kimi-code-kimi1');
  if (fs.existsSync(isolatedHome)) {
    fs.rmSync(isolatedHome, { recursive: true, force: true });
    console.log(formatSuccess(`Home aislado de kimi1 eliminado: ${isolatedHome}`));
  }

  console.log(formatSuccess('Desinstalacion completa. Reinicia tu sesion de PowerShell.'));
}

module.exports = { uninstall };
