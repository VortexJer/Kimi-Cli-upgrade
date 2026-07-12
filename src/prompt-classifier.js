const fs = require('fs');
const path = require('path');

// Heuristic patterns that strongly suggest the user wants file/code/git/tool actions.
const TOOL_SIGNALS = [
  // Files and directories
  /\b(file|files|folder|directory|directories|path|paths|read|write|edit|create|delete|move|copy|rename)\b/i,
  /\b\.\/[a-zA-Z0-9_\-\/]/,
  /[A-Za-z]:\\/,
  /\b(glob|grep|search|find|ls|dir|cat|touch|mkdir|rm|cp|mv)\b/i,
  // Code / repo
  /\b(code|repo|repository|project|commit|branch|push|pull|git|github|merge|diff|patch)\b/i,
  // Commands / execution
  /\b(run|execute|exec|command|cmd|bash|powershell|terminal|shell|npm|node|python|pip|install|build|test)\b/i,
  // Specific tools / file references
  /\b(KIMI\.md|CLAUDE\.md|README|\.md|\.json|\.toml|\.yaml|\.yml|\.js|\.ts|\.py|\.log|\.txt)\b/i,
  // Actions that imply workspace interaction
  /\b(fix|debug|refactor|implement|add|remove|update|change|configure|setup|install)\s+(this|that|the|a|an)\b/i,
  /\b(revisa|revisar|actualiza|actualizar|modifica|modificar|corrige|corregir|busca|buscar|encuentra|encontrar|muestra|muestrame|muéstrame|borra|borrar|elimina|eliminar|copia|copiar|mueve|mover)\s+(esto|el|la|los|las|un|una|archivo|archivos|fichero|ficheros|configuracion|configuración|config|settings|carpeta|directorio|folder|src|backup|tmp|temp)\b/i,
  /\b(busca|buscar|encuentra|encontrar)\b.*\b(archivos?|ficheros?|\.log|\.txt|\.json|\.md)\b/i,
  /\b(config|configuration|configuracion|configuración|settings|package\.json|tsconfig|jsconfig)\b/i
];

// Patterns that are clearly conversational and unlikely to need tools.
const CONVERSATION_SIGNALS = [
  /^(hi|hello|hey|hola|buenas)\b/i,
  /\b(thank|thanks|gracias|please|por favor)\b/i,
  /\b(explain|explain to me|what is|how does|why is|what are|tell me about)\b/i,
  /\b(your opinion|do you think|can you help me understand)\b/i
];

function likelyNeedsTools(prompt) {
  if (!prompt || typeof prompt !== 'string') return false;
  const normalized = prompt.toLowerCase();

  // Very short greetings never need tools.
  if (/^(hi|hello|hey|hola|buenas)(\s|$)/i.test(prompt) && prompt.length < 30) {
    return false;
  }

  // Strong conversational signals override weak tool signals.
  const conversationScore = CONVERSATION_SIGNALS.reduce((acc, re) => acc + (re.test(normalized) ? 1 : 0), 0);
  const toolScore = TOOL_SIGNALS.reduce((acc, re) => acc + (re.test(normalized) ? 1 : 0), 0);

  // Need at least 2 tool signals, or 1 tool signal and no conversation signals.
  if (toolScore >= 2) return true;
  if (toolScore >= 1 && conversationScore === 0) return true;
  return false;
}

module.exports = { likelyNeedsTools };
