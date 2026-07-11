const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const CONFIG = require('./config');
const { formatHeader, formatInfo, formatSuccess, createTable } = require('./formatter');

const SESSION_INDEX = path.join(CONFIG.KIMI1_HOME, 'session_index.jsonl');

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    return null;
  }
}

function readSessionIndex() {
  if (!fs.existsSync(SESSION_INDEX)) return [];
  const lines = fs.readFileSync(SESSION_INDEX, 'utf-8').split(/\r?\n/).filter(Boolean);
  return lines.map(line => {
    try {
      return JSON.parse(line);
    } catch (err) {
      return null;
    }
  }).filter(Boolean);
}

function formatDate(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function truncate(text, maxLength) {
  if (!text) return '-';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

const BAD_TITLE_STARTERS = ['actua','actúa','hazme','dame','dim','explica','explicame','cuentame','dime','muestrame','ensename','enseñame','pon','crea','genera','actualiza','modifica','borra','elimina','añade','agrega','muestra',
  'act','make','makes','give','gives','show','shows','explain','explains','tell','tells','create','creates','generate','generates','update','updates','modify','modifies','delete','deletes','remove','removes','add','adds'];

const STOP_WORDS = new Set([
  // spanish
  'el','la','los','las','un','una','unos','unas','de','del','a','al','en','por','para','con','sin','sobre','entre','hacia','desde','durante','segun','según','ante','bajo','hasta','mediante','excepto','salvo','como','que','quien','quienes','cuyo','cuya','cuyos','cuyas','cuando','donde','adonde','cuanto','cuanta','cuantos','cuantas','yo','tu','tú','el','ella','nosotros','vosotros','ellos','ellas','me','te','se','nos','os','lo','le','les','la','los','las','mio','mío','mía','mia','tuyo','tuya','suyo','suya','nuestro','vuestra','suyos','suyas','este','esta','esto','ese','esa','eso','aquel','aquella','aquello','estos','estas','esos','esas','aquellos','aquellas','mi','mis','tu','tus','su','sus','nuestro','nuestra','nuestros','nuestras','vuestro','vuestra','vuestros','vuestras','este','esta','estos','estas','ese','esa','esos','esas','aquel','aquella','aquellos','aquellas','muy','mas','más','tan','tanto','tanta','tantos','tantas','poco','poca','pocos','pocas','mucho','mucha','muchos','muchas','demasiado','demasiada','demasiados','demasiadas','todo','toda','todos','todas','cada','varios','varias','otro','otra','otros','otras','mismo','misma','mismos','mismas','tal','tales','cual','cuales','sea','sean','fue','era','es','son','soy','estoy','esta','estan','están','estaba','estaban','ser','estar','haber','hay','habia','había','tener','tiene','tienen','tenia','tenía','tengo','tenemos','teneis','tienes','hacer','hace','hacen','hacia','hizo','hace','decir','dice','dicen','dijo','dar','da','dan','dio','ver','ve','vio','ir','va','van','fue','iba','poder','puede','pueden','podia','podía','querer','quiere','quieren','quise','quiso','saber','sabe','saben','supo','creer','cree','creen','creia','creía','parecer','parece','parecen','parecia','parecía','deber','debe','deben','debia','debía','venir','viene','vienen','venia','venía','poner','pone','ponen','puso','seguir','sigue','siguen','seguia','seguía','sentir','siente','sienten','sentia','sentía','salir','sale','salen','salia','salía','volver','vuelve','vuelven','volvia','volvía','empezar','empieza','empiezan','empezo','empezó','terminar','termina','terminan','termino','terminó','empezar','comenzar','comienza','comienzan','comenzo','comenzó','llevar','lleva','llevan','llevaba','llevo','llevo','traer','trae','traen','traia','traía','obtener','obtiene','obtienen','obtenia','obtenía','buscar','busca','buscan','buscaba','busco','buscó','encontrar','encuentra','encuentran','encontraba','encontró','llamar','llama','llaman','llamaba','llamó','entrar','entra','entran','entraba','entró','trabajar','trabaja','trabajan','trabajaba','trabajó','preguntar','pregunta','preguntan','preguntaba','preguntó','responder','responde','responden','respondia','respondió','ayudar','ayuda','ayudan','ayudaba','ayudó','necesitar','necesita','necesitan','necesitaba','necesitó','gustar','gusta','gustan','gustaba','gustó','querer','quiero','quieres','quiere','queremos','quereis','quieren','quisiera','quisieras','quisiera','quisiéramos','quisierais','quisieran','por favor','favor',
  // english
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','as','is','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','can','shall','this','that','these','those','i','you','he','she','it','we','they','me','him','her','us','them','my','your','his','its','our','their','mine','yours','hers','ours','theirs','myself','yourself','himself','herself','itself','ourselves','yourselves','themselves','am','are','is','was','were','be','been','being','have','has','had','do','does','did','will','shall','would','should','could','may','might','must','can','need','dare','ought','used','here','there','where','when','why','how','what','who','which','whom','whose','all','any','both','each','few','more','most','other','some','such','no','nor','not','only','own','same','so','than','too','very','just','now','then','also','about','up','out','if','because','until','while','during','before','after','above','below','between','into','through','over','under','again','once','off','down','out','away','around','here','there','everywhere','somewhere','anywhere','please','want','wants','wanted','make','makes','made','get','gets','got','give','gives','gave','take','takes','took','come','comes','came','go','goes','went','see','sees','saw','know','knows','knew','think','thinks','thought','say','says','said','tell','tells','told','ask','asks','asked','work','works','worked','try','tries','tried','use','uses','used','find','finds','found','look','looks','looked','help','helps','helped','need','needs','needed','feel','feels','felt','seem','seems','seemed','leave','leaves','left','put','puts','keep','keeps','kept','let','lets','call','calls','called','turn','turns','turned','start','starts','started','show','shows','showed','hear','hears','heard','play','plays','played','run','runs','ran','move','moves','moved','live','lives','lived','believe','believes','believed','bring','brings','brought','happen','happens','happened','stand','stands','stood','lose','loses','lost','pay','pays','paid','meet','meets','met','include','includes','included','continue','continues','continued','set','sets','learn','learns','learned','change','changes','changed','lead','leads','led','understand','understands','understood','watch','watches','watched','follow','follows','followed','stop','stops','stopped','create','creates','created','speak','speaks','spoke','read','reads','read','spend','spends','spent','grow','grows','grew','open','opens','opened','walk','walks','walked','win','wins','won','offer','offers','offered','remember','remembers','remembered','love','loves','loved','consider','considers','considered','appear','appears','appeared','buy','buys','bought','wait','waits','waited','serve','serves','served','die','dies','died','send','sends','sent','expect','expects','expected','build','builds','built','stay','stays','stayed','fall','falls','fell','cut','cuts','cut','reach','reaches','reached','kill','kills','killed','remain','remains','remained','suggest','suggests','suggested','raise','raises','raised','pass','passes','passed','sell','sells','sold','require','requires','required','report','reports','reported','decide','decides','decided','pull','pulls','pulled',
  // extra imperatives / fillers
  'actua','actúa','hazme','dame','dim','explica','explicame','explicame','cuentame','cuéntame','dime','muestrame','muéstrame','ensename','ensename','enseñame','enseñame','pon','crea','genera','actualiza','modifica','borra','elimina','añade','agrega','muestra','dinos','cuentanos','cuéntanos',
  'act','explain','explains','explained','tell','tells','told','show','shows','showed','give','gives','gave','create','creates','created','generate','generates','generated','update','updates','updated','modify','modifies','modified','delete','deletes','deleted','remove','removes','removed','add','adds','added','display','displays','displayed','teach','teaches','taught','let','lets','make','makes','made'
]);

function readFirstPrompt(sessionDir) {
  const wirePath = path.join(sessionDir, 'agents', 'main', 'wire.jsonl');
  if (!fs.existsSync(wirePath)) return null;

  try {
    const data = fs.readFileSync(wirePath, 'utf-8');
    const lines = data.split(/\r?\n/).filter(Boolean);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'turn.prompt' && Array.isArray(entry.input)) {
          const text = entry.input.find(i => i.type === 'text')?.text;
          if (text) return text;
        }
        if (entry.type === 'context.append_message' && entry.message?.role === 'user') {
          const text = entry.message.content?.find(c => c.type === 'text')?.text;
          if (text) return text;
        }
      } catch (err) {
        // ignore malformed line
      }
    }
  } catch (err) {
    // ignore
  }
  return null;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);
}

