// App-side auth: the library holds the protocol, this holds the policy of
// where the refresh token lives on disk and how credentials are supplied.
import { ZwiftClient, redact } from 'zwift-api';
import { readRefreshToken, writeRefreshToken, TOKEN_PATH } from './config.js';

export { redact };

const fileTokenStore = {
  get: () => readRefreshToken(),
  set: (t) => writeRefreshToken(t),
  clear: () => { try { require('node:fs').unlinkSync(TOKEN_PATH); } catch { /* gone */ } },
};

let client = null;

/** Shared client. Credentials come from the environment only, never persisted. */
export function zwift() {
  client ??= new ZwiftClient({
    tokenStore: fileTokenStore,
    credentials: process.env.ZWIFT_USER && process.env.ZWIFT_PASS
      ? { username: process.env.ZWIFT_USER, password: process.env.ZWIFT_PASS }
      : null,
  });
  return client;
}

export async function authenticate({ verbose = false } = {}) {
  try {
    const s = await zwift().connect();
    return { ...s, accessToken: zwift().session.accessToken, tokenPath: TOKEN_PATH };
  } catch (err) {
    if (verbose) console.error('  ' + err.message);
    throw new Error(
      err.name === 'ZwiftAuthError' && !process.env.ZWIFT_USER
        ? `${err.message}\nSet ZWIFT_USER and ZWIFT_PASS, e.g.\n  op run --env-file=.env.op -- zwift-plan --hours 2`
        : err.message,
      { cause: err },
    );
  }
}

export async function signIn(username, password) {
  await zwift().login({ username, password });
  return { ok: true };
}
