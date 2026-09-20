// Art: placeholder sprites drawn in code, or real PNGs from assets/.
//
// Current layout (shared with the Claude Design brief in SPEC.md):
//   plants.png     960 x 192, 48 x 48 cells
//                  row = species (tulip, sunflower, echeveria, cactus)
//                  column = growth * 5 + health
//                  plant base on the cell's bottom row, centered on x 23-24
//   terrarium.png  192 x 96, soil line at y 64, spots at x 48, 96, 144
//
// The first art batch (640 x 128 sheet of 32 px cells, 192 x 144 terrarium
// with soil at y 124) still loads, so either file can be swapped on its own.

import { SPECIES } from './garden.js';

export const SCENE_W = 192;
export const SPOTS_X = [48, 96, 144];

// Sheet width -> cell size, and terrarium height -> soil line.
const SHEET_CELLS = { 640: 32, 960: 48 };
const SCENE_SOIL = { 96: 64, 144: 124 };

const CELL = 48;         // placeholder sheet cell size
const SCENE_H = 96;      // placeholder terrarium height
const SOIL_Y = 64;       // placeholder terrarium soil line
const GRID = 32;         // the placeholder plants are drawn on a 32 px grid
const OUTLINE = '#2b2220';

// ---- Loading ----

function loadImage(src, isValid, expected) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (isValid(img.naturalWidth, img.naturalHeight)) return resolve(img);
      console.warn(`${src} is ${img.naturalWidth}x${img.naturalHeight}, expected ${expected}. Using placeholder art.`);
      resolve(null);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Real art wins whenever it exists and has a recognized size.
export async function loadArt() {
  const [plants, terrarium] = await Promise.all([
    loadImage('assets/plants.png', (w, h) => SHEET_CELLS[w] && h === SHEET_CELLS[w] * 4, '960x192'),
    loadImage('assets/terrarium.png', (w, h) => w === SCENE_W && SCENE_SOIL[h], '192x96'),
  ]);
  const sheet = plants ?? drawPlantSheet();
  const scene = terrarium ?? drawTerrarium();
  return {
    plants: sheet,
    terrarium: scene,
    cell: SHEET_CELLS[sheet.width],
    sceneH: scene.height,
    soilY: SCENE_SOIL[scene.height],
    custom: { plants: !!plants, terrarium: !!terrarium },
  };
}

// Draws one sheet cell with its top-left corner at (x, y), scaled by `scale`.
export function drawCell(ctx, art, speciesIndex, growth, health, x, y, scale = 1) {
  const { cell } = art;
  const col = growth * 5 + health;
  ctx.drawImage(art.plants, col * cell, speciesIndex * cell, cell, cell, x, y, cell * scale, cell * scale);
}

export function drawPlant(ctx, art, speciesIndex, growth, health, spotX) {
  drawCell(ctx, art, speciesIndex, growth, health, spotX - art.cell / 2, art.soilY - art.cell);
}

// ---- Placeholder plant sheet ----

// Per health level: 0 thriving ... 4 fully wilted.
const LEAF = [['#6cc04a', '#3f8f2f'], ['#8abb42', '#5a8a30'], ['#aab040', '#7c8230'], ['#bc9a44', '#8a6c30'], ['#8c6a42', '#5e452c']];
const SUCCULENT = [['#94d2b4', '#5a9e84'], ['#a2caa4', '#6a9a7c'], ['#b8c29a', '#83916e'], ['#c2ab84', '#8f7a58'], ['#9c7f60', '#6a543e']];
const CACTUS = [['#5fae6e', '#3d7d4c'], ['#74aa6c', '#4c7c4a'], ['#95ad76', '#687e52'], ['#b0aa80', '#827a58'], ['#9c8866', '#6c5c44']];
const TULIP_PETAL = [['#ec5052', '#b8323a'], ['#e05a50', '#ac3a38'], ['#c8684e', '#96463a'], ['#a8664c', '#7c4a38'], ['#80583e', '#5c3e2c']];
const SUN_PETAL = [['#f8cc38', '#d8a02a'], ['#eec23e', '#c89a30'], ['#d8b046', '#b08a38'], ['#b8944a', '#8e703a'], ['#8c6e44', '#6a5236']];
const SUN_CENTER = ['#6b4226', '#6b4226', '#5e3c26', '#523624', '#463024'];
const BLOOM = [['#ff72ac', '#d24a84'], ['#f27aa6', '#c65282'], ['#d88a98', '#aa6676'], ['#b08478', '#86625a'], ['#86644e', '#644a3a']];
const SPINE = '#efe6c4';