const TITLE_RULES = [
  { pattern: /(?:mejora|mejorar|upgrade|modificar|actualizar).*kimi/i, title: 'Mejora el CLI de Kimi' },
  { pattern: /(?:continuar|contin[uú]e|resume).*sesi[oó]n/i, title: 'Continuar sesión anterior' },
  { pattern: /(?:historial|history).*chat/i, title: 'Historial de chats en Kimi' },
  { pattern: /claude/i, title: 'Importar chats de Claude Code' },
  { pattern: /(?:tabla|table).*lenguaje/i, title: 'Tabla de lenguajes de programación' },
  { pattern: /(?:script|scraper).*(?:enter|tecla|pulsador)/i, title: 'Pulsador automático de Enter' },
  { pattern: /(?:script|scraper)/i, title: 'Script personalizado' },
  { pattern: /(?:tabla|table)/i, title: 'Tabla informativa' }
];

function applyTitleRules(prompt) {
  for (const rule of TITLE_RULES) {
    if (rule.pattern.test(prompt)) return rule.title;
  }
  return null;
}

function extractLocalTitle(prompt) {
  if (!prompt) return 'Nueva sesión';

  const ruleTitle = applyTitleRules(prompt);
  if (ruleTitle) return ruleTitle;

  const clean = prompt
    .replace(/["'`]+/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = clean
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length >= 3)
    .filter(w => !STOP_WORDS.has(w))
    .slice(0, 6);

  if (words.length === 0) {
    return truncate(clean, 40) || 'Nueva sesión';
  }

  const title = words
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return truncate(title, 60);
}

function generateTitle(prompt) {
  return extractLocalTitle(prompt);
}

function isBadTitle(title, firstPrompt) {
  if (!title) return true;
  const t = title.trim();
  if (!t || t === '(no title)' || t.toLowerCase() === 'new session' || t.toLowerCase() === 'nueva sesión') return true;
  if (firstPrompt && firstPrompt.trim().toLowerCase().includes(t.toLowerCase())) return true;
  if (t.toLowerCase().includes('[redacted]')) return true;
  if (t.split(/\s+/).length > 10) return true;
  if (t.length > 70) return true;
  const lower = t.toLowerCase();
  if (BAD_TITLE_STARTERS.some(w => lower.startsWith(w + ' ') || lower === w)) return true;
  return false;
}

function ensureSessionTitle(entry) {
  const statePath = path.join(entry.sessionDir, 'state.json');
  const state = readJsonSafe(statePath) || {};

  const firstPrompt = readFirstPrompt(entry.sessionDir) || state.lastPrompt || '';

  if (!isBadTitle(state.title, firstPrompt)) {
    return state.title;
  }

  const newTitle = generateTitle(firstPrompt);
  if (newTitle && newTitle !== state.title) {
    state.title = newTitle;
    state.isCustomTitle = true;
    try {
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      // ignore write errors
    }
  }
  return newTitle;
}

function saveSessionTitleByPrompt(prompt, workDir) {
  if (!prompt) return null;
  const index = readSessionIndex();
  if (index.length === 0) return null;

  const candidates = index
    .filter(e => !workDir || (e.workDir || '').toLowerCase() === workDir.toLowerCase())
    .map(e => {
      const state = readJsonSafe(path.join(e.sessionDir, 'state.json')) || {};
      return { entry: e, updatedAt: state.updatedAt || state.createdAt, state };
    })
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  if (candidates.length === 0) return null;

  const { entry, state } = candidates[0];
  const newTitle = extractLocalTitle(prompt);
  if (newTitle && newTitle !== state.title) {
    state.title = newTitle;
    state.isCustomTitle = true;
    try {
      fs.writeFileSync(path.join(entry.sessionDir, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');
      return newTitle;
    } catch (err) {
      // ignore
    }
  }
  return null;
}

function renameAllSessions(options = {}) {
  const { silent = false, force = false } = options;
  const index = readSessionIndex();
  let renamed = 0;

  for (const entry of index) {
    const statePath = path.join(entry.sessionDir, 'state.json');
    const state = readJsonSafe(statePath) || {};
    const firstPrompt = readFirstPrompt(entry.sessionDir) || state.lastPrompt || '';

    if (!force && !isBadTitle(state.title, firstPrompt)) continue;

    const newTitle = extractLocalTitle(firstPrompt);
    if (newTitle) {
      state.title = newTitle;
      state.isCustomTitle = true;
      try {
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
        renamed++;
        if (!silent) console.log(formatInfo(`Renamed: ${newTitle}`));
      } catch (err) {
        // ignore
      }
    }
  }

  if (!silent) {
    console.log(formatSuccess(`Renamed ${renamed} session(s).`));
  }

  return renamed;
}

function getSessions() {
  const index = readSessionIndex();
  return index.map(entry => {
    const title = ensureSessionTitle(entry);
    const state = readJsonSafe(path.join(entry.sessionDir, 'state.json')) || {};
    const shortId = entry.sessionId.replace('session_', '').substring(0, 8);
    return {
      sessionId: entry.sessionId,
      shortId,
      title,
      updatedAt: state.updatedAt || state.createdAt,
      createdAt: state.createdAt,
      workDir: entry.workDir || state.workDir
    };
  }).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

function listHistory() {
  const sessions = getSessions();

  if (sessions.length === 0) {
    console.log(formatInfo('No sessions found.'));
    return;
  }

  const rows = sessions.map(s => [
    truncate(s.title, 35),
    formatInfo(s.shortId),
    formatDate(s.updatedAt),
    truncate(s.workDir, 25)
  ]);

  const table = createTable(
    ['Name', 'ID', 'Updated', 'Directory'],
    rows
  );

  console.log(table);
  console.log(formatInfo(`${sessions.length} sessions. Resume: kimi -S <id>`));
}

function showSessionDetail(sessionId) {
  const sessions = getSessions();
  const match = sessions.find(s =>
    s.sessionId === sessionId || s.shortId === sessionId || s.sessionId.replace('session_', '').startsWith(sessionId)
  );

  if (!match) {
    console.log(`Session not found: ${sessionId}`);
    return;
  }

  console.log(formatHeader(`Session: ${match.sessionId}`));
  console.log(`Updated: ${formatDate(match.updatedAt)}`);
  console.log(`Directory: ${match.workDir}`);
  console.log(`Title: ${match.title}`);
  console.log(`\nResume: kimi -S ${match.sessionId}`);
}

function hideCursor() {
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[?25l');
  }
}

function showCursor() {
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[?25h');
  }
}

function moveCursorUp(lines) {
  if (process.stdout.isTTY && lines > 0) {
    process.stdout.write(`\x1b[${lines}A`);
  }
}

function clearLine() {
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[2K\r');
  }
}

function buildMenuLines(sessions, selected) {
  const lines = [];
  lines.push('Select a Kimi session (Up/Down, Enter to open, Esc to cancel)');
  lines.push('');

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const isSelected = i === selected;
    const prefix = isSelected ? '> ' : '  ';
    const date = formatDate(s.updatedAt);
    const title = truncate(s.title, 55);
    const meta = `[${s.shortId}]  ${date}`;

    if (isSelected) {
      lines.push(`\x1b[32m${prefix}${title}\x1b[0m`);
    } else {
      lines.push(`${prefix}${title}`);
    }
    lines.push(`\x1b[90m   ${meta}\x1b[0m`);
  }

  return lines;
}

function renderMenu(sessions, selected, isUpdate = false) {
  const lines = buildMenuLines(sessions, selected);

  if (isUpdate && process.stdout.isTTY) {
    // Move cursor to the top of the menu and overwrite lines
    moveCursorUp(lines.length);
    for (const line of lines) {
      clearLine();
      process.stdout.write(line + '\n');
    }
  } else {
    for (const line of lines) {
      console.log(line);
    }
  }
}

async function interactiveSessionMenu(resumeCallback) {
  const sessions = getSessions();

  if (sessions.length === 0) {
    console.log(formatInfo('No sessions found.'));
    return;
  }

  // Fallback for non-TTY environments (pipes, CI, etc.)
  if (!process.stdin.isTTY) {
    return fallbackMenu(sessions, resumeCallback);
  }

  return new Promise((resolve) => {
    let selected = 0;
    let firstRender = true;

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    hideCursor();

    renderMenu(sessions, selected, false);
    firstRender = false;

    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onKey);
      showCursor();
    }

    async function onKey(chunk) {
      const key = chunk.toString();

      if (key === '\u0003') { // Ctrl+C
        cleanup();
        process.exit(0);
      }

      if (key === '\u001b') { // Esc
        cleanup();
        console.log(formatInfo('Cancelled.'));
        resolve();
        return;
      }

      if (key === '\r' || key === '\n') { // Enter
        cleanup();
        const sessionId = sessions[selected].sessionId;
        console.log(formatInfo(`Opening ${sessionId}...`));
        await resumeCallback(sessionId);
        resolve();
        return;
      }

      if (key === '\u001b[A') { // Up arrow
        selected = Math.max(0, selected - 1);
        renderMenu(sessions, selected, true);
      } else if (key === '\u001b[B') { // Down arrow
        selected = Math.min(sessions.length - 1, selected + 1);
        renderMenu(sessions, selected, true);
      }
    }

    process.stdin.on('data', onKey);
  });
}

async function fallbackMenu(sessions, resumeCallback) {
  const readline = require('readline');
  console.log(formatHeader('Select a session to resume'));
  sessions.forEach((s, i) => {
    console.log(`  ${i + 1}. ${truncate(s.title, 45)}`);
    console.log(`     ${formatInfo(`[${s.shortId}] ${formatDate(s.updatedAt)}`)}`);
  });
  console.log(formatInfo('Enter number or ID (empty to cancel):'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise((resolve) => {
    rl.question('> ', resolve);
  });
  rl.close();

  const trimmed = answer.trim();
  if (!trimmed) {
    console.log(formatInfo('Cancelled.'));
    return;
  }

  const num = parseInt(trimmed, 10);
  let selected;
  if (!isNaN(num) && num >= 1 && num <= sessions.length) {
    selected = sessions[num - 1];
  } else {
    selected = sessions.find(s => s.sessionId === trimmed || s.shortId === trimmed);
  }

  if (!selected) {
    console.log('Session not found.');
    return;
  }

  console.log(formatInfo(`Opening ${selected.sessionId}...`));
  await resumeCallback(selected.sessionId);
}

function isEmptySession(session) {
  const title = (session.title || '').trim();
  const lastPrompt = (session.lastPrompt || '').trim();

  if (!title && !lastPrompt) return true;
  if (title.toLowerCase() === 'new session') return true;
  if (title.toLowerCase() === '(no title)' && !lastPrompt) return true;
  return false;
}

function cleanEmptySessions(options = {}) {
  const { silent = false } = options;
  const index = readSessionIndex();
  if (index.length === 0) {
    if (!silent) console.log(formatInfo('No sessions to clean.'));
    return;
  }

  const keep = [];
  const remove = [];

  for (const entry of index) {
    const state = readJsonSafe(path.join(entry.sessionDir, 'state.json')) || {};
    const session = {
      sessionId: entry.sessionId,
      title: state.title || '',
      lastPrompt: state.lastPrompt || ''
    };

    if (isEmptySession(session)) {
      remove.push(entry);
    } else {
      keep.push(entry);
    }
  }

  if (remove.length === 0) {
    if (!silent) console.log(formatInfo('No empty sessions found.'));
    return 0;
  }

  // Remove session directories
  for (const entry of remove) {
    try {
      if (fs.existsSync(entry.sessionDir)) {
        fs.rmSync(entry.sessionDir, { recursive: true, force: true });
      }
    } catch (err) {
      if (!silent) console.log(formatInfo(`Could not remove ${entry.sessionId}: ${err.message}`));
    }
  }

  // Rewrite index without empty sessions
  const newIndexContent = keep.map(e => JSON.stringify(e)).join('\n');
  if (keep.length > 0) {
    fs.writeFileSync(SESSION_INDEX, newIndexContent + '\n', 'utf-8');
  } else {
    fs.writeFileSync(SESSION_INDEX, '', 'utf-8');
  }

  if (!silent) {
    console.log(formatSuccess(`Removed ${remove.length} empty session(s).`));
    console.log(formatInfo(`${keep.length} session(s) remaining.`));
  }
  return remove.length;
}

async function resumeSessionInteractive(resumeCallback) {
  await interactiveSessionMenu(resumeCallback);
}

module.exports = { listHistory, showSessionDetail, resumeSessionInteractive, interactiveSessionMenu, cleanEmptySessions, saveSessionTitleByPrompt, renameAllSessions };

