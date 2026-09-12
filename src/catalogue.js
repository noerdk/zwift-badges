// The achievement catalogue.
//
// Zwift serves the full list live from /api/game_info — 488 entries. We prefer
// it and fall back to GameDictionary.xml (which carries the same list) when the
// API is unavailable.
//
// The API gives `imageUrl` where GameDictionary gives `imageName`, but the URL's
// filename IS that token, so route badges stay identifiable as `RouteComplete`.
// Only GameDictionary carries the `sport` field, so we merge it in.
import { load as loadGameDict } from './gamedict.js';
import { zwift } from './auth.js';

const BASE = process.env.ZWIFT_API_BASE ?? 'https://us-or-rly101.zwift.com';

export function imageNameOf(a) {
  if (a.imageName) return a.imageName;
  const file = decodeURIComponent((a.imageUrl ?? '').split('/').pop() ?? '');
  return file.replace(/\.png$/i, '');
}

/** Fallback only. GameDictionary carries a real `sport` field (0 cycling,
 *  1 running); this name heuristic is used when that is unavailable. */
export function looksLikeRunBadge(name) {
  return / RUN$/.test(name) || /\(RUNNING\)/.test(name);
}

/** Is this badge for running? Prefers the real sport field over the name. */
export function isRunningBadge(a) {
  if (typeof a.sport === 'number' && a.sport >= 0) return a.sport === 1;
  return looksLikeRunBadge(a.name);
}

export async function fetchCatalogue() {
  try {
    const list = await zwift().achievementCatalogue();
    if (!list.length) throw new Error('game_info returned no achievements');
    // game_info has no `sport` field, so take it from GameDictionary, which does.
    const sportById = new Map(loadGameDict().achievements.map((a) => [a.id, a.sport]));
    return {
      source: 'api',
      achievements: list.map((a) => ({ id: a.id, name: a.name, imageName: imageNameOf(a), sport: sportById.get(a.id) ?? null })),
    };
  } catch {
    return { source: 'gamedict', achievements: loadGameDict().achievements };
  }
}

export function routeBadges(catalogue) {
  return catalogue.achievements.filter((a) => a.imageName === 'RouteComplete');
}

/**
 * Route badges Zwift knows about that our route catalogue cannot place.
 * In practice these are running-only badges and badges whose route is
 * event-only, so no free ride can earn them.
 */
export function uncoveredRouteBadges(catalogue, mappedIds) {
  return routeBadges(catalogue)
    .filter((a) => !mappedIds.has(a.id))
    .map((a) => ({ ...a, likelyRunning: isRunningBadge(a) }));
}
