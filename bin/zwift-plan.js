#!/usr/bin/env node
import { authenticate } from '../src/auth.js';
import { loadEarnedIds } from '../src/achievements.js';
import { candidateRoutes, allMappedAchievementIds } from '../src/routes.js';
import { fetchCatalogue, uncoveredRouteBadges } from '../src/catalogue.js';
import { fetchQuests, isActive, routeXpIndex, bestXp } from '../src/quests.js';
import { refresh as refreshGameDict, load as loadGameDict } from '../src/gamedict.js';
import { refresh as refreshPortals, load as loadPortals, activeRoads, nextChange } from '../src/portals.js';
import { portalRoadXpIndex } from '../src/quests.js';
import { rank, estimateDuration } from '../src/plan.js';
import { loadConfig, loadConfigOverrides, CONFIG_PATH } from '../src/config.js';
import { fetchProfile, resolveAthlete } from '../src/profile.js';

function parseArgs(argv) {
  const args = { hours: 2, limit: 15, all: false, world: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--hours') args.hours = Number(argv[++i]);
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--world') args.world = argv[++i];
    else if (a === '--all') args.all = true;          // include earned badges
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!Number.isFinite(args.hours) || args.hours <= 0) throw new Error('--hours must be a positive number');
  return args;
}

const USAGE = `zwift-plan — rank Zwift routes by XP per hour using your real badges

  zwift-plan --hours 2 [--world watopia] [--limit 15] [--all]

  --hours N    time budget (default 2)
  --world W    restrict to one world (e.g. watopia, london, makuri-islands)
  --limit N    rows to print (default 15)
  --all        include routes whose badge you already hold
  
Credentials come from ZWIFT_USER / ZWIFT_PASS, e.g.
  op run --env-file=.env.op -- zwift-plan --hours 2`;

const fmtTime = (h) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

function table(rows) {
  const cols = [
    ['Route', (r) => r.name + (r.levelLocked ? ' *' : ''), 'l'],
    ['World', (r) => r.world, 'l'],
    ['km', (r) => r.totalKm.toFixed(1), 'r'],
    ['Est', (r) => fmtTime(r.hours), 'r'],
    ['XP', (r) => String(r.xp), 'r'],
    ['Quest', (r) => (r.questXp ? '+' + r.questXp : ''), 'r'],
    ['XP/h', (r) => String(Math.round(r.rate)), 'r'],
    ['Badge', (r) => r.badgeStatus, 'l'],
  ];
  const widths = cols.map(([h, get]) => Math.max(h.length, ...rows.map((r) => get(r).length)));
  const line = (cells) => cells.map((c, i) => (cols[i][2] === 'r' ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join('  ').trimEnd();
  return [line(cols.map((c) => c[0])), ...rows.map((r) => line(cols.map(([, get]) => get(r))))].join('\n');
}

let args;
try { args = parseArgs(process.argv.slice(2)); }
catch (err) { console.error(err.message + '\n\n' + USAGE); process.exit(2); }
if (args.help) { console.log(USAGE); process.exit(0); }

await Promise.all([refreshGameDict(), refreshPortals()]);
await authenticate();
const [profile, earned, catalogue, allQuests] = await Promise.all([
  fetchProfile(),
  loadEarnedIds(),
  fetchCatalogue(),
  fetchQuests().catch(() => []),
]);
const quests = allQuests.filter((q) => isActive(q));
const questXpByRoute = routeXpIndex(quests);
// Zwift's own FTP and weight win; config.json overrides only what you set there.
const athlete = resolveAthlete(profile, loadConfig(), { overrides: loadConfigOverrides() });

let routes = candidateRoutes().map((r) => ({ ...r, questXp: bestXp(questXpByRoute.get(r.id)) }));
if (args.world) {
  routes = routes.filter((r) => r.world === args.world);
  if (!routes.length) { console.error(`no cycling routes in world "${args.world}"`); process.exit(1); }
}

let ranked = rank(routes, athlete, earned, { hours: args.hours });
// A route whose badge you hold can still win on quest XP, so keep those.
if (!args.all) ranked = ranked.filter((r) => r.badgeStatus === 'NEW' || r.questXp > 0);

const unearned = routes.filter((r) => r.achievementId && !earned.has(r.achievementId)).length;
console.log(
  `${earned.size} achievements earned · ${routes.length} cycling routes · ` +
    `${unearned} badges outstanding · budget ${fmtTime(args.hours)}`,
);
console.log(
  `${profile.firstName} ${profile.lastName}, level ${profile.level} · assuming free ride at ` +
    `${athlete.ftp}W / ${athlete.weightKg}kg (${(athlete.ftp / athlete.weightKg).toFixed(2)} w/kg, ` +
    `ftp from ${athlete.source.ftp}, weight from ${athlete.source.weightKg}) · tune in ${CONFIG_PATH}\n`,
);

if (!ranked.length) {
  console.log(args.all ? 'No routes fit that time budget.' : 'No unearned badges fit that time budget. Try --all or a longer --hours.');
  process.exit(0);
}
const shown = ranked.slice(0, args.limit);
console.log(table(shown));
if (shown.some((r) => r.levelLocked)) {
  console.log(`\n* level-locked: Zwift publishes only that a route is locked, not at which level, so check in game.`);
}
// Climb Portal: today's rotation plus anything a quest targets.
const portalData = loadPortals();
const portalXp = portalRoadXpIndex(quests);
const roadById = new Map(portalData.roads.map((r) => [r.id, r]));
const climbs = [
  ...activeRoads(portalData).map((r) => ({ ...r, kind: 'today', questXp: bestXp(portalXp.get(r.id)) })),
  ...[...portalXp.keys()].filter((id) => roadById.has(id)).map((id) => ({ ...roadById.get(id), kind: 'quest', questXp: bestXp(portalXp.get(id)) })),
].filter((c, i, all) => all.findIndex((o) => o.id === c.id) === i || c.kind === 'quest');
if (climbs.length) {
  console.log('\nClimb Portal:');
  for (const c of climbs) {
    const hours = estimateDuration({ totalKm: c.distanceKm, elevationM: c.elevationM }, athlete);
    const xp = Math.round(20 * c.distanceKm) + c.questXp;
    console.log(`  ${c.name.padEnd(24)}${c.distanceKm.toFixed(2).padStart(6)} km  ${String(Math.round(c.elevationM)).padStart(5)} m  ${fmtTime(hours).padStart(5)}  ${String(xp).padStart(5)} XP  ${String(Math.round(xp / hours)).padStart(5)} XP/h  ${c.kind === 'quest' ? 'quest climb, open all week' : 'today only'}`);
  }
  const next = nextChange(portalData);
  if (next) console.log(`  rotation changes ${next.start.toISOString().slice(0, 16).replace('T', ' ')}`);
}

const uncovered = uncoveredRouteBadges(catalogue, allMappedAchievementIds()).filter((a) => !a.likelyRunning);
if (uncovered.length) {
  console.log(`\n${uncovered.length} route badges have no free-ridable cycling route, so they are not ranked:`);
  console.log(`  ${uncovered.map((a) => a.name).join(', ')}`);
  console.log(`  (achievements from ${catalogue.source}; routes from GameDictionary via ${loadGameDict().source}.)`);
}
console.log(`\nOne route per session: Zwift only credits the route you pick from the home screen.`);
