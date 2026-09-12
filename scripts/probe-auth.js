#!/usr/bin/env node
// Checkpoint 1: authenticate and print token expiry. Prints no token material.
import { authenticate } from '../src/auth.js';

const s = await authenticate({ verbose: true });
console.log('authenticated via :', s.via);
console.log('token type        :', s.tokenType);
console.log('scope             :', s.scope);
console.log('expires in        :', s.expiresIn, 'seconds');
console.log('expires at        :', s.expiresAt.toISOString());
console.log('access token len  :', s.accessToken.length, '(value not printed)');
console.log('refresh token     :', s.refreshToken ? `stored 0600 at ${s.tokenPath}` : 'none returned');
