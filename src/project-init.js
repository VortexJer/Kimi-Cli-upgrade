const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Generate a starter KIMI.md by scanning the project locally (zero API calls),
// like Claude Code's /init. Captures stack, structure, and run commands so the
// wrapper can inject real project context instead of the model rediscovering it.

const LANG_BY_EXT = {
  '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.py': 'Python', '.rb': 'Ruby', '.go': 'Go', '.rs': 'Rust',
  '.java': 'Java', '.kt': 'Kotlin', '.c': 'C', '.h': 'C', '.cpp': 'C++', '.cc': 'C++',
  '.cs': 'C#', '.php': 'PHP', '.swift': 'Swift', '.m': 'Objective-C',
  '.sh': 'Shell', '.ps1': 'PowerShell', '.lua': 'Lua', '.dart': 'Dart',
  '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS', '.vue': 'Vue', '.svelte': 'Svelte',
  '.sql': 'SQL'
};

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'target', '.venv', 'venv', '__pycache__', 'vendor', 'coverage']);

function gitInfo(cwd) {
  const info = {};
  try {
    info.branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { /* not git */ }
  try {
    info.remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { /* no remote */ }
  return info;
}

function scanLanguages(cwd, maxDepth = 4) {
  const counts = {};
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.') continue;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(path.join(dir, e.name), depth + 1);
      } else {
        const lang = LANG_BY_EXT[path.extname(e.name).toLowerCase()];
        if (lang) counts[lang] = (counts[lang] || 0) + 1;
      }
    }
  }
  walk(cwd, 0);
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function topLevel(cwd) {
  try {
    return fs.readdirSync(cwd, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
      .map(e => e.name + '/')
      .sort();
  } catch { return []; }
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function generateKimiMd(cwd) {
  const name = path.basename(cwd);
  const langs = scanLanguages(cwd);
  const dirs = topLevel(cwd);
  const git = gitInfo(cwd);
  const pkg = readJson(path.join(cwd, 'package.json'));
  const py = fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'requirements.txt'));

  const L = [];
  L.push(`# ${pkg && pkg.name ? pkg.name : name}`);
  L.push('');
  if (pkg && pkg.description) L.push(pkg.description, '');
  L.push('## Stack');
  if (langs.length) L.push(langs.map(([l, n]) => `${l} (${n})`).join(', '));
  else L.push('_unknown — no source files detected_');
  L.push('');

  L.push('## Structure');
  L.push(dirs.length ? dirs.map(d => `- ${d}`).join('\n') : '- (flat)');
  L.push('');

  const cmds = [];
  if (pkg && pkg.scripts) for (const [k, v] of Object.entries(pkg.scripts)) cmds.push(`- \`npm run ${k}\` — ${v}`);
  if (py) cmds.push('- Python project (see pyproject.toml / requirements.txt)');
  if (cmds.length) {
    L.push('## Commands');
    L.push(cmds.join('\n'));
    L.push('');
  }

  if (git.branch || git.remote) {
    L.push('## Repo');
    if (git.remote) L.push(`- Remote: ${git.remote}`);
    if (git.branch) L.push(`- Branch: ${git.branch}`);
    L.push('');
  }

  L.push('## Conventions');
  L.push('_Add project-specific rules here (style, do/don\'t, key files)._');
  L.push('');
  L.push('## Notes');
  L.push('_kimi1 --remember "..." appends here._');
  L.push('');
  return L.join('\n');
}

module.exports = { generateKimiMd, scanLanguages, gitInfo };
