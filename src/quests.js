// Quests: fetching and the progress maths live in zwift-api. This keeps the
// app-facing names and the merge of all-quests with my-quests.
import { quests as Q } from 'zwift-api';
import { zwift } from './auth.js';

export const {
  isActive, goalXp,
  routeXpIndex, eventSeriesXpIndex, portalRoadXpIndex, bestXp,
} = Q;

/** The library reports distances as `currentKm`/`ratio`; the UI has always
 *  spoken `current`/`target`/`pct` with an explicit unit. Adapt rather than
 *  rename either side. */
export function accumulatorProgress(quest) {
  const a = Q.accumulatorProgress(quest);
  if (!a) return null;
  return { ...a, metric: 'distance', unit: 'km', current: a.currentKm, target: a.targetKm, pct: a.ratio };
}

export function summarise(quests) {
  return Q.summarise(quests).map((q) => ({ ...q, accumulator: accumulatorProgress(quests.find((x) => x.id === q.id)) }));
}

/**
 * all-quests is already personalised — it carries per-task progress — so it is
 * sufficient on its own. my-quests is merged over it anyway: it is the
 * registered subset, and being explicit about that costs one request.
 */
export async function fetchQuests() {
  const client = zwift();
  const [all, mine] = await Promise.all([
    client.quests().catch(() => []),
    client.quests({ onlyMine: true }).catch(() => []),
  ]);
  const byId = new Map(all.map((q) => [q.id, q]));
  for (const q of mine) byId.set(q.id, q);
  return [...byId.values()];
}
