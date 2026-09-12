# zwift-plan

Given N hours today, which route should I ride to gain the most XP?

`zwift-plan` reads **your actual earned badges** from Zwift's API and ranks every
free-ridable cycling route by XP per hour, marking which ones would earn you a
first-time route badge. No manual tick-boxes, no spreadsheet.

```
$ op run --env-file=.env.op -- zwift-plan --hours 2

Route                   World      km     Est     XP   XP/h  Badge
Flat Out Fast           watopia  21.8    0:42    867   1230  NEW
Tempus Fugit            watopia  19.7    0:38    774   1228  NEW
Tick Tock               watopia  19.3    0:38    765   1216  NEW
```

## The menu-bar app

```bash
npm install
npm run dist        # builds a real .app + .dmg into dist/ (unsigned)
```

`npm run dist` produces `dist/Zwift Badge Planner-<ver>-arm64.dmg` and a
zipped `.app` — a self-contained bundle you can move to /Applications, no
checkout required. It is **unsigned** (no Apple Developer certificate), so on
first launch macOS Gatekeeper will block it: right-click the app → **Open** →
**Open**, once. `npm run pack` builds just the unpacked `.app` (faster, for
testing); `npm run app` runs it straight from the checkout without packaging.

It lives in the menu bar (no dock icon) with six tabs:

- **Today** — the single best route for your time budget, the next best free
  rides, and today's events that would earn a badge.
- **Routes** — every ridable cycling route inside the budget, ranked by XP/hour.
- **Badges** — earned and unearned route badges, with the XP still on the table.
- **Achievements** — non-route achievements (Ride Ons, watts, and the rest),
  with how to earn the ones you can plan for.
- **Events** — the next 24 hours of public cycling events, flagged where they
  would earn a badge and where the route is event-only (otherwise unridable).
- **Quests** — your live quests (auto-enrol, read from Zwift), the Climb Portal
  rotation, and the routes and events that pay quest XP right now.

Sign-in happens in the app. Your password is used once to obtain a token and is
never stored, logged, or written to disk — only the refresh token is kept.

The launcher is a small `.app` that runs Electron from this checkout, so there
is nothing to sign or notarise and no second copy of Electron. Delete the
bundle to uninstall.

`scripts/make-app.sh` and `ZWIFT_PLAN_CAPTURE=<dir> npm run app` (which renders
each tab headlessly to a PNG) are the two dev aids.

## Athlete numbers come from Zwift

FTP and weight are read from `/api/profiles/me`, so there is nothing to keep in
sync by hand. `config.json` overrides only the keys you actually set:

```json
{ "flatSpeedKph": 32, "effortFactor": 0.75 }
```

Add `"ftp"` or `"weightKg"` there only if you want to override what Zwift knows.

## Repository layout

```
src/                     this app's policy: caching, config, scoring
bin/zwift-plan.js        the CLI
app/                     the macOS menu-bar app (Electron)
docs/zwift-api.md        what the API does, verified
OPEN-PROBLEMS.md         what is still unsolved, and what has been ruled out
```

### The `zwift-api` library

