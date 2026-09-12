// Menu-bar icon drawn in code, so the repo carries no binary asset.
// A 22×22 template image (alpha only): macOS tints template images
// automatically for light/dark menu bars, so we draw the design's two-peak
// ridgeline as a filled silhouette in alpha.
import { nativeImage } from 'electron';

// Design polygon in the 22-unit box; filled, closing along the flat base.
const POLY = [[2, 17.5], [7.4, 9.4], [10.8, 14], [15, 5.8], [20, 17.5]];
const inPoly = (px, py) => {
  let inside = false;
  for (let i = 0, j = POLY.length - 1; i < POLY.length; j = i++) {
    const [xi, yi] = POLY[i], [xj, yj] = POLY[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

export function trayIcon() {
  const S = 22;
  const buf = Buffer.alloc(S * S * 4); // BGRA
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let hits = 0;                    // 3×3 supersample for smooth edges
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) if (inPoly(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)) hits++;
      const a = Math.round((hits / 9) * 255);
      if (a > 4) { const i = (y * S + x) * 4; buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = a; }
    }
  }
  const img = nativeImage.createFromBuffer(buf, { width: S, height: S });
  img.setTemplateImage(true);
  return img;
}
