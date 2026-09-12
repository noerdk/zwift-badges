// Generates build/icon.png (1024²) — the app mark: a two-peak ridgeline (the
// shape a route profile makes) in Zwift orange on near-black, matching the
// design. No image deps: draws RGBA and encodes PNG via zlib.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const S = 1024;
const buf = Buffer.alloc(S * S * 4);
const set = (x, y, r, g, b, a) => { const i = (y * S + x) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a; };

const R = 224;                                  // corner radius (≈ design 56/256)
const inRounded = (x, y) => {
  const dx = Math.max(R - x, x - (S - 1 - R), 0);
  const dy = Math.max(R - y, y - (S - 1 - R), 0);
  return dx * dx + dy * dy <= R * R;
};

// Design polygon in a 160-unit box, scaled to 1024 (×6.4). Filled, so it closes
// along the flat base into a mountain silhouette.
const K = S / 160;
const POLY = [[12, 132], [54, 68], [78, 104], [110, 40], [148, 132]].map(([x, y]) => [x * K, y * K]);
const inPoly = (px, py) => {
  let inside = false;
  for (let i = 0, j = POLY.length - 1; i < POLY.length; j = i++) {
    const [xi, yi] = POLY[i], [xj, yj] = POLY[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const BG = [0x0f, 0x13, 0x19];      // near-black tile
const FG = [0xfc, 0x67, 0x19];      // Zwift orange
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (!inRounded(x, y)) continue;
    // 3×3 supersample for smooth polygon edges
    let hits = 0;
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) if (inPoly(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)) hits++;
    const t = hits / 9;
    const r = Math.round(BG[0] + (FG[0] - BG[0]) * t);
    const g = Math.round(BG[1] + (FG[1] - BG[1]) * t);
    const b = Math.round(BG[2] + (FG[2] - BG[2]) * t);
    set(x, y, r, g, b, 255);
  }
}

// --- minimal PNG encoder ---
const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) { raw[y * (S * 4 + 1)] = 0; buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4); }
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(new URL('../build/icon.png', import.meta.url), png);
console.log('wrote build/icon.png', png.length, 'bytes');
