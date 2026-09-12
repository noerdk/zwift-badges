// One place that assembles everything the UI needs, so the Electron main
// process and the CLI share exactly the same data path.
import { authenticate, signIn as authSignIn } from './auth.js';
import { loadEarnedIds } from './achievements.js';
import { fetchProfile, resolveAthlete } from './profile.js';
import { fetchUpcomingEvents, decorateEvents, eventsToday } from './events.js';
import { fetchQuests, isActive, summarise, routeXpIndex, eventSeriesXpIndex, portalRoadXpIndex, bestXp } from './quests.js';
import { refresh as refreshPortals, load as loadPortals, activeRoads, nextChange } from './portals.js';
import { refresh as refreshGameDict, load as loadGameDict } from './gamedict.js';
import { candidateRoutes, allRoutes, allMappedAchievementIds } from './routes.js';
import { routes as ZWIFT_DATA_ROUTES, segments as ZWIFT_DATA_SEGMENTS } from 'zwift-data';
import { achievements as ACH } from 'zwift-api';
import { rank, estimateDuration } from './plan.js';
import { loadConfig, loadConfigOverrides, readRefreshToken, writeRefreshToken } from './config.js';
import { fetchCatalogue, uncoveredRouteBadges } from './catalogue.js';

export function hasStoredSession() {
  return readRefreshToken() != null;
}

/** Sign in with a password. The password is used once and never stored. */
export async function signIn(username, password) {
  return authSignIn(username, password);
}

