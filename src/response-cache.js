const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CONFIG = require('./config');

const CACHE_FILE = path.join(CONFIG.KIMI1_HOME, 'response-cache.json');
const DEFAULT_TTL_MINUTES = 60;

function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return {};
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  CONFIG.setupKimi1Home();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

function hashPrompt(prompt) {
  return crypto.createHash('sha256').update(prompt, 'utf-8').digest('hex').slice(0, 32);
}

function getCachedResponse(prompt, ttlMinutes = DEFAULT_TTL_MINUTES) {
  const cache = loadCache();
  const key = hashPrompt(prompt);
  const entry = cache[key];
  if (!entry) return null;
  const ageMin = (Date.now() - entry.ts) / 60000;
  if (ageMin > ttlMinutes) {
    delete cache[key];
    saveCache(cache);
    return null;
  }
  return entry.stdout;
}

function setCachedResponse(prompt, stdout) {
  const cache = loadCache();
  cache[hashPrompt(prompt)] = { ts: Date.now(), stdout };
  saveCache(cache);
}

function clearCache() {
  saveCache({});
}

module.exports = { getCachedResponse, setCachedResponse, clearCache };
