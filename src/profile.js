import { zwift } from './auth.js';

export async function fetchProfile() {
  return zwift().profile();
}

/**
 * Zwift is the source of truth for ftp/weight; config.json overrides only where
 * the user explicitly set a value, so a stale local number cannot silently win.
 */
export function resolveAthlete(profile, config, { overrides = {} } = {}) {
  const explicit = (k) => Object.prototype.hasOwnProperty.call(overrides, k);
  return {
    ...config,
    ftp: explicit('ftp') ? overrides.ftp : profile.ftp ?? config.ftp,
    weightKg: explicit('weightKg') ? overrides.weightKg : profile.weightKg ?? config.weightKg,
    level: profile.level,
    source: {
      ftp: explicit('ftp') ? 'config' : profile.ftp ? 'zwift' : 'default',
      weightKg: explicit('weightKg') ? 'config' : profile.weightKg ? 'zwift' : 'default',
    },
  };
}