const DROOP = [0, 1, 3, 5, 7];              // sideways bend at the tip for a full-size plant
const SAG = [1, 1, 0.96, 0.86, 0.72];       // height multiplier as the plant collapses
const LEAF_SLOPE = [-0.6, -0.3, 0.2, 0.6, 1.0];

function newCell() {
  return Array.from({ length: GRID }, () => Array(GRID).fill(null));
}

// Leaves a 1 px margin on the sides and top so the outline fits in the cell.
function set(g, x, y, color) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 2 || x > 29 || y < 2 || y > 31) return;
  g[y][x] = color;
}

function outline(g) {
  const filled = (x, y) => y >= 0 && y < GRID && x >= 0 && x < GRID && g[y][x] && g[y][x] !== OUTLINE;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!g[y][x] && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) {
        g[y][x] = OUTLINE;
      }
    }
  }
}

// Stem points from the base (index 0, y 31) to the tip, bending right as health drops.
function stem(g, height, h, thick) {
  const len = Math.max(2, Math.round(height * SAG[h]));
  const bend = DROOP[h] * (height / 26);
  const pts = [];
  for (let i = 0; i < len; i++) {
    const t = len > 1 ? i / (len - 1) : 0;
    pts.push({ x: 15 + Math.round(bend * t * t), y: 31 - i });
  }
  for (const p of pts) {
    set(g, p.x, p.y, LEAF[h][1]);
    if (thick) set(g, p.x + 1, p.y, LEAF[h][0]);
  }
  return pts;
}

function leaf(g, x, y, dir, len, slope, colors) {
  for (let k = 1; k <= len; k++) {
    const ly = y + slope * k;
    set(g, x + dir * k, ly, colors[0]);
    if (k < len) set(g, x + dir * k, ly + 1, colors[1]);
  }
}

// A long leaf rising from the base. It leans further out and curls down as health drops.
const BLADE_LEAN = [18, 28, 45, 70, 95];  // degrees from vertical at the base
const BLADE_CURL = [12, 22, 40, 60, 75];  // extra degrees by the tip
function blade(g, dir, len, h) {
  let x = 15.5 + dir * 0.5;
  let y = 30.5;
  for (let s = 0; s <= len; s += 0.5) {
    const deg = BLADE_LEAN[h] + BLADE_CURL[h] * (s / len);
    const rad = (deg * Math.PI) / 180;
    x += dir * 0.5 * Math.sin(rad);
    y -= 0.5 * Math.cos(rad);
    set(g, x, y, LEAF[h][0]);
    if (s < len * 0.7) set(g, x - dir, y, LEAF[h][1]);
  }
}

