import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateRoutes, allRoutes, badgeXp, leadInKm, allMappedAchievementIds } from '../src/routes.js';
import { imageNameOf, looksLikeRunBadge } from '../src/catalogue.js';
import { score, rank, estimateDuration } from '../src/plan.js';

const ATHLETE = { weightKg: 73, ftp: 224, flatSpeedKph: 32, effortFactor: 0.75 };
const routes = candidateRoutes();
const byName = (n) => routes.find((r) => r.name === n);

test('every candidate route maps to a badge', () => {
  const unmapped = routes.filter((r) => r.achievementId == null);
  assert.equal(unmapped.length, 0, `unmapped: ${unmapped.map((r) => r.name).join(', ')}`);
});

test('candidate set is cycling-only and excludes event-only routes', () => {
  assert.ok(routes.length > 200);
  assert.ok(routes.every((r) => r.totalKm > 0));
});

test('achievement IDs are unique per route', () => {
  const ids = routes.map((r) => r.achievementId);
  assert.equal(new Set(ids).size, ids.length);
});

test('lead-in counts toward ride XP but not badge XP', () => {
  const r = byName('Tempus Fugit');
  assert.ok(r.leadInKm > 0, 'fixture should have a lead-in');
  const s = score(r, ATHLETE, new Set());
  assert.equal(s.rideXp, Math.round(20 * (r.routeKm + r.leadInKm)));
  assert.equal(s.badgeXp, r.badgeXp);
  assert.ok(s.badgeXp < s.rideXp, 'badge XP excludes lead-in so is the smaller of the two here');
});

test('earning the badge removes only the badge XP', () => {
  const r = byName('Tempus Fugit');
  const New = score(r, ATHLETE, new Set());
  const Done = score(r, ATHLETE, new Set([r.achievementId]));
  assert.equal(New.xp - Done.xp, r.badgeXp);
  assert.equal(New.badgeStatus, 'NEW');
  assert.equal(Done.badgeStatus, 'done');
  assert.equal(Done.hours, New.hours, 'duration must not depend on badge state');
});

test('a new badge roughly doubles the rate on a flat route', () => {
  const r = byName('Tempus Fugit');
  const ratio = score(r, ATHLETE, new Set()).rate / score(r, ATHLETE, new Set([r.achievementId])).rate;
  assert.ok(ratio > 1.8 && ratio < 2.2, `ratio was ${ratio}`);
});

test('badge XP uses Zwift experience, not a flat 20/km', () => {
  // Jon's Route pays far more than 20/km; Eastern Eight is also generous.
  const eastern = byName('Eastern Eight');
  assert.equal(eastern.badgeXp, 1345);
  assert.ok(eastern.badgeXp / eastern.routeKm > 20, 'should exceed the naive 20/km rule');
});

test('free-ride lead-in wins over GameDictionary\u2019s event lead-in', () => {
  // Eastern Eight: GameDictionary carries the 2.28km event lead-in; zwift-data
  // knows the free ride is only 0.025km. Free ride is what the planner assumes.
  const gd = { leadInKm: 2.28 };
  assert.equal(leadInKm(gd, { leadInDistanceFreeRide: 0.025, leadInDistance: 2.28 }), 0.025);
  assert.equal(leadInKm(gd, { leadInDistance: 2.28 }), 2.28, 'event lead-in when free-ride is unknown');
  assert.equal(leadInKm(gd, undefined), 2.28, 'GameDictionary alone for routes zwift-data lacks');
});

test('badge XP prefers Zwift\u2019s own value, else falls back to 20/km', () => {
  assert.equal(badgeXp({ distanceKm: 12.5 }, { experience: 500 }), 500, 'Jon\u2019s Route is not 20/km');
  assert.equal(badgeXp({ distanceKm: 13.65 }, undefined), 273, 'new route falls back to the rule');
  assert.equal(badgeXp({ distanceKm: 10 }, { experience: 0 }), 200, 'zero experience is not a value');
});

test('Climb Portal roads and event-only routes stay out of the candidate set', () => {
  const cands = candidateRoutes();
  assert.ok(cands.every((r) => !r.isPortal), 'portal roads have no route badge');
  assert.ok(cands.every((r) => !r.eventOnly));
  // Cote de Trebiac is a portal road — ridable, but not a badge candidate.
  assert.ok(!cands.some((r) => r.name === 'Cote de Trebiac'));
});

test('routes Zwift ships but zwift-data lacks are still plannable', () => {
  const hilltop = candidateRoutes().find((r) => r.name === 'Hilltop Hustle');
  assert.ok(hilltop, 'GameDictionary carries it even though zwift-data does not');
  assert.equal(hilltop.achievementId, 286);
  assert.equal(hilltop.xpSource, '20/km', 'no zwift-data experience value to use');
  assert.ok(hilltop.totalKm > 0 && hilltop.elevationM > 0);
});

test('XML entities in route names are decoded', () => {
  const names = allRoutes().map((r) => r.name);
  assert.ok(!names.some((n) => /&(amp|apos|quot|lt|gt);/.test(n)), 'no raw entities');
  assert.ok(names.some((n) => n.includes("d'")), 'apostrophes survive as apostrophes');
});

test('climbing is slower than flat, and lower w/kg is slower on climbs', () => {
  const flat = byName('Tempus Fugit');
  const climb = byName('Road to Sky');
  const kph = (r, a) => r.totalKm / estimateDuration(r, a);
  assert.ok(kph(climb, ATHLETE) < kph(flat, ATHLETE) / 2, 'Alpe should be less than half flat speed');

  const weaker = { ...ATHLETE, ftp: 180 };
  assert.ok(estimateDuration(climb, weaker) > estimateDuration(climb, ATHLETE));
});

test('rank respects the time budget and sorts by rate', () => {
  const out = rank(routes, ATHLETE, new Set(), { hours: 1 });
  assert.ok(out.every((r) => r.hours <= 1));
  for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].rate >= out[i].rate);
});


test('coverage checks use the full mapping, not just the candidate routes', () => {
  // Regression: comparing live route badges against candidateRoutes() alone
  // makes every event-only and running route's badge look uncovered.
  const all = allMappedAchievementIds();
  const candidates = new Set(candidateRoutes().map((r) => r.achievementId));
  assert.ok(all.size > candidates.size, 'full mapping must be a superset of the candidate set');
  for (const id of candidates) assert.ok(all.has(id));
});

test('imageName is recoverable from the API imageUrl', () => {
  assert.equal(imageNameOf({ imageUrl: 'https://cdn.zwift.com/static/zc/ACHIEVEMENTS/RouteComplete.png' }), 'RouteComplete');
  assert.equal(imageNameOf({ imageName: 'RouteComplete' }), 'RouteComplete');
  assert.equal(imageNameOf({}), '');
});

test('running badges are recognised so they stay out of cycling warnings', () => {
  assert.ok(looksLikeRunBadge('FLAT ROUTE RUN'));
  assert.ok(looksLikeRunBadge('HANDFUL OF GRAVEL (RUNNING)'));
  assert.ok(!looksLikeRunBadge('SPIRAL SUMMIT'));
  assert.ok(!looksLikeRunBadge('RUNWAY RUMBLE'), 'a route merely starting with RUN is not a run badge');
});
