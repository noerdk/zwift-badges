#!/usr/bin/env node
// Checkpoint 2: fetch and decode earned achievements.
//   --dump  also writes the raw protobuf bytes to ./tmp/achievements.bin
//           and prints a schema-free structural scan of the response.
import { mkdirSync, writeFileSync } from 'node:fs';
import { authenticate } from '../src/auth.js';
import { fetchRaw, loadEarnedIds, describe } from '../src/achievements.js';

const dump = process.argv.includes('--dump');

const session = await authenticate({ verbose: true });
console.log('authenticated via:', session.via, '| token expires', session.expiresAt.toISOString());

const { buf, contentType } = await fetchRaw(session.accessToken);
console.log('content-type     :', contentType);
console.log('response bytes   :', buf.length);

if (dump) {
  mkdirSync('tmp', { recursive: true });
  writeFileSync('tmp/achievements.bin', buf);
  console.log('raw bytes written: tmp/achievements.bin');
  console.log('\n--- schema-free wire scan (top 3 levels) ---');
  console.log(describe(buf));
  console.log('--- end scan ---\n');
}

let ids;
try {
  ids = await loadEarnedIds();
} catch (err) {
  console.error('\nDECODE PROBLEM:', err.message);
  console.error('Structural scan of what actually came back:\n');
  console.error(describe(buf));
  process.exit(1);
}

const sorted = [...ids].sort((a, b) => a - b);
console.log('earned achievement IDs:', sorted.length);
console.log('first ten             :', sorted.slice(0, 10).join(', '));