function drawTulip(g, growth, h) {
  const pts = stem(g, [8, 15, 22, 24][growth], h, false);
  const len = [4, 7, 10, 10][growth];
  blade(g, -1, len, h);
  blade(g, 1, len - 2, h);
  const tip = pts[pts.length - 1];
  if (growth === 2) {
    for (let dy = 0; dy < 3; dy++) for (let dx = -1; dx <= 1; dx++) set(g, tip.x + dx, tip.y - dy, LEAF[h][dy === 2 ? 0 : 1]);
  }
  if (growth === 3) {
    const [light, dark] = TULIP_PETAL[h];
    // Cup opening up when healthy, hanging upside down once wilted.
    const cup = ['X.X.X', 'XXXXX', 'XXXXX', 'XXXXX', '.XXX.'];
    const rows = h >= 3 ? [...cup].reverse() : cup;
    const top = h >= 3 ? tip.y : tip.y - 5;
    rows.forEach((row, r) => [...row].forEach((c, i) => {
      const dropped = h === 4 && (i === 0 || i === 4) && r > 0;
      if (c === 'X' && !dropped) set(g, tip.x - 2 + i, top + r, i < 2 ? light : dark);
    }));
    if (h === 4) set(g, tip.x + 3, 31, light); // a fallen petal
  }
}

function drawSunflower(g, growth, h) {
  const pts = stem(g, [8, 16, 21, 21][growth], h, growth >= 2);
  const spots = [[0.5], [0.3, 0.6], [0.2, 0.45, 0.7], [0.2, 0.45, 0.7]][growth];
  const len = [2, 3, 4, 4][growth];
  spots.forEach((f, i) => {
    const p = pts[Math.floor(f * (pts.length - 1))];
    leaf(g, p.x, p.y, -1, len, LEAF_SLOPE[h], LEAF[h]);
    leaf(g, p.x + (growth >= 2 ? 1 : 0), p.y - (i % 2), 1, len, LEAF_SLOPE[h], LEAF[h]);
  });
  const tip = pts[pts.length - 1];
  if (growth === 2) {
    for (let dy = 0; dy < 3; dy++) for (let dx = -1; dx <= 1; dx++) set(g, tip.x + dx, tip.y - 1 - dy, LEAF[h][(dx + dy) % 2 ? 0 : 1]);
  }
  if (growth === 3) {
    const cx = tip.x + (h >= 3 ? 2 : 0);
    const cy = tip.y - (h >= 3 ? 1 : 4);
    const [light, dark] = SUN_PETAL[h];
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const corner = Math.abs(dx) + Math.abs(dy) > 5;
        // Wilted heads face down: only the lower petals still show.
        const hidden = (h >= 3 && dy < -1) || (h === 4 && (dx + dy) % 2 === 0);
        if (corner || hidden) continue;
        const inner = dx * dx + dy * dy <= 2;
        set(g, cx + dx, cy + dy, inner ? SUN_CENTER[h] : (dy > 0 ? dark : light));
      }
    }
  }
}

function drawEcheveria(g, growth, h) {
  const radius = [3, 6, 8, 8][growth] * [1, 1, 0.95, 0.85, 0.75][h];
  const count = [3, 5, 7, 7][growth];
  const spread = [0, 0.1, 0.25, 0.45, 0.6][h];
  const [light, dark] = SUCCULENT[h];
  const leaves = Array.from({ length: count }, (_, j) => {
    const a = Math.PI - ((j + 0.5) / count) * Math.PI;
    return a > Math.PI / 2 ? a + (Math.PI - a) * spread : a * (1 - spread);
  });
  // Outer leaves first so the inner ones overlap them.
  leaves.sort((a, b) => Math.abs(b - Math.PI / 2) - Math.abs(a - Math.PI / 2));
  // Plump leaves: widest in the middle, with a pink tip while healthy.
  leaves.forEach((a, j) => {
    const color = j % 2 ? light : dark;
    const nx = -Math.sin(a);
    const ny = -Math.cos(a);
    for (let s = 0; s <= radius; s += 0.5) {
      const x = 15.5 + s * Math.cos(a);
      const y = 30.5 - s * Math.sin(a);
      const t = s / radius;
      const half = h === 4 ? 0.3 : 1.4 * Math.sin(Math.PI * Math.min(0.95, t * 0.9 + 0.1));
      for (let w = -half; w <= half; w += 0.5) set(g, x + nx * w, y + ny * w, color);
    }
    if (h <= 1 && radius >= 5) set(g, 15.5 + radius * Math.cos(a), 30.5 - radius * Math.sin(a), '#e38f98');
  });
  set(g, 15, 30, light);
  set(g, 16, 30, light);

  if (growth === 3) {
    // A curved flower stalk with small bells, arching further over as it wilts.
    const arch = [3, 4, 6, 8, 9][h];
    const tall = Math.round(15 * SAG[h]);
    let end = { x: 16, y: 29 };
    for (let i = 0; i < tall; i++) {
      const t = i / (tall - 1);
      end = { x: 16 + Math.round(arch * t * t), y: 29 - i + Math.round(arch * 0.6 * t * t * t) };
      set(g, end.x, end.y, LEAF[h][1]);
    }
    const [bloom, bloomDark] = BLOOM[h].map((c, i) => (h === 0 ? ['#f5925e', '#cc6a3e'][i] : c));
    [[0, 1], [1, 3], [-1, 3]].forEach(([dx, dy], i) => {
      if (h === 4 && i === 2) return;
      set(g, end.x + dx, end.y + dy, bloom);
      set(g, end.x + dx, end.y + dy + 1, bloomDark);
    });
  }
}

