// Climb Portal roads: caching policy. Parsing and the "which is open" logic
// live in zwift-api; this adds the TTL cache and offline snapshot.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cdn } from 'zwift-api';
import { CONFIG_DIR, ensureConfigDir } from './config.js';

export const parse = cdn.parsePortalRoads;
export const activeRoads = cdn.activePortalRoads;
export const nextChange = cdn.nextPortalChange;

const CACHE = join(CONFIG_DIR, 'PortalRoadSchedule_v1.xml');
const SNAPSHOT = new URL('../data/portal-roads.json', import.meta.url);
const TTL_MS = 24 * 60 * 60 * 1000;
const URL_XML = 'https://cdn.zwift.com/gameassets/PortalRoadSchedule_v1.xml';

export async function refresh({ ttlMs = TTL_MS, force = false } = {}) {
  try {
    if (!force && Date.now() - statSync(CACHE).mtimeMs < ttlMs) return { source: 'cache' };
  } catch { /* no cache yet */ }
  try {
    const res = await fetch(URL_XML);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    if (!xml.includes('<PortalRoads')) throw new Error('unexpected payload');
    ensureConfigDir();
    writeFileSync(CACHE, xml);
    return { source: 'network', bytes: xml.length };
  } catch (err) {
    return { source: 'stale', error: err.message };
  }
}

let memo = null;
export function load() {
  if (memo) return memo;
  try {
    memo = { ...parse(readFileSync(CACHE, 'utf8')), source: 'cache' };
  } catch {
    const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
    // Dates do not survive JSON.
    memo = { roads: snap.roads, schedule: snap.schedule.map((a) => ({ ...a, start: new Date(a.start) })), source: 'snapshot' };
  }
  return memo;
}

export function writeSnapshot(xml) {
  const { roads, schedule } = parse(xml);
  writeFileSync(SNAPSHOT, JSON.stringify({
    _comment: 'Offline snapshot of PortalRoadSchedule_v1.xml. Refresh with scripts/refresh-gamedict.js.',
    _generatedAt: new Date().toISOString().slice(0, 10),
    roads, schedule,
  }) + '\n');
  return { roads: roads.length, schedule: schedule.length };
}