Everything to do with talking to Zwift lives in **`zwift-api`**, a standalone,
zero-dependency, read-only client and data model published to npm
([repo](https://github.com/noerdk/zwift-api) · `npm i zwift-api`). This app
depends on the published release; nothing about talking to Zwift lives here any
more — `src/` is just this app's own policy (caching, config, scoring, UI) on
top of the library.

## Unofficial — and Zwift owns everything about Zwift

**This is an unofficial, unaffiliated, community project. It is not made,
endorsed, sponsored, or supported by Zwift, Inc.**

[Zwift](https://www.zwift.com) is an online indoor-cycling and running platform
by **Zwift, Inc.**, who **own all rights** to the game, service, backend APIs,
data, artwork, and the "Zwift" name, logo and trademarks. This project uses the
name only nominatively — to describe what it talks to — and claims no ownership
of or association with it. It relies on undocumented endpoints found by the
community and **may break without notice**.

It runs locally, is **read-only** (never writes to your Zwift account), and you
supply your own credentials — see [SECURITY.md](SECURITY.md) for how they are
handled. The bundled `data/` files are factual game data generated from Zwift's
public assets and remain Zwift's; see [NOTICE](NOTICE).

MIT licensed (original code); see [LICENSE](LICENSE), [NOTICE](NOTICE),
[CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Install

```bash
npm install
npm link          # puts `zwift-plan` on your PATH
```

## Credentials

Credentials are read from the environment and never written to disk:

```bash
cp .env.op.template .env.op   # point the op:// refs at your own vault item
op run --env-file=.env.op -- zwift-plan --hours 2
```

Only the **refresh token** is persisted, at `~/.config/zwift-plan/token`, mode
`0600`. Subsequent runs use it and fall back to the password grant when it
expires. Tokens are never logged.

## Config

`~/.config/zwift-plan/config.json` — no secrets here:

```json
{ "weightKg": 75, "ftp": 250, "flatSpeedKph": 32, "effortFactor": 0.75 }
```

`flatSpeedKph` calibrates the model: the CdA is solved so that your stated flat
speed falls out of the physics at `ftp * effortFactor` watts.

## How the XP model works

- Free riding earns **20 XP/km**, and **lead-in distance counts**.
- A first-time route badge awards a separate bonus, **excluding lead-in** —
  roughly doubling the XP for that ride. The exact per-route value comes from
  `zwift-data`'s `experience` field, which is Zwift's own number and is *not*
  always 20/km (Jon's Route pays 500 XP for 12.5 km).
- The planner **assumes free ride**. Workout mode switches to time-based
  scoring (~10.8 XP/min) and is not modelled.

## Things that surprise people

**One route per session.** Zwift only registers the route you picked from the
home screen, started as an event, or reached by teleporting to a rider or
RoboPacer. Riding a second route manually in the same session earns nothing —
so `zwift-plan` deliberately never proposes multi-route sessions.

**World availability barely matters.** You are not limited to today's guest
worlds: pick any public world by selecting a workout (a free-ride workout
counts) from the world-choice screen. So all non-event-only routes are
candidates and nothing is filtered by the daily schedule.

**Your badge count won't match.** Zwift has hidden achievements that never
appear on the badges screen, and the API returns all of them. If the API count
exceeds what the game shows you, that is expected, not a bug.

**Event-only routes are excluded.** They need a scheduled event to ride, which
is out of scope here.

## Where each piece of data comes from

| Data | Source | Notes |
|---|---|---|
| Earned achievement IDs | `loadPlayerAchievements` (protobuf) | live |
| Achievement names & types | `/api/game_info` | live; **488 entries, a strict superset of zwift-data's 477** |
| FTP, weight, level | `/api/profiles/me` | live; send `Accept: application/json` or you get protobuf |
| Today's events | `/api/public/events/upcoming` | live |
| Route distance, elevation, lead-in, level-lock, sport | **`cdn.zwift.com/gameassets/GameDictionary.xml`** | live, no auth, **404 routes** |
| Badge XP (`experience`) and the free-ride lead-in | `zwift-data` npm package | the only two things GameDictionary lacks |

### GameDictionary.xml is the base

`GameDictionary.xml` is Zwift's own catalogue, served unauthenticated from their
CDN. It carries **404 routes** — `distanceInMeters`, `ascentInMeters`,
`leadinDistanceInMeters`, `levelLocked`, `eventOnly`, a `sports` bitfield, and
`signature` as the route ID — plus all 488 achievements with a real `sport`
field. Numbers match `zwift-data` exactly where both have a route, and every
`zwift-data` route ID is present, so it is a clean superset.

Two consequences worth knowing:

- **`sports` is authoritative and disagrees with `zwift-data`** on ~85 routes
  that the package calls cycling+running and the game calls cycling-only. Bit 0
  is cycling, bit 1 running. The game's own data wins.
- **Climb Portal roads** (Cote de Trebiac and friends) appear as routes with an
  empty `map`. They are ridable — Climb of the Week lives there — but carry no
  route badge, so they are excluded from badge candidates rather than counted as
  coverage failures.

It is cached under the config dir with a 24-hour TTL, with a snapshot in
`data/gamedict.json` so the tool works offline and tests stay deterministic.
Refresh both that and the badge mapping with:

```bash
npm run refresh
```

`zwift-data` remains a dependency for exactly two things GameDictionary does not
carry: the badge XP value (`experience`) and the separate **free-ride** lead-in.
Routes present only in GameDictionary fall back to the 20 XP/km rule and the
event lead-in, and record that in `xpSource` / `leadInSource`.

## Quests are the big XP source

Zwift calls its challenges **quests** internally, and they are fully readable:

| Endpoint | What it gives |
|---|---|
| `/api/quest/quests/all-quests` | every quest definition |
| `/api/quest/quests/my-quests` | **your live progress**, per goal and per task |

A quest has goals; a goal has tasks; a task completes on a **ROUTE** (by
`routeId`), an **EVENT** (by `eventSeriesId`), a **DISTANCE** accumulator, or an
in-game **ACTION**. Milestones pay XP, Drops and entitlements at a threshold —
`goalsCount` goals, or `distance` metres — so the XP unlocked by finishing one
more goal is computed exactly, never apportioned.

Both route and event tasks join cleanly to the rest of the data (`routeId` to
the route catalogue, `eventSeriesId` to the events feed), so quest XP is folded
straight into the ranking. That changes the answer:

- **A route whose badge you already hold can be the best ride of the day.** This
  week's Route of the Week pays 500 XP, which lifted Sand And Sequoias — a
  `done` badge — from nowhere to 13th.
- **An event can beat every free ride.** ZRacing pays 1000 XP for the first
  event, so a 30-minute race scored 2885 XP/h against 1294 for the best free
  ride. Events and free rides are scored the same way so the two are directly
  comparable; race efforts assume a higher fraction of FTP.

## Climb Portal

Portal climbs rotate daily and are not routes — no route badge, no home-screen
entry — so they are surfaced separately rather than ranked among routes:

```
Climb Portal:
  Alto de Patios     5.93 km   377 m  0:32   119 XP    221 XP/h  today only
  Cote de Trebiac    4.59 km   207 m  0:19   342 XP   1075 XP/h  quest climb, open all week
  rotation changes 2026-09-11 04:01
```

The **Climb of the Week is not in the rotation** — it is a separate slot open
for the whole quest window, which is why it can beat the day's climb by 5x on
XP per hour. Quests point at a portal road via an `ACTION` task carrying
`portalRoadId`.

Both `GameDictionary.xml` and `PortalRoadSchedule_v1.xml` are unauthenticated CDN
files, cached with a 24-hour TTL and snapshotted into `data/`.

## The route → badge mapping

`data/route-achievements.json` maps every route to its achievement ID. Zwift
does not publish this, and at least three other projects have worked around its
absence by hand — so it is a deliverable in its own right, not an implementation
detail.

It is generated by `scripts/build-route-badge-map.js`, which joins
GameDictionary's routes to the achievements whose `imageName` is
`RouteComplete`, by normalised name, plus a hand-verified override table for the
routes Zwift renamed after the badge shipped (`Watopia Hilly Route` ↔ `HILLY ROUTE`, `London PRL FULL` ↔
`THE PRL FULL`, and so on). Nothing is fuzzy-matched — anything that does not
join exactly or via an override is reported as unmapped.

```
$ REPORT=1 node scripts/build-route-badge-map.js
routes                : 404
RouteComplete badges  : 307 (cycling 257, running 50)
mapped                : 305 (13 via override)
ambiguous             : 0
IN-SCOPE COVERAGE: 240/240
```

Because achievements carry a real `sport`, routes with a badge per sport
(`HANDFUL OF GRAVEL (CYCLING)` / `(RUNNING)`) resolve without a name hack. Two
badges stay unmapped — the running twins of routes whose cycling badge is
already taken — and are recorded under `_unmappableBadges`.

It builds from GameDictionary alone, so it needs no credentials.

## What the API actually returns (verified 2026-09-10)

Both endpoints in the brief were correct as written. Confirmed against a real
account:

| | |
|---|---|
| Token endpoint | `secure.zwift.com/auth/realms/zwift/.../token`, `client_id=Zwift_Mobile_Link` — works |
| Achievements | `us-or-rly101.zwift.com/api/achievement/loadPlayerAchievements` — works, `content-type: application/x-protobuf-lite` |
| Message shape | top-level `field 1` (length-delimited) repeated once per achievement, each holding a single varint `field 1` = the ID. Matches `proto/achievements.proto`. |

Two things worth knowing:

- **The refresh grant issues a ~1000-day access token.** The password grant
  returns `expires_in: 21600` (6 hours), but the refresh grant returns
  `86399971` — and the JWT's own `exp` claim confirms that is real seconds, not
  milliseconds. So the cached refresh token is effectively long-lived
  credentials sitting on disk. That is why it is `0600` in a `0700` directory,
  and why the file is re-`chmod`ed on every write even if it already existed.
- **Earned achievements include far more than route badges.** A sample account
  returned 39 IDs: 22 route badges (`imageName: RouteComplete`) and 17 general
  achievements (`JELLY`, `MASTER DRAFTSMAN`, `SPEED DEMON`, `Portal Climber`…).
  Only the route badges affect planning. Expect this total to disagree with the
  in-game badge screen — hidden achievements are returned by the API.

## Verifying the API yourself

```bash
op run --env-file=.env.op -- node scripts/probe-auth.js           # token expiry
op run --env-file=.env.op -- node scripts/probe-achievements.js --dump
```

`--dump` writes the raw protobuf to `tmp/achievements.bin` and prints a
schema-free wire scan, so you can see Zwift's actual message shape rather than
trusting ours. `src/achievements.js` cross-checks the `.proto` decode against
that raw scan and fails loudly on disagreement instead of silently returning an
empty set.

## Known limitations

- **Level-locked routes are marked, not filtered.** Zwift publishes only that a
  route is locked (`levelLocked`), never at which level — in GameDictionary or
  anywhere else — so the planner flags them with `*` and leaves the check to
  you. Your own level is known (`achievementLevel / 100`), so precise filtering
  becomes possible the day a per-route requirement appears.
- **Average gradient, not the real profile.** Mixed terrain with genuine
  descents reads slower than reality; pure climbs are close.
- **Draft and surface are not modelled.** Both matter in Zwift; gravel and dirt
  are meaningfully slower than the model assumes.
- **Bike and unlock requirements are ignored** (e.g. routes wanting a gravel or
  MTB frame).
- **Climb Portal completion state is unknown.** Portal climbs are surfaced with
  their distance, elevation and quest XP, but Zwift only exposes *which* portal
  badges you hold through a write endpoint that awards achievements, so this
  read-only tool cannot tell you which you have already done.
- **The four classic challenges (Everest, Ride California, Tour Italy, Factory
  Tour) are not tracked.** Zwift exposes no progress for them anywhere (see
  `docs/zwift-api.md`), and a value the user has to hand-edit to stay current is
  worse than none — so the app leaves them out.
- **`.env.op` has not been exercised end to end** — the 1Password CLI was not
  installed on the machine this was built on. The plain-env path is tested.

## Testing

```bash
npm test
```

12 tests, none of which touch the network: the mapping invariants (every
candidate route maps to a badge, IDs unique), the XP model (lead-in counted for
ride XP but not badge XP, badge state changing XP but never duration, a new
badge roughly doubling the rate), the duration model's ordering properties, and
the protobuf decoder against a hand-encoded message.

## Bonus: your profile

`GET /api/profiles/me` returns JSON **only if you send
`Accept: application/json`** — without it you get protobuf. It carries `ftp`,
`weight` (in grams), `achievementLevel` (level x 100) and
`totalExperiencePoints`, so config could be auto-populated from Zwift rather
than typed in. Not wired up: config stays authoritative.

## Licensing

MIT. `proto/achievements.proto` was written from scratch against the observed
wire format — no `.proto` files were copied from `zwift-offline`, and no code
was taken from Sauce4Zwift (GPL-3.0). `zwift-data` is an npm dependency.

"Zwift" is a trademark of Zwift, Inc., used here only to describe what this tool
talks to.
