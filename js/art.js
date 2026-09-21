// Loads the monster sheets and the room, and draws them.
//
//   <species>.png  192 x 192, 64 x 64 cells
//                  row = form (hatchling, adolescent, full grown)
//                  column = mood (normal, happy, worn out)
//   room.png       256 x 160, floor line at y 128, monster stands at x 128
//
// The egg is drawn in code rather than loaded, since it is the same for all
// three starters and only ever appears before the first habit is logged.

import { STARTERS } from './monster.js';

export const CELL = 64;
export const SHEET = 192;
export const ROOM_W = 256;
export const ROOM_H = 160;
export const FLOOR_Y = 128;
export const SPOT_X = 128;

export const MOOD_NORMAL = 0;
export const MOOD_HAPPY = 1;
export const MOOD_WORN = 2;

const OUTLINE = '#2b2220';
const EGG_SHELL = '#f2e4c9';
const EGG_SHADE = '#d9c49f';
const EGG_SPECKLE = '#b08a5e';

function loadImage(src, isValid, expected) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (isValid(img.naturalWidth, img.naturalHeight)) return resolve(img);
      console.warn(`${src} is ${img.naturalWidth}x${img.naturalHeight}, expected ${expected}.`);
      resolve(null);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function loadArt() {
  const square = (w, h) => w === SHEET && h === SHEET;
  const [room, ...sheets] = await Promise.all([
    loadImage('assets/room.png', (w, h) => w === ROOM_W && h === ROOM_H, `${ROOM_W}x${ROOM_H}`),
    ...STARTERS.map((s) => loadImage(`assets/${s}.png`, square, `${SHEET}x${SHEET}`)),
  ]);
  return {
    room,
    sheets: Object.fromEntries(STARTERS.map((s, i) => [s, sheets[i]])),
    missing: [
      ...(room ? [] : ['room.png']),
      ...STARTERS.filter((s, i) => !sheets[i]).map((s) => `${s}.png`),
    ],
  };
}

// One cell of a sheet, drawn with its top-left corner at (x, y).
export function drawCell(ctx, art, species, form, mood, x, y, scale = 1) {
  // The first render happens before loadArt resolves, so a missing sheet is
  // normal rather than exceptional.
  const sheet = art?.sheets?.[species];
  if (!sheet) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, mood * CELL, form * CELL, CELL, CELL, x, y, CELL * scale, CELL * scale);
  return true;
}

// The monster standing on the floor line, centered on its spot. The cell's
// bottom row lands ON the floor line, not the wall pixel above it.
export function drawMonster(ctx, art, species, form, mood) {
  return drawCell(ctx, art, species, form, mood, SPOT_X - CELL / 2, FLOOR_Y - CELL + 1);
}

// A speckled egg, sitting on the floor line. Drawn a row at a time so the
// edges stay hard, the way the sprite art is.
export function drawEgg(ctx, x = SPOT_X, floorY = FLOOR_Y) {
  const w = 26;
  const h = 34;
  const top = floorY - h + 1;
  // An ellipse whose center sits below the middle, so the egg is narrow at
  // the top and blunt at the bottom. Centering it would taper both ends and
  // leave the egg balancing on a point.
  const cy = h * 0.60;
  const ry = h * 0.62;
  const halfWidths = [];
  for (let row = 0; row < h; row++) {
    const from = (row + 0.5 - cy) / ry;
    halfWidths.push(Math.round((w / 2) * Math.sqrt(Math.max(0, 1 - from * from))));
  }

  // Outline first, then the shell inset by a pixel on each side.
  ctx.fillStyle = OUTLINE;
  halfWidths.forEach((half, row) => {
    if (half <= 0) return;
    ctx.fillRect(x - half - 1, top + row, (half + 1) * 2, 1);
  });
  halfWidths.forEach((half, row) => {
    if (half <= 0) return;
    ctx.fillStyle = row > h * 0.62 ? EGG_SHADE : EGG_SHELL;
    ctx.fillRect(x - half, top + row, half * 2, 1);
  });

  // A fixed speckle pattern, so the egg looks the same every render.
  ctx.fillStyle = EGG_SPECKLE;
  for (const [dx, dy] of [[-5, 10], [3, 7], [7, 15], [-7, 19], [0, 22], [5, 26], [-3, 15]]) {
    const row = dy;
    if (row < 0 || row >= h) continue;
    const half = halfWidths[row];
    if (Math.abs(dx) + 1 >= half) continue;
    ctx.fillRect(x + dx, top + row, 2, 2);
  }
}

// Sparkles rising off the monster just after a habit is logged.
export const CHEER_MS = 900;

export function drawCheer(ctx, elapsed) {
  const t = elapsed / CHEER_MS;
  if (t >= 1) return false;
  const motes = [[-22, 0.0], [-9, 0.25], [6, 0.12], [19, 0.35], [-16, 0.5], [13, 0.55]];
  for (const [dx, delay] of motes) {
    const local = (t - delay) / (1 - delay);
    if (local <= 0 || local >= 1) continue;
    const y = FLOOR_Y - 26 - local * 40;
    const size = local > 0.75 ? 1 : 2;
    ctx.fillStyle = local > 0.6 ? '#f6d98a' : '#ffffff';
    ctx.fillRect(Math.round(SPOT_X + dx), Math.round(y), size, size);
  }
  return true;
}
