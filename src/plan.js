// Scoring and selection.
import { XP_PER_KM } from './routes.js';

const G = 9.81;
const RHO = 1.226; // air density, kg/m^3 (Zwift models sea level)
const CRR = 0.004; // rolling resistance, tarmac
const BIKE_KG = 8;

/** Power needed to hold speed `v` m/s at `grade` (rise/run). */
function powerFor(v, { massKg, cda, grade }) {
  return v * (CRR * massKg * G + massKg * G * grade + 0.5 * RHO * cda * v * v);
}

/** Invert powerFor by bisection: the speed sustainable at `watts`. */
function speedFor(watts, params) {
  let lo = 0.1;
  let hi = 30; // 108 km/h, far above anything sustainable
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (powerFor(mid, params) < watts) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Derive the CdA that reproduces the athlete's own stated flat speed, so
 *  `flatSpeedKph` in config stays meaningful and the model is self-consistent
 *  with it rather than fighting it. */
function calibrateCda({ flatSpeedKph, watts, massKg }) {
  const v = flatSpeedKph / 3.6;
  const aero = watts / v - CRR * massKg * G;
  const cda = aero / (0.5 * RHO * v * v);
  return Math.min(Math.max(cda, 0.15), 0.6); // clamp to physically sane range
}

/**
 * This function is the whole point of the project.
 *
 * Steady-state power balance — rolling resistance + aero drag + gravity —
 * solved for speed at the athlete's sustainable power, using the route's
 * AVERAGE gradient. That last part is the big simplification: averaging the
 * gradient smears a route's climbs and descents together, so mixed terrain
 * (Watopia Figure 8, anything with a descent) comes out slower than reality,
 * while pure climbs are close.
 *
 * To improve: integrate over the real elevation profile instead of the mean,
 * cap descent speed, model draft (a big deal in Zwift), and vary Crr by
 * surface (gravel and dirt are markedly slower). The interface —
 * (route, athlete) -> hours — is stable; swap the body.
 */
export function estimateDuration(route, athlete) {
  const { flatSpeedKph, ftp, weightKg, effortFactor = 0.75 } = athlete;
  const massKg = weightKg + BIKE_KG;
  const watts = ftp * effortFactor;
  const cda = calibrateCda({ flatSpeedKph, watts, massKg });
  const grade = route.totalKm > 0 ? route.elevationM / (route.totalKm * 1000) : 0;
  const v = speedFor(watts, { massKg, cda, grade });
  return (route.totalKm * 1000) / v / 3600;
}

/**
 * XP for riding a route once, free ride.
 *   ride XP  = 20/km over distance actually ridden, lead-in included
 *   badge XP = Zwift's per-route award, once, lead-in excluded — only if unearned
 *   quest XP = milestone XP that finishing this route unlocks immediately
 *
 * Quest XP matters more than it looks: a route whose badge you already hold can
 * still be the best ride of the day if it is this week's Route of the Week.
 */
export function score(route, athlete, earnedIds, { estimate = estimateDuration } = {}) {
  const rideXp = XP_PER_KM * route.totalKm;
  const hasBadge = route.achievementId != null;
  const earned = hasBadge && earnedIds.has(route.achievementId);
  const badgeXp = hasBadge && !earned ? route.badgeXp : 0;
  const questXp = route.questXp ?? 0;
  const hours = estimate(route, athlete);
  const xp = rideXp + badgeXp + questXp;
  return {
    ...route,
    rideXp: Math.round(rideXp),
    badgeXp,
    questXp,
    xp: Math.round(xp),
    hours,
    rate: xp / hours,
    badgeStatus: !hasBadge ? 'none' : earned ? 'done' : 'NEW',
  };
}

/**
 * Rank routes that fit the time budget.
 *
 * Zwift only registers the route you picked from the home screen, so a session
 * is exactly one route — this returns a ranked list of single-route options,
 * never a combination. That is also why selection is a filter-and-sort today
 * rather than a knapsack.
 *
 * TODO(knapsack): if multi-route sessions ever become scorable (Zwift changing
 * route registration, or planning across several days), swap this for a 0/1
 * knapsack over the time budget — badges are one-time, so each route is a
 * distinct item with weight=hours and value=xp. Signature stays the same.
 */
export function rank(routes, athlete, earnedIds, { hours, includeOverBudget = false, estimate } = {}) {
  const scored = routes.map((r) => score(r, athlete, earnedIds, { estimate }));
  const fits = includeOverBudget ? scored : scored.filter((r) => r.hours <= hours);
  return fits.sort((a, b) => b.rate - a.rate || b.xp - a.xp);
}
