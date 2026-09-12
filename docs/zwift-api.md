# Zwift's undocumented API — what this project verified

Everything here was probed against a real account, or read out of the shipped
game. Unofficial and unsupported; expect drift.

The endpoint inventory came from `strings` on the macOS game binary
(`~/Library/Application Support/Zwift/ZwiftAppSilicon`), which contains 48
literal `/api/...` paths. That beats guessing — several of these use vocabulary
no amount of guessing would have produced ("quest", "user-game-storage",
"route-completion-achievements").

Base host: `https://us-or-rly101.zwift.com`. Auth is a Keycloak bearer token
(see `src/auth.js`).

## Works, and this project uses it

| Endpoint | Accept | Returns |
|---|---|---|
| `secure.zwift.com/auth/realms/zwift/protocol/openid-connect/token` | form | password + refresh grants. The **refresh grant issues a ~1000-day access token**; the password grant gives 6 hours. |
| `/api/achievement/loadPlayerAchievements` | `x-protobuf-lite` | earned achievement IDs. Repeated field 1, each holding varint field 1. |
| `/api/profiles/me` | **`application/json`** | profile. **Content-negotiates — without the JSON Accept header you get protobuf.** 93 keys incl. `ftp`, `weight` (grams), `achievementLevel` (level × 100). |
| `/api/game_info` | json | 488 achievements, 4 challenge definitions, world schedules. |
| `/api/public/events/upcoming` | json | ~200 upcoming events with `routeId` and `eventSeries`. |
| `/api/quest/quests/all-quests` | json | every quest definition. |
| `/api/quest/quests/my-quests` | json | **live per-goal quest progress**, milestones, rewards. |
| `cdn.zwift.com/gameassets/GameDictionary.xml` | — | **no auth.** 404 routes with geometry, 488 achievements with `sport`. |
| `cdn.zwift.com/gameassets/MapSchedule_v2.xml` | — | guest-world rotation. |
| `cdn.zwift.com/gameassets/PortalRoadSchedule_v1.xml` | — | **no auth.** 57 Climb Portal roads (centimetres) + a daily rotation calendar. |

## Works, not yet used

| Endpoint | Accept | Notes |
|---|---|---|
| `/api/achievement/route-completion-achievements` | `x-protobuf-lite` | **A newer, UUID-keyed route-badge system**, separate from the integer achievement IDs. 19 entries: `{uuid, routeId, sport, xp, name, slug}`. All are routes GameDictionary does not have (Chapmans Peak, Sa Calobra, Arches National Park, Col du Galibier) — Climb Portal roads and unreleased content. 7 carry an XP value, 130–580. Rejects `application/json` with 406. |
| `/api/personal-records/my-records` | `x-protobuf-lite` | 4 bytes (empty) on a fresh account. |
| `/api/fitness/metrics-and-goals` | `x-protobuf-lite` | **weekly training** load (fresh/fatigue, ISO week dates, weekly distance/time goals). Zwift's `GetMetricsAndGoals`. Not epic challenges — "goals" here means the weekly training target. |
| `/api/fitness/streaks` | `x-protobuf-lite` | ride-streak counters. |
| `/api/zfiles/list` | json | the player's stored files (logs, custom gearing, custom workouts). No challenge/state file. |

### Do not POST to the unlock endpoints

`/api/achievement/route-completion-achievement-unlocks` and
`/api/achievement/unlock` are **writes**. The binary names the message
`RouteCompletionAchievementUnlockRequest` — posting to it attempts to *award* an
achievement on the live account, which would both falsify your badge list and
corrupt the data this tool reads. This project does not call them, and so cannot
tell which Climb Portal badges you already hold.

## Confirmed unavailable

- **Per-player progress for the four classic challenges** (Everest, Ride
  California, Tour Italy, Factory Tour). These are a live feature distinct from
  quests — open-ended, no date window, absent from the quest API. Ruled out by: ~20 endpoint shapes;
  `GameDictionary.xml`'s `<CHALLENGE>` elements (name/image/id only, no target);
  and an exhaustive search of the profile's `privateAttributes` for a known
  Everest reading of 7168/8848 m and Ride California 503/1283 km in progress,
  target, offset, remainder and percentage form. All absent.
  The app does not track these — no reliable progress source exists.
- `/api/player-profile/user-game-storage/attributes` — **403 `RBAC: access
  denied`** with a normal bearer token (our client is `Zwift_Mobile_Link`; the
  privileged one holds a `game-storage` role we cannot obtain — the refresh
  token is client-bound and `game-storage` is an invalid scope). It is *not*
  where challenge progress lives regardless: per zoffline's `user_storage.proto`,
  the attributes it holds (ids 22/23/24/25/29) are `GameSettings`,
  `GarageItemLastSelected`, `BikeProgress`, `SpecialEventSeen` and
  `DataCollectionConsent` — settings, bike leveling and consent, no challenge
  counter.
