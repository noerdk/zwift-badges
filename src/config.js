// Config + token-store locations. No secrets in config.json; the token file
// holds only the refresh token and is written 0600.
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CONFIG_DIR = process.env.ZWIFT_PLAN_HOME ?? join(homedir(), '.config', 'zwift-plan');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
export const TOKEN_PATH = join(CONFIG_DIR, 'token');

export const DEFAULT_CONFIG = {
  weightKg: 75,
  ftp: 250,
  // Assumed steady free-ride speed on flat ground, km/h. The elevation model
  // scales this. See estimateDuration in plan.js.
  flatSpeedKph: 32,
};

/** Only the keys the user actually wrote, so we can tell an explicit override
 *  from a default when merging with Zwift's own profile values. */
export function loadConfigOverrides() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`config at ${CONFIG_PATH} is not valid JSON: ${err.message}`);
    return {};
  }
}

export function saveConfig(patch) {
  ensureConfigDir();
  const next = { ...loadConfigOverrides(), ...patch };
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  return next;
}

export function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))  };
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`config at ${CONFIG_PATH} is not valid JSON: ${err.message}`);
    return { ...DEFAULT_CONFIG };
  }
}

export function ensureConfigDir() {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

export function readRefreshToken() {
  try {
    return readFileSync(TOKEN_PATH, 'utf8').trim() || null;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export function writeRefreshToken(token) {
  ensureConfigDir();
  writeFileSync(TOKEN_PATH, token + '\n', { mode: 0o600 });
  chmodSync(TOKEN_PATH, 0o600); // enforce even if the file already existed
}