function drawCactus(g, growth, h) {
  const [w, tall] = [[5, 6], [9, 11], [13, 17], [13, 17]][growth];
  const width = w * [1, 1, 0.95, 0.88, 0.8][h];
  const height = Math.round(tall * [1, 1, 0.97, 0.9, 0.82][h]);
  const lean = [0, 0, 1, 2, 4][h] * (tall / 17);
  const [light, dark] = CACTUS[h];
  let top = { x: 15.5, y: 31 };
  for (let r = 0; r < height; r++) {
    const t = (r - height * 0.42) / (height * 0.6);
    const half = (width / 2) * Math.sqrt(Math.max(0.15, 1 - t * t));
    const cx = 15.5 + lean * (r / height) ** 2;
    const y = 31 - r;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half - 1); x++) {
      const rib = Math.abs(x - Math.round(cx)) % 3 === 1;
      let color = rib ? dark : light;
      if (rib && h <= 2 && (r + x) % 4 === 0) color = SPINE;
      set(g, x, y, color);
    }
    top = { x: cx, y };
  }
  if (growth === 3) {
    const [bloom, bloomDark] = BLOOM[h];
    const fx = Math.round(top.x) + (h >= 3 ? 1 : 0);
    const fy = top.y - 1 + (h >= 3 ? 1 : 0);
    for (let dx = -2; dx <= 1; dx++) set(g, fx + dx, fy, dx === -1 || dx === 0 ? bloomDark : bloom);
    if (h < 4) for (let dx = -1; dx <= 0; dx++) set(g, fx + dx, fy - 1, bloom);
  }
}

const DRAWERS = { tulip: drawTulip, sunflower: drawSunflower, echeveria: drawEcheveria, cactus: drawCactus };

// The 32 px drawings sit bottom-center in 48 px cells, so their base lands on x 23-24.
export function drawPlantSheet() {
  const canvas = document.createElement('canvas');
  canvas.width = CELL * 20;
  canvas.height = CELL * 4;
  const ctx = canvas.getContext('2d');
  const inset = { x: (CELL - GRID) / 2, y: CELL - GRID };
  SPECIES.forEach((species, row) => {
    for (let growth = 0; growth < 4; growth++) {
      for (let health = 0; health < 5; health++) {
        const g = newCell();
        DRAWERS[species](g, growth, health);
        outline(g);
        const ox = (growth * 5 + health) * CELL + inset.x;
        const oy = row * CELL + inset.y;
        g.forEach((line, y) => line.forEach((color, x) => {
          if (!color) return;
          ctx.fillStyle = color;
          ctx.fillRect(ox + x, oy + y, 1, 1);
        }));
      }
    }
  });
  return canvas;
}

// ---- Placeholder terrarium ----

