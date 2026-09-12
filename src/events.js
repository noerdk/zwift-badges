// Today's scheduled events, joined to the route catalogue and scored.
//
// Events matter for badge hunting because event-only routes are otherwise
// unridable, and because starting an event is one of the few ways Zwift
// registers a route for you.
import { allRoutes, XP_PER_KM } from './routes.js';

import { zwift } from './auth.js';
// Decorated routes, keyed by the same routeId events reference.
let routeIndex = null;
const routeById = () => (routeIndex ??= new Map(allRoutes().map((r) => [r.id, r])));

export async function fetchUpcomingEvents() {
  return zwift().upcomingEvents();
}

/**
 * Join events to routes and score them.
 *
 * An event's distance is not always the route distance — `laps` and an explicit
 * `distanceInMeters` both override it, and duration-based events (durationInSeconds)
 * have no fixed distance at all. We surface which case applies rather than
 * pretending every event is one lap of its route.
 */
export function decorateEvents(events, earnedIds, { sport = 'CYCLING', questXpBySeries = new Map() } = {}) {
  return events
    .filter((e) => e.sport === sport && !e.privateEvent)
    .map((e) => {
      const route = routeById().get(e.routeId) ?? null;
      const lead = route ? route.leadInKm : 0;
      const laps = e.laps > 0 ? e.laps : null;
      const explicitKm = e.distanceInMeters > 0 ? e.distanceInMeters / 1000 : null;
      const durationMin = e.durationInSeconds > 0 ? e.durationInSeconds / 60 : null;

      let km = null;
      let basis = 'unknown';
      if (explicitKm) { km = explicitKm; basis = 'event distance'; }
      else if (route && laps) { km = route.routeKm * laps + lead; basis = `${laps} laps`; }
      else if (route && !durationMin) { km = route.routeKm + lead; basis = '1 lap'; }
      else if (durationMin) { basis = `${Math.round(durationMin)} min`; }

      const achievementId = route?.achievementId ?? null;
      const badgeNew = achievementId != null && !earnedIds.has(achievementId);
      const questEntries = e.eventSeries ? questXpBySeries.get(e.eventSeries.id) ?? [] : [];
      const questXp = questEntries.length ? Math.max(...questEntries.map((q) => q.xpNow)) : 0;

      return {
        id: e.id,
        name: e.name,
        start: new Date(e.eventStart),
        eventType: e.eventType,
        routeId: e.routeId,
        routeName: route?.name ?? null,
        world: route?.world ?? null,
        eventOnlyRoute: route?.eventOnly ?? null,
        km,
        basis,
        durationMin,
        achievementId,
        badgeNew,
        badgeXp: route && badgeNew ? route.badgeXp : 0,
        // Duration-based events have no distance, so no ride-XP estimate.
        rideXp: km != null ? Math.round(XP_PER_KM * km) : null,
        seriesName: e.eventSeries?.name ?? null,
        questXp,
        quests: questEntries,
        totalEntrants: e.totalEntrantCount ?? 0,
      };
    });
}

export function eventsToday(decorated, { now = new Date(), hoursAhead = 24 } = {}) {
  const end = now.getTime() + hoursAhead * 3600e3;
  return decorated
    .filter((e) => e.start.getTime() >= now.getTime() && e.start.getTime() <= end)
    .sort((a, b) => a.start - b.start);
}
