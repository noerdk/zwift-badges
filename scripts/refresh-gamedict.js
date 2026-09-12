#!/usr/bin/env node
// Refresh the GameDictionary cache and the committed offline snapshot.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { refresh, writeSnapshot } from '../src/gamedict.js';
import { refresh as refreshPortals, writeSnapshot as writePortalSnapshot } from '../src/portals.js';
import { CONFIG_DIR } from '../src/config.js';

const r = await refresh({ force: true });
console.log('fetch:', JSON.stringify(r));
const xml = readFileSync(join(CONFIG_DIR, 'GameDictionary.xml'), 'utf8');
console.log('snapshot:', JSON.stringify(writeSnapshot(xml)));

const p = await refreshPortals({ force: true });
console.log('portal fetch:', JSON.stringify(p));
const pxml = readFileSync(join(CONFIG_DIR, 'PortalRoadSchedule_v1.xml'), 'utf8');
console.log('portal snapshot:', JSON.stringify(writePortalSnapshot(pxml)));