// Small deterministic noise so the soil and pebbles look the same every load.
function noise(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export function drawTerrarium() {
  const canvas = document.createElement('canvas');
  canvas.width = SCENE_W;
  canvas.height = SCENE_H;
  const ctx = canvas.getContext('2d');
  const rect = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };

  const shelfY = 86;
  const pebbleY = 80;

  // Wall
  rect(0, 0, SCENE_W, SCENE_H, '#efe6d2');

  // Shelf
  rect(0, shelfY, SCENE_W, SCENE_H - shelfY, '#9a6a44');
  rect(0, shelfY, SCENE_W, 1, '#b8845a');
  rect(0, SCENE_H - 2, SCENE_W, 2, '#6e4a30');

  // Glass box. The top rim sits just above y 16, where a full-grown plant tops out.
  const left = 10;
  const right = 181;
  const topY = 13;
  rect(left, topY, right - left + 1, shelfY - topY, '#d6ebe3');
  rect(left, topY, 1, shelfY - topY, '#7fa6a2');
  rect(right, topY, 1, shelfY - topY, '#7fa6a2');
  rect(left - 2, topY - 3, right - left + 5, 3, '#7fa6a2');
  rect(left - 2, topY - 3, right - left + 5, 1, '#a9cbc7');
  rect(left - 2, topY, right - left + 5, 1, '#5c807c');

  // Soil with pebbles along the bottom and a few moss specks on top.
  for (let y = SOIL_Y; y < shelfY; y++) {
    for (let x = left + 1; x < right; x++) {
      const n = noise(x, y);
      let color = n > 0.85 ? '#4a3022' : n < 0.12 ? '#6a4632' : '#5b3c2a';
      if (y === SOIL_Y) color = n > 0.5 ? '#72503a' : '#684632';
      if (y >= pebbleY && n > 0.55) color = n > 0.8 ? '#a8a29a' : '#8a847c';
      rect(x, y, 1, 1, color);
    }
  }
  for (let x = left + 3; x < right - 2; x += 1) {
    const nearSpot = SPOTS_X.some((s) => Math.abs(x - s) < 9);
    if (!nearSpot && noise(x, 3) > 0.72) rect(x, SOIL_Y - 1, 1, 1, noise(x, 4) > 0.5 ? '#5f9a44' : '#7ab04e');
  }

  // Glass highlights
  for (let y = topY + 5; y < 52; y++) {
    if (y % 9 !== 0) rect(left + 5, y, 1, 1, '#f3faf7');
  }
  for (let i = 0; i < 10; i++) rect(right - 16 + i, topY + 4 + (i >> 1), 1, 1, '#f3faf7');

  return canvas;
}

// ---- Watering can ----

const CAN = [
  '....hhhh....',
  '...h....h...',
  's..bbbbbbbh.',
  'ss.bBBBBBbh.',
  '.ssbBBBBBb..',
  '..sbBBBBBb..',
  '...bbbbbbb..',
];
const CAN_COLORS = { h: '#3e4c68', b: '#3e4c68', B: '#7c94c4', s: '#56699a' };
export const WATER_FRAMES = 7;

// Draws the can tipped over the plant with water falling from the spout.
export function drawWatering(ctx, art, spotX, frame) {
  const canX = spotX - 1;
  const canY = Math.max(2, art.soilY - art.cell - 10);
  CAN.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === '.') return;
    ctx.fillStyle = CAN_COLORS[c];
    ctx.fillRect(canX + x, canY + y, 1, 1);
  }));
  if (frame === 0) return;
  ctx.fillStyle = '#5fb6e8';
  const tipX = canX;
  const tipY = canY + 3;
  const fall = art.soilY - tipY;
  const reach = Math.min(fall, (frame * fall) / 5);
  for (let k = 0; k < 12; k++) {
    const y = tipY + 2 + ((k * 5 + frame * 3) % fall);
    if (y - tipY < reach && y < art.soilY) ctx.fillRect(tipX - (k % 2), y, 1, 2);
  }
}
