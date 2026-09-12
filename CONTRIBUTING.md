# Contributing

Thanks for your interest! This is an unofficial, hobby project.

## Ground rules

- **Read-only.** The tool never writes to a Zwift account. Do not add write calls.
- **Bring your own credentials.** Development and testing use your own Zwift
  account via `ZWIFT_USER` / `ZWIFT_PASS` (see the README). Never commit
  credentials, tokens, or personal data — `.env*`, `token`, and `config.json`
  are gitignored for that reason.
- **The API layer lives in [`zwift-api`](https://github.com/noerdk/zwift-api).**
  Anything about talking to Zwift belongs there, not here; this repo is the
  planner (scoring, UI, CLI) on top of it.

## Develop

```bash
npm install
npm test            # offline tests (no network, no credentials)
npm run app         # run the desktop app from the checkout
node bin/zwift-plan.js --hours 2   # the CLI
```

Regenerate the bundled game data (route/achievement catalogue) with
`npm run refresh`.
