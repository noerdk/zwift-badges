# Security policy

## Reporting

Report security issues privately via GitHub's **"Report a vulnerability"**
(Security → Advisories), not a public issue.

## How this app handles your credentials

- It is **read-only**: it never writes to your Zwift account.
- Your Zwift **password is never stored or logged** — it is used once to obtain a
  token (injected from the environment, e.g. via the 1Password CLI) and discarded.
- Only a **refresh token** is persisted, at `~/.config/zwift-plan/token`, mode
  `0600`. Treat it as a long-lived credential (the refresh grant returns an access
  token valid for ~1000 days). Delete that file to sign out.
- No secret is ever committed: `.env*`, `token`, and `config.json` are gitignored.
- In the desktop app, the password is sent once over IPC for the token grant,
  cleared from the DOM immediately, and never returned to the renderer.

The app talks only to Zwift's own hosts, and only when you use it. It sends no
telemetry.