export async function loadAll({ hours = 2 } = {}) {
  // Zwift's own catalogue, refreshed at most daily. Never fatal: falls back to
  // the cached copy, then to the committed snapshot.
  const [gameDict] = await Promise.all([refreshGameDict(), refreshPortals()]);
  await authenticate();

  const [profile, earnedIds, rawEvents, catalogue] = await Promise.all([
    fetchProfile(),
    loadEarnedIds(),
    fetchUpcomingEvents().catch(() => []),
    fetchCatalogue(),
  ]);
  const quests = (await fetchQuests().catch(() => [])).filter((q) => isActive(q));
  const routeQuestXp = routeXpIndex(quests);
  const eventQuestXp = eventSeriesXpIndex(quests);
  const portalQuestXp = portalRoadXpIndex(quests);
  const byAchievementId = new Map(catalogue.achievements.map((a) => [a.id, a]));
  const achievementFamilies = ACH.achievementFamilies(
    catalogue.achievements.map((a) => ({ ...a, isRouteCompletion: a.imageName === 'RouteComplete' })),
    earnedIds,
  ).map((f) => ({
    ...f,
    rungs: f.rungs.map((r) => ({ ...r, info: ACH.describeAchievement(r.imageName, r.name) })),
    nextInfo: f.nextRung ? ACH.describeAchievement(f.nextRung.imageName, f.nextRung.name) : null,
  }));

  const config = loadConfig();
  const athlete = resolveAthlete(profile, config, { overrides: loadConfigOverrides() });

  const zdById = new Map(ZWIFT_DATA_ROUTES.map((r) => [r.id, r]));
  const segBySlug = new Map(ZWIFT_DATA_SEGMENTS.map((x) => [x.slug, x]));
  const classify = (r) => {
    const grade = r.totalKm > 0 ? r.elevationM / r.totalKm : 0;              // m per km
    const category = grade < 8 ? 'flat' : grade < 18 ? 'rolling' : grade < 35 ? 'hilly' : 'mountain';
    const zd = zdById.get(r.id);
    const segs = zd?.segments ?? [];
    // On-route segment geometry for a profile: position (km) + real elevation/incline.
    const onRoute = (zd?.segmentsOnRoute ?? []).map((sr) => {
      const seg = segBySlug.get(sr.segment) ?? {};
      return {
        from: sr.from, to: sr.to, kind: seg.type ?? (/sprint/i.test(sr.segment) ? 'sprint' : 'kom'),
        name: seg.name ?? sr.segment, elevM: seg.elevation ?? 0, incline: seg.avgIncline ?? 0,
      };
    }).sort((a, b) => a.from - b.from);
    return {
      grade,
      category,
      endurance: r.totalKm >= 40,
      hasSprint: segs.some((x) => /sprint/i.test(x)),
      hasKom: segs.some((x) => /kom/i.test(x)),
      sprintCount: segs.filter((x) => /sprint/i.test(x)).length,
      komCount: segs.filter((x) => /kom/i.test(x)).length,
      onRouteSegments: onRoute,
    };
  };
  const routes = candidateRoutes().map((r) => ({
    ...r,
    questXp: bestXp(routeQuestXp.get(r.id)),
    quests: routeQuestXp.get(r.id) ?? [],
    ...classify(r),
  }));
  const ranked = rank(routes, athlete, earnedIds, { hours, includeOverBudget: true });

  // Score events the same way as free rides so the two are comparable. An
  // event's duration comes from its own clock where it has one, otherwise from
  // the route estimate; racing is harder than a free ride, so effort is scaled.
  const zwiftRouteById = new Map(allRoutes().map((r) => [r.id, r]));
  const racing = { ...athlete, effortFactor: (athlete.effortFactor ?? 0.75) * 1.15 };
  const events = eventsToday(decorateEvents(rawEvents, earnedIds, { questXpBySeries: eventQuestXp })).map((e) => {
    const zr = zwiftRouteById.get(e.routeId);
    let hours = e.durationMin ? e.durationMin / 60 : null;
    if (hours == null && zr && e.km != null) {
      // Scale the route's elevation to however far the event actually goes.
      hours = estimateDuration(
        { totalKm: e.km, elevationM: (zr.elevationM ?? 0) * (e.km / (zr.totalKm || e.km)) },
        /RACE|TIME_TRIAL/.test(e.eventType) ? racing : athlete,
      );
    }
    const xp = (e.rideXp ?? 0) + e.badgeXp + e.questXp;
    return { ...e, hours, xp, rate: hours ? xp / hours : null };
  });


  // Badge ledger: every route badge, earned or not, plus non-route achievements.
  const routeBadges = routes.map((r) => ({
    achievementId: r.achievementId,
    name: r.name,
    world: r.world,
    earned: earnedIds.has(r.achievementId),
    xp: r.badgeXp,
    km: r.totalKm,
    elevationM: r.elevationM,
    levelLocked: r.levelLocked,
    category: r.category,
    sprintCount: r.sprintCount,
    komCount: r.komCount,
  }));
  const otherEarned = [...earnedIds]
    .filter((id) => !routeBadges.some((b) => b.achievementId === id))
    .map((id) => ({ id, name: byAchievementId.get(id)?.name ?? `#${id}` }));

  // Climb Portal roads: the daily rotation, plus any a quest targets (Climb of
  // the Week sits outside the rotation and is open all week).
  const portalData = loadPortals();
  const roadById = new Map(portalData.roads.map((r) => [r.id, r]));
  const scoreClimb = (road, extra) => {
    const totalKm = road.distanceKm;
    const hours = estimateDuration({ totalKm, elevationM: road.elevationM }, athlete);
    const rideXp = Math.round(20 * totalKm);
    const questXp = extra.questXp ?? 0;
    const xp = rideXp + questXp;
    return { ...road, ...extra, totalKm, hours, rideXp, questXp, xp, rate: xp / hours };
  };
  const climbs = [
    ...activeRoads(portalData).map((r) => scoreClimb(r, {
      kind: 'rotation',
      questXp: bestXp(portalQuestXp.get(r.id)),
      until: nextChange(portalData)?.start ?? null,
    })),
    ...[...portalQuestXp.entries()]
      .filter(([roadId]) => roadById.has(roadId))
      .map(([roadId, list]) => scoreClimb(roadById.get(roadId), {
        kind: 'quest',
        questXp: bestXp(list),
        quests: list,
        until: list[0]?.endDate ? new Date(list[0].endDate) : null,
      })),
  ]
    // A road can be both today's rotation and a quest target; keep the richer one.
    .filter((c, i, all) => all.findIndex((o) => o.id === c.id) === i || c.kind === 'quest')
    .sort((a, b) => b.rate - a.rate);

  // Route badges with no free-ridable cycling route (running twins, event-only
  // routes). Surfaced rather than silently dropped.
  const uncovered = uncoveredRouteBadges(catalogue, allMappedAchievementIds())
    .filter((a) => !a.likelyRunning);

  return {
    climbs,
    portalSource: portalData.source,
    gameDict: { ...gameDict, using: loadGameDict().source },
    catalogueSource: catalogue.source,
    uncovered,
    profile,
    athlete,
    earnedCount: earnedIds.size,
    routeBadges,
    otherEarned,
    achievementFamilies,
    routes: ranked,
    events,
    quests: summarise(quests),
    hours,
    generatedAt: new Date().toISOString(),
  };
}
