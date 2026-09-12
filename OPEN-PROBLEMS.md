# Open problems

## 1. Epic challenge progress — RESOLVED (not in the REST API)

**Answer, from a live proxy capture of the running game (2026-09-11): epic
challenge progress is delivered over Zwift's realtime UDP protocol, not HTTP.
There is no REST endpoint to call.** A REST/HTTP client cannot read this
progress at all, so the app does not track these four challenges — a value the
user must hand-edit to keep current is worse than none. (An earlier version
reconstructed them by anchoring to lifetime totals; that was removed in v0.4.3.)

### How this was established

Proxied the real macOS client end to end: mitmproxy with its CA appended to the
game's own `cacert.pem` (the writable `data/` copy), `HTTPS_PROXY` set. The
launcher hands the game a `Game_Launcher` access token (the privileged client we
lacked), the game authenticates over libcurl — which honours the proxy — so the
**entire HTTPS surface was captured decrypted**, including opening the Climb Mt.
Everest challenge screen in-game.

Then every response body was byte-searched for both challenges' numbers —
Everest 7168 / 8848 and Ride California 503 / 1283 — in metres, centimetres and
millimetres, as protobuf varint, little-endian int32, and text. Results:

- **The targets 8848 and 1283 appear in no response, in any encoding.** The one
  stray `7168` is a coincidental int32 in a packed array in `profiles/me`, with
  no `8848` beside it. Small values like `503` match only as incidental single
  varints in unrelated payloads.
- **`/api/profiles/{id}/goals` returns 200 with 0 bytes** and is called once, at
  login — never again when the challenge screen opens.
- **Opening the Everest screen triggered no challenge-specific HTTP request** —
  only home/social calls; `challenges.wad` is a local UI asset.
- **No local save file holds the values** — the `cp/user{id}` folder is empty;
  nothing in prefs or the schedules.
- The game log shows `Connecting to UDP server with relay id …` followed by
  `GoalsManager: received fitness metrics` over `[NETWORK]` (`ZNet`/`RRPC`).
  The goal/challenge state arrives on the **realtime UDP channel**, which an
  HTTP proxy cannot see and a REST client cannot call.

### Consequence

For a REST/HTTP client this is a dead end by construction — confirmed, not
merely unfound. Capturing it would mean reverse-engineering Zwift's encrypted
realtime UDP protocol (the `zoffline` problem), which is out of scope for
`zwift-api`. A REST client simply cannot surface this progress.

### Bonus: full endpoint surface captured

The capture yielded the game's complete REST surface (~40 endpoints), several
not previously seen: `/api/head-unit-bff/{game-home,carousels/for-you,crm,banners}`,
`/api/power-curve/best/{all-time,last}`, `/api/scoring/current`,
`/api/private_event/feed`, `/api/clubs/club/list/my-clubs`,
`/api/player-playbacks/player/settings`, `/api/profiles/{id}/goals` (empty).


## 2. Climb Portal completion state — blocked by the same constraint

Which portal-climb badges you already hold appears to be readable only via
`route-completion-achievement-unlocks`, which is a write endpoint. Portal climbs
are therefore surfaced with distance, elevation and quest XP, but without
earned/not-earned state.

## 3. Per-route level requirements

Zwift publishes only that a route is `levelLocked`, never at which level —
not in GameDictionary, not anywhere found so far. Level-locked routes are
flagged with `*` rather than filtered.

## 4. Duration model

`estimateDuration` in `src/plan.js` uses average gradient, so mixed terrain with
real descents reads slower than reality. It also ignores draft — which is large
in Zwift and is why a RoboPacer or a race beats these estimates — and surface
(gravel and dirt are slower than the constant Crr assumes).