- `/api/achievement/route-completion-achievement-unlocks` — 405 on GET, 400 on
  POST with an empty body. Needs a protobuf request schema not yet reversed.
- `/api/eventfeed`, `/api/power-curve`, `/api/scoring`, `/api/recommendations`,
  `/api/profiles/me/entitlements` — 404 as bare paths; they need sub-paths or
  parameters this project has not worked out.
- `/api/events/search`, `/api/route-results` — 405 on GET; POST-only.

## `privateAttributes`: keys are CRC32 of an uppercase name

The profile's `privateAttributes` is a 70-entry map keyed by the **CRC32 of a
`SCREAMING_SNAKE_CASE` attribute name**. Confirmed by matching CRC32 over
strings extracted from the game binary. Nine names recovered:

| Key | Name | Value |
|---|---|---|
| `2076353160` | `USERRIDECOUNT` | ride count |
| `-849739600` | `ONBOARDING_QUEST_SLUG` | `gettingstarted` |
| `-1001004453` | `SPORT_SELECT_TYPE` | `CYCLIST` |
| `1685919735` | `RIDE_INFO_ARRAY` | `#`-separated `(id, seconds, timestamp)` triples |
| `-2012319163` | `LAST_WORKOUT_HASH` | |
| `1169650385` | `PLAYER_CACHE_BLOB` | |
| `-702503934` | `XPTODROPSCONVERSIONDONE` | |
| `-1470235060` | `ENT_2ND_CHUNK_ACTIVED` | (Zwift's typo, not ours) |
| `1523223916` | `CURRENT_TRAINING_PLAN_ENROLLMENT_INDEX` | |

The other 61 names are not literal strings in the binary, so they are likely
constructed at runtime. Decoded by inspection rather than by name: seven
24-slot hour-of-day activity histograms, and eight account-milestone timestamps.

## Is there an old API and a new one?

No — there is one API surface (one host, one auth scheme, no `/v1` vs `/v2`, no
duplicate implementations of the same endpoint). What there *is* is several
subsystems at different stages of evolution, and they are not all the same kind
of thing:

| Area | Older mechanism | Newer mechanism | Relationship |
|---|---|---|---|
| Route badges | 321 integer-ID achievements (`imageName=RouteComplete`) | 19 UUID-keyed `route-completion-achievements` | **Disjoint, not a migration.** Zero name overlap; none of the 19 routeIds exists in GameDictionary. New content onboards onto the new mechanism; everything existing stays on the old one. |
| Player attribute storage | `privateAttributes` on the profile, keys = CRC32 of a `SCREAMING_SNAKE` name | `UserStorage`, keys = small integer `attributeId` | **Looks like a genuine successor.** The game fetches UserStorage at login; the cracked `privateAttributes` names are old-feeling (`XPTODROPSCONVERSIONDONE`). |
| Long-running goals | 4 challenges in `game_info` | quests (`/api/quest/quests/*`) | **Different features, both live.** Challenges are open-ended lifetime goals with no date window; quests are time-boxed campaigns with goals, tasks and milestones. None of the four challenges appears as a quest. |

The practical consequence for this project: the older mechanism is where nearly
all the data still is. The 321 integer badges are the badge system; the 19 UUID
entries are an edge. Reading only the "new" endpoints would miss almost
everything.

## Units traps

- **`GameDictionary.xml` stores Climb Portal roads in CENTIMETRES** in the
  attributes named `distanceInMeters` and `ascentInMeters`. Ordinary routes are
  genuinely in metres. Verified: all 53 portal entries equal
  `PortalRoadSchedule_v1.xml`'s `distanceCentimeters` / `elevCentimeters` exactly.
  Untreated, Cote de Trebiac reads as 459 km / 20,742 m instead of 4.59 km / 207 m.
- **Schedule timestamps use an hour-only UTC offset** (`2026-09-10T00:01-04`).
  ISO 8601 allows it; `new Date()` returns Invalid Date. Normalise to `-04:00`.
- `profile.weight` is in **grams**; `achievementLevel` is **level × 100**.

## Climb Portal

Portal roads are not routes: they rotate daily (one slot, `portal="0"`), are not
selectable from the home screen, and carry no ordinary route badge — so they are
excluded from route rankings and surfaced separately.

The **Climb of the Week** is *not* part of the rotation (Cote de Trebiac has zero
scheduled slots) — it is a separate slot open for the whole quest window. Quests
target a portal road through an `ACTION` task with
`actionName: "completed_climb_portal"` and `properties.portalRoadId`, which joins
to `PortalRoadMetadata@id` and to a `<ROUTE signature>` in GameDictionary.

## Game log

`~/Documents/Zwift/Logs/Log.txt` names the internal services —
`[QuestService]`, `[GoalsManager]`, `[UserStorage]`, `[ECONOMY]`, `[DLC]` — and
is the fastest way to see which subsystem owns a feature.
`Curl_Log.txt` is only the asset downloader (CDN traffic); the game's own API
calls are not logged there.
