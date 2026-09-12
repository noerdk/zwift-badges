# Capturing the game's API traffic (macOS)

The purpose is to see what request `EpicChallengeService` makes when the
challenge screen renders your Everest progress — the one number this project
still can't read (see `OPEN-PROBLEMS.md`). This reads **your own** client's
traffic for **your own** data on **your own** machine.

## Why it's straightforward here

Verified against the installed client (Zwift 1.0.165303):

| | |
|---|---|
| TLS stack | libcurl 8.12.1 / OpenSSL 3.5.5 |
| Trust anchor | a **bundled** `cacert.pem` (stock 154-cert Mozilla bundle), read via `CURLOPT_CAINFO` — **not** the macOS keychain |
| Certificate pinning | **none** — the only `sha256//` strings are libcurl's own `--pinnedpubkey` help text, never a populated pin |
| Proxy support | libcurl honours `HTTPS_PROXY` / `http_proxy` / `ALL_PROXY` |

So there is no pin to defeat and no system trust store to touch: add your
proxy's CA to Zwift's own bundle and point the game's libcurl at the proxy.

## Steps

1. **Proxy**
   ```bash
   brew install mitmproxy
   mitmweb --listen-port 8080     # web UI on http://127.0.0.1:8081
   ```
   This writes its CA to `~/.mitmproxy/mitmproxy-ca-cert.pem` on first run.

2. **Trust the proxy in Zwift's bundle** (both copies — the launcher can restore
   from the app bundle):
   ```bash
   for f in "/Applications/Zwift.app/Contents/Resources/cacert.pem" \
            "$HOME/Library/Application Support/Zwift/data/cacert.pem"; do
     cp "$f" "$f.bak"
     cat ~/.mitmproxy/mitmproxy-ca-cert.pem >> "$f"
   done
   ```

3. **Launch the game through the proxy**
   ```bash
   HTTPS_PROXY=http://127.0.0.1:8080 http_proxy=http://127.0.0.1:8080 \
     open -W /Applications/Zwift.app
   ```
   If `open` doesn't propagate the env to the child, launch the binary directly:
   `HTTPS_PROXY=http://127.0.0.1:8080 "/Applications/Zwift.app/Contents/MacOS/Zwift"`.

4. **Capture.** Log in, open **Menu → Challenges → Climb Mt. Everest**. In the
   mitmweb flow list, filter to `us-or-rly101.zwift.com`. Look for the request
   whose response carries a value matching your on-screen progress. Note its
   **path, method, `Authorization`/client headers, and body.**

5. **Restore** so the game keeps validating normally:
   ```bash
   for f in "/Applications/Zwift.app/Contents/Resources/cacert.pem" \
            "$HOME/Library/Application Support/Zwift/data/cacert.pem"; do
     mv "$f.bak" "$f"
   done
   ```

## What to look for, and what it settles

- **A distinct endpoint** (e.g. an `epic`/`challenge`/`goal` path we never
  guessed) → implement it read-only in `zwift-client`. Done.
- **`user-game-storage` returning 200 for the game** → compare its client
  identity against ours. But note the proto shows that store holds settings, not
  challenge data, so this is unlikely.
- **No challenge request at all** → the game computes it client-side from
  lifetime climbing minus an enrollment baseline, and the baseline is stored
  in whatever request *does* carry it. Capture the enrollment/registration call.

## Realtime caveat

Only the REST API (challenge/profile/achievements) goes over HTTPS via libcurl
and is captured this way. The live game world uses a separate encrypted
UDP/TCP protocol on other ports — not relevant here, and not proxyable like this.

## If the launcher overwrites the bundle

The updater manages `~/Library/Application Support/Zwift/data/`. If it restores
`cacert.pem` on launch, re-append after the launcher finishes but before the
game process starts, or make it immutable for the session:
`chflags uchg "<path>"` (and `chflags nouchg` to undo).
