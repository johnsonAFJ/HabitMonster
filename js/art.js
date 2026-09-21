// Loads the monster sheets and the room, and draws them.
//
//   <species>.png  192 x 192, 64 x 64 cells
//                  row = form (hatchling, adolescent, full grown)
//                  column = mood (normal, happy, worn out)
//   room.png       256 x 160, floor line at y 128, monster stands at x 128
//
// The egg is drawn in code rather than loaded, since it is the same for all
// three starters and only ever appears before the first habit is logged.

import { STARTERS, FURNITURE } from './monster.js';

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

function loadQuietly(src, isValid) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(isValid(img.naturalWidth, img.naturalHeight) ? img : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function loadArt() {
  const square = (w, h) => w === SHEET && h === SHEET;
  const [room, sheets, pieces] = await Promise.all([
    loadImage('assets/room.png', (w, h) => w === ROOM_W && h === ROOM_H, `${ROOM_W}x${ROOM_H}`),
    Promise.all(STARTERS.map((s) => loadImage(`assets/${s}.png`, square, `${SHEET}x${SHEET}`))),
    // Only pieces listed in FURNITURE_ART are fetched. Asking for files that
    // do not exist costs a request each, and the browser logs every failed
    // image as an error even though the drawn fallback handles it.
    Promise.all(FURNITURE.map(({ id }) => {
      if (!FURNITURE_ART.has(id)) return null;
      const { w, h } = FURNITURE_SPOTS[id];
      return loadQuietly(`assets/furniture/${id}.png`, (iw, ih) => iw === w && ih === h);
    })),
  ]);
  return {
    room,
    sheets: Object.fromEntries(STARTERS.map((s, i) => [s, sheets[i]])),
    furniture: Object.fromEntries(FURNITURE.map(({ id }, i) => [id, pieces[i]])),
    missing: [
      ...(room ? [] : ['room.png']),
      ...STARTERS.filter((_, i) => !sheets[i]).map((s) => `${s}.png`),
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

// ---- Furniture ----
//
// Where each piece sits in the room, as its top-left corner and size. Floor
// pieces put their bottom row ON the floor line at y 128, like the monster.
// None of them overlap each other or the monster's box at x 96-159, y 64-127.
//
// A PNG at assets/furniture/<id>.png of exactly this size replaces the
// version drawn in code. See ART_BRIEF.md.

// The pieces with real art in assets/furniture/. Everything else is drawn in
// code. Add an id here when its PNG lands; `npm run check-art` fails if this
// list and the files on disk disagree.
export const FURNITURE_ART = new Set([]);

export const FURNITURE_SPOTS = {
  picture: { x: 168, y: 48, w: 28, h: 26 },
  shelf: { x: 202, y: 62, w: 32, h: 22 },
  lamp: { x: 238, y: 77, w: 14, h: 52 },
  chest: { x: 166, y: 107, w: 32, h: 22 },
  clock: { x: 118, y: 38, w: 20, h: 20 },
  plant: { x: 70, y: 97, w: 22, h: 32 },
  // Sits on the toy chest, which always arrives first.
  trophy: { x: 175, y: 91, w: 14, h: 16 },
};

const WOOD_D = '#6b4226';
const WOOD = '#8a5638';
const WOOD_L = '#c48a5e';
const BRASS_D = '#8c6a2a';
const BRASS = '#c9a14a';
const BRASS_L = '#f0d27a';
const CREAM = '#f2e4c9';
const SKY = '#9ac5d8';
const SKY_L = '#c6e3ee';
const SUN = '#f6d98a';
const HILL = '#6fa34a';
const HILL_D = '#4f7f35';
const LEAF_D = '#3e6e2a';
const LEAF = '#5f9b3e';
const LEAF_L = '#8cc45a';
const POT_D = '#7e3a1f';
const POT = '#b0562e';
const POT_L = '#d0764a';
const SHADE = '#f2d58a';
const SHADE_D = '#d9a94a';
const BOOKS = ['#c0392b', '#3f6fb0', '#3f8f5f', '#d9b43c', '#7a4fa0', '#b0562e'];

function px(ctx, color, x, y, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// A filled rectangle with the shared 1px outline.
function box(ctx, x, y, w, h, fill) {
  px(ctx, OUTLINE, x, y, w, h);
  px(ctx, fill, x + 1, y + 1, w - 2, h - 2);
}

// A row-by-row shape, given the half-width of each row about a center line.
function shape(ctx, cx, top, halves, fill) {
  halves.forEach((half, row) => {
    if (half <= 0) return;
    px(ctx, OUTLINE, cx - half, top + row, half * 2, 1);
  });
  halves.forEach((half, row) => {
    const edge = row === 0 || row === halves.length - 1;
    if (half <= 1 || edge) return;
    px(ctx, typeof fill === 'function' ? fill(row) : fill, cx - half + 1, top + row, half * 2 - 2, 1);
  });
}

function leaf(ctx, cx, cy, rx, ry) {
  const halves = [];
  for (let r = -ry; r <= ry; r++) halves.push(Math.max(1, Math.round(rx * (1 - Math.abs(r) / (ry + 1)))));
  shape(ctx, cx, cy - ry, halves, (row) => (row < ry ? LEAF_L : LEAF));
}

const DRAW = {
  picture(ctx, x, y) {
    box(ctx, x, y, 28, 26, WOOD);
    px(ctx, WOOD_L, x + 1, y + 1, 26, 1);
    px(ctx, WOOD_L, x + 1, y + 1, 1, 24);
    px(ctx, WOOD_D, x + 1, y + 24, 26, 1);
    px(ctx, WOOD_D, x + 26, y + 1, 1, 24);
    px(ctx, OUTLINE, x + 3, y + 3, 22, 20);
    px(ctx, SKY, x + 4, y + 4, 20, 18);
    px(ctx, SKY_L, x + 4, y + 4, 20, 5);
    px(ctx, SUN, x + 18, y + 6, 3, 3);
    px(ctx, HILL, x + 7, y + 13, 8, 2);
    px(ctx, HILL, x + 5, y + 15, 12, 1);
    px(ctx, HILL, x + 4, y + 16, 20, 6);
    px(ctx, HILL_D, x + 15, y + 17, 9, 5);
    px(ctx, HILL_D, x + 4, y + 20, 20, 2);
  },

  shelf(ctx, x, y) {
    // Books standing on the plank: [x offset, width, height].
    [[2, 4, 12], [6, 3, 10], [9, 4, 13], [13, 3, 9], [16, 4, 11], [20, 3, 12]].forEach(([dx, w, h], i) => {
      box(ctx, x + dx, y + 16 - h, w, h, BOOKS[i]);
      px(ctx, CREAM, x + dx + 1, y + 16 - h + 2, w - 2, 1);
    });
    // One leaning at the end.
    for (let r = 0; r < 10; r++) px(ctx, OUTLINE, x + 24 + Math.floor(r / 3), y + 6 + r, 4, 1);
    for (let r = 1; r < 9; r++) px(ctx, BOOKS[1], x + 25 + Math.floor(r / 3), y + 6 + r, 2, 1);
    box(ctx, x, y + 16, 32, 4, WOOD);
    px(ctx, WOOD_L, x + 1, y + 17, 30, 1);
    px(ctx, OUTLINE, x + 4, y + 20, 2, 2);
    px(ctx, OUTLINE, x + 26, y + 20, 2, 2);
  },

  lamp(ctx, x, y) {
    const halves = [];
    for (let r = 0; r < 14; r++) halves.push(4 + Math.round((3 * r) / 13));
    shape(ctx, x + 7, y, halves, (row) => (row < 6 ? SHADE : SHADE_D));
    px(ctx, OUTLINE, x + 5, y + 14, 4, 32);
    px(ctx, BRASS, x + 6, y + 14, 2, 32);
    px(ctx, BRASS_L, x + 6, y + 14, 1, 32);
    box(ctx, x + 2, y + 46, 10, 6, BRASS);
    px(ctx, BRASS_L, x + 3, y + 47, 8, 1);
  },

  chest(ctx, x, y) {
    box(ctx, x, y, 32, 22, WOOD);
    px(ctx, WOOD_L, x + 1, y + 1, 30, 1);
    px(ctx, OUTLINE, x + 1, y + 7, 30, 1);
    px(ctx, WOOD_D, x + 10, y + 8, 1, 13);
    px(ctx, WOOD_D, x + 21, y + 8, 1, 13);
    px(ctx, WOOD_D, x + 1, y + 20, 30, 1);
    box(ctx, x + 14, y + 5, 4, 5, BRASS);
    px(ctx, OUTLINE, x + 15, y + 7, 2, 1);
    for (const [cx, cy] of [[1, 1], [28, 1], [1, 18], [28, 18]]) px(ctx, BRASS, x + cx, y + cy, 3, 3);
  },

  clock(ctx, x, y) {
    const halves = [];
    for (let r = 0; r < 20; r++) {
      const dy = r - 9.5;
      halves.push(Math.round(Math.sqrt(Math.max(0, 100 - dy * dy))));
    }
    shape(ctx, x + 10, y, halves, WOOD);
    // The face, inset from the wooden rim.
    halves.forEach((half, row) => {
      if (row < 3 || row > 16 || half < 5) return;
      px(ctx, CREAM, x + 10 - half + 3, y + row, (half - 3) * 2, 1);
    });
    for (const [dx, dy] of [[9, 3], [9, 15], [3, 9], [15, 9]]) px(ctx, OUTLINE, x + dx, y + dy, 2, 2);
    px(ctx, OUTLINE, x + 9, y + 5, 2, 5);
    px(ctx, OUTLINE, x + 9, y + 9, 5, 2);
  },

  plant(ctx, x, y) {
    px(ctx, LEAF_D, x + 10, y + 8, 2, 14);
    leaf(ctx, x + 6, y + 14, 5, 4);
    leaf(ctx, x + 16, y + 12, 5, 4);
    leaf(ctx, x + 11, y + 5, 4, 5);
    leaf(ctx, x + 4, y + 19, 3, 2);
    leaf(ctx, x + 18, y + 18, 3, 2);
    box(ctx, x + 3, y + 21, 16, 3, POT_L);
    const body = [];
    for (let r = 0; r < 8; r++) body.push(7 - Math.round((2 * r) / 7));
    shape(ctx, x + 11, y + 24, body, POT);
    px(ctx, POT_D, x + 9, y + 29, 4, 1);
  },

  trophy(ctx, x, y) {
    const bowl = [];
    for (let r = 0; r < 8; r++) bowl.push(5 - Math.round((3 * r) / 7));
    shape(ctx, x + 7, y, bowl, BRASS);
    px(ctx, BRASS_L, x + 4, y + 1, 2, 3);
    px(ctx, OUTLINE, x + 1, y + 1, 2, 1);
    px(ctx, OUTLINE, x + 1, y + 2, 1, 3);
    px(ctx, OUTLINE, x + 1, y + 4, 2, 1);
    px(ctx, OUTLINE, x + 11, y + 1, 2, 1);
    px(ctx, OUTLINE, x + 12, y + 2, 1, 3);
    px(ctx, OUTLINE, x + 11, y + 4, 2, 1);
    px(ctx, OUTLINE, x + 5, y + 8, 4, 4);
    px(ctx, BRASS, x + 6, y + 8, 2, 4);
    box(ctx, x + 3, y + 12, 8, 4, BRASS_D);
    px(ctx, BRASS, x + 4, y + 13, 6, 1);
  },
};

// Draws one piece at its spot, from its PNG if there is one.
export function drawFurniture(ctx, art, id) {
  const spot = FURNITURE_SPOTS[id];
  if (!spot) return;
  const image = art?.furniture?.[id];
  if (image) ctx.drawImage(image, spot.x, spot.y);
  else DRAW[id](ctx, spot.x, spot.y);
}

// Draws a piece on its own, top-left at (0, 0), for the events chart.
export function drawFurniturePiece(ctx, art, id) {
  const spot = FURNITURE_SPOTS[id];
  const image = art?.furniture?.[id];
  if (image) ctx.drawImage(image, 0, 0);
  else DRAW[id](ctx, 0, 0);
  return spot;
}
