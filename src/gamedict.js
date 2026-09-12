// GameDictionary.xml — Zwift's own live catalogue, from their CDN.
//
// This is the authoritative source for route geometry (distance, ascent,
// lead-in, levelLocked, eventOnly, sport) and for the achievement list. It needs
// no authentication. It is fetched with a TTL and cached under the config dir;
// a snapshot committed to data/ keeps the tool working offline and keeps tests
// deterministic.
//
// What it does NOT have: the badge XP value (`experience`), the separate
// free-ride lead-in, and route slugs — those still come from zwift-data.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cdn } from 'zwift-api';
import { CONFIG_DIR, ensureConfigDir } from './config.js';

export const parse = cdn.parseGameDictionary;

const URL_XML = 'https://cdn.zwift.com/gameassets/GameDictionary.xml';
const CACHE = join(CONFIG_DIR, 'GameDictionary.xml');
const SNAPSHOT = new URL('../data/gamedict.json', import.meta.url);
const TTL_MS = 24 * 60 * 60 * 1000;

/** `map` attribute -> the world slug zwift-data and the rest of the app use. */
const WORLDS = {
  WATOPIA: 'watopia', NEWYORK: 'new-york', LONDON: 'london', RICHMOND: 'richmond',
  INNSBRUCK: 'innsbruck', YORKSHIRE: 'yorkshire', FRANCE: 'france', PARIS: 'paris',
  SCOTLAND: 'scotland', MAKURIISLANDS: 'makuri-islands', CRITCITY: 'crit-city',
  BOLOGNATT: 'bologna', 'GRAVEL MOUNTAIN': 'gravel-mountain',
};


/** Download if the cache is missing or stale. Never throws — falls back. */
export async function refresh({ ttlMs = TTL_MS, force = false } = {}) {
  try {
    if (!force) {
      const age = Date.now() - statSync(CACHE).mtimeMs;
      if (age < ttlMs) return { source: 'cache', ageMs: age };
    }
  } catch { /* no cache yet */ }
  try {
    const res = await fetch(URL_XML);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    if (!xml.includes('<GameDictionary')) throw new Error('unexpected payload');
    ensureConfigDir();
    writeFileSync(CACHE, xml);
    return { source: 'network', bytes: xml.length };
  } catch (err) {
    return { source: 'stale', error: err.message };
  }
}

let memo = null;
/** Synchronous read: live cache if present, else the committed snapshot. */
export function load() {
  if (memo) return memo;
  try {
    memo = { ...parse(readFileSync(CACHE, 'utf8')), source: 'cache' };
  } catch {
    const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
    memo = { routes: snap.routes, achievements: snap.achievements, source: 'snapshot' };
  }
  return memo;
}

export function writeSnapshot(xml) {
  const { routes, achievements } = parse(xml);
  writeFileSync(SNAPSHOT, JSON.stringify({
    _comment: 'Offline snapshot of Zwift GameDictionary.xml. Refresh with scripts/refresh-gamedict.js.',
    _generatedAt: new Date().toISOString().slice(0, 10),
    routes, achievements,
  }, null, 0) + '\n');
  return { routes: routes.length, achievements: achievements.length };
}
