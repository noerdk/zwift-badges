// Route catalogue.
//
// Zwift's GameDictionary.xml is the base: it is the game's own data, stays
// current, and covers routes the zwift-data package has not caught up with.
// zwift-data still contributes two things GameDictionary lacks:
//   * `experience` — the badge XP Zwift actually awards, which is ~20/km but
//     not always (Jon's Route pays 500 for 12.5 km)
//   * the FREE-RIDE lead-in, which differs from the event lead-in that
//     GameDictionary carries (Eastern Eight: 0.025 km free ride vs 2.28 km)
// Routes present only in GameDictionary fall back to the 20 XP/km rule and the
// event lead-in, and say so via `xpSource` / `leadInSource`.
import { routes as zwiftDataRoutes } from 'zwift-data';
import { readFileSync } from 'node:fs';
import { load } from './gamedict.js';

const mapping = JSON.parse(readFileSync(new URL('../data/route-achievements.json', import.meta.url), 'utf8'));
const XP_PER_KM = 20;

const zdById = new Map(zwiftDataRoutes.map((r) => [r.id, r]));

/** Free-ride lead-in where zwift-data knows it, else GameDictionary's event lead-in. */
export function leadInKm(gd, zd) {
  return zd?.leadInDistanceFreeRide ?? zd?.leadInDistance ?? gd.leadInKm ?? 0;
}

/** Badge XP Zwift awards: its own per-route value where known, else 20/km. */
export function badgeXp(gd, zd) {
  if (typeof zd?.experience === 'number' && zd.experience > 0) return zd.experience;
  return Math.round(XP_PER_KM * gd.distanceKm);
}

function decorate(gd) {
  const zd = zdById.get(gd.id);
  const lead = leadInKm(gd, zd);
  return {
    id: gd.id,
    slug: zd?.slug ?? null,
    name: gd.name,
    world: gd.world ?? zd?.world ?? 'unknown',
    routeKm: Math.round(gd.distanceKm * 1000) / 1000,
    leadInKm: Math.round(lead * 1000) / 1000,
    totalKm: Math.round((gd.distanceKm + lead) * 1000) / 1000,
    elevationM: Math.round(gd.elevationM + (zd?.leadInElevationFreeRide ?? gd.leadInElevationM ?? 0)),
    levelLocked: gd.levelLocked,
    eventOnly: gd.eventOnly,
    isPortal: gd.isPortal,
    achievementId: mapping.byRouteId[gd.id] ?? null,
    badgeXp: badgeXp(gd, zd),
    xpSource: typeof zd?.experience === 'number' && zd.experience > 0 ? 'zwift-data' : '20/km',
    leadInSource: zd?.leadInDistanceFreeRide != null ? 'free-ride' : 'event',
    zwiftInsiderUrl: zd?.zwiftInsiderUrl ?? null,
  };
}

/** Cycling routes that can be free-ridden: no event-only, no Climb Portal roads
 *  (those are ridable but carry no route badge and no home-screen entry). */
export function candidateRoutes() {
  return load().routes.filter((r) => r.cycling && !r.eventOnly && !r.isPortal).map(decorate);
}

/** Every route GameDictionary knows, decorated — including event-only and portal. */
export function allRoutes() {
  return load().routes.map(decorate);
}

export const unmappableBadges = mapping._unmappableBadges ?? [];

/** Every achievement ID we have a route for — including event-only and running
 *  routes, which are outside the candidate set but are still mapped. Coverage
 *  checks must use this, not the candidate list. */
export function allMappedAchievementIds() {
  return new Set(Object.values(mapping.byRouteId));
}

export { XP_PER_KM };
