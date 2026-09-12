// Earned achievement IDs. Decoding lives in zwift-api; this keeps the
// app-facing shape and the raw-dump helper the probe script uses.
import { zwift } from './auth.js';
import { wire } from 'zwift-api';

export const describe = wire.describe;

export async function loadEarnedIds() {
  return zwift().earnedAchievementIds();
}

/** Raw bytes, for scripts/probe-achievements.js --dump. */
export async function fetchRaw(accessToken) {
  const res = await fetch('https://us-or-rly101.zwift.com/api/achievement/loadPlayerAchievements', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/x-protobuf-lite' },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok) throw new Error(`loadPlayerAchievements failed (HTTP ${res.status})`);
  return { buf, contentType: res.headers.get('content-type') };
}
