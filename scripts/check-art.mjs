// Checks delivered art against the rules in ART_BRIEF.md.
//
//   node scripts/check-art.mjs
//
// Catches the faults that show up as bugs rather than as weaker art: a wrong
// sheet size (the app silently falls back to placeholders), semi-transparent
// pixels (muddy outlines once scaled up), and baselines that differ between
// cells (the monster hops when a habit is logged).

import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const STARTERS = ['embertail', 'voltectra', 'bubbletide'];
const CELL = 64;
const SHEET = 192;
const ROOM = { w: 256, h: 160, floorY: 128 };
const CLEAR = { x0: 96, x1: 159, y0: 64, y1: 127 }; // must stay open behind the monster
const FORM_HEIGHTS = [34, 46, 60]; // hatchling, adolescent, full grown
const FORM_NAMES = ['Hatchling', 'Adolescent', 'Full grown'];
const MOOD_NAMES = ['normal', 'happy', 'worn out'];
const MAX_COLORS = 32;

let failures = 0;
const fail = (msg) => { failures++; console.log(`  ✗ ${msg}`); };
const pass = (msg) => console.log(`  ✓ ${msg}`);
const note = (msg) => console.log(`    ${msg}`);

// ---- PNG reading: 8-bit RGB or RGBA, not interlaced. Keeps alpha. ----

function readPng(buf) {
  let pos = 8;
  let width, height, colorType;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const [bitDepth, ct, , , interlace] = data.subarray(8);
      colorType = ct;
      if (bitDepth !== 8 || ![2, 6].includes(ct) || interlace) {
        throw new Error('must be an 8-bit RGB or RGBA PNG without interlacing');
      }
    }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const rgba = Buffer.alloc(width * height * 4, 255);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      const paeth = () => {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      };
      line[i] = (line[i] + [0, a, b, (a + b) >> 1, paeth()][filter]) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const to = (y * width + x) * 4;
      line.copy(rgba, to, x * bpp, x * bpp + bpp);
      if (bpp === 3) rgba[to + 3] = 255;
    }
    prev = line;
  }
  return { width, height, rgba, hasAlpha: bpp === 4 };
}

const at = (img, x, y) => (y * img.width + x) * 4;

// ---- Sheets ----

function checkSheet(species) {
  const file = `assets/${species}.png`;
  console.log(`\n${file}`);
  if (!existsSync(file)) { fail('not found'); return; }

  let img;
  try {
    img = readPng(readFileSync(file));
  } catch (err) {
    fail(err.message);
    return;
  }

  if (img.width !== SHEET || img.height !== SHEET) {
    fail(`is ${img.width}x${img.height}, must be ${SHEET}x${SHEET} — the app will ignore it and draw placeholders`);
    return;
  }
  pass(`${SHEET}x${SHEET}, 3 moods x 3 forms of ${CELL}px`);

  let soft = 0;
  const colors = new Set();
  for (let i = 0; i < img.rgba.length; i += 4) {
    const alpha = img.rgba[i + 3];
    if (alpha === 0) continue;
    if (alpha < 255) soft++;
    else colors.add((img.rgba[i] << 16) | (img.rgba[i + 1] << 8) | img.rgba[i + 2]);
  }
  if (soft) fail(`${soft} semi-transparent pixels — outlines will look muddy scaled up`);
  else pass('no semi-transparent pixels');

  if (colors.size > MAX_COLORS) fail(`${colors.size} colors, brief asks for ${MAX_COLORS} or fewer`);
  else pass(`${colors.size} colors`);

  for (let form = 0; form < 3; form++) {
    const baselines = [];
    const heights = [];
    const feet = [];
    for (let mood = 0; mood < 3; mood++) {
      const ox = mood * CELL;
      const oy = form * CELL;
      let lowest = -1, highest = CELL, left = CELL, right = -1, filled = 0;
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          if (img.rgba[at(img, ox + x, oy + y) + 3] === 0) continue;
          filled++;
          if (y > lowest) lowest = y;
          if (y < highest) highest = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
      const where = `${FORM_NAMES[form]} / ${MOOD_NAMES[mood]}`;
      if (!filled) { fail(`${where}: cell is empty`); continue; }

      baselines.push(lowest);
      heights.push(lowest - highest + 1);
      if (lowest !== CELL - 1) fail(`${where}: feet on y ${lowest}, must be y ${CELL - 1}`);
      if (highest === 0 || left === 0 || right === CELL - 1) {
        fail(`${where}: touches a cell border, needs 1px clear on top/left/right`);
      }

      // The brief centers the BASE, not the silhouette: a tail or big ears
      // legitimately push the bounding box off to one side.
      let footLeft = CELL, footRight = -1;
      for (let x = 0; x < CELL; x++) {
        if (img.rgba[at(img, ox + x, oy + lowest) + 3] === 0) continue;
        if (x < footLeft) footLeft = x;
        if (x > footRight) footRight = x;
      }
      const foot = (footLeft + footRight) / 2;
      feet.push(foot);
      if (Math.abs(foot - (CELL - 1) / 2) > 4) {
        fail(`${where}: base centered on x ${foot.toFixed(1)}, expected about ${(CELL - 1) / 2}`);
      }
    }
    if (new Set(baselines).size > 1) {
      fail(`${FORM_NAMES[form]}: baselines differ across moods (${baselines.join(', ')}) — it will hop`);
    }
    if (feet.length && Math.max(...feet) - Math.min(...feet) > 6) {
      fail(`${FORM_NAMES[form]}: base shifts sideways across moods (x ${feet.map((f) => f.toFixed(1)).join(', ')}) — it will slide`);
    }
    if (heights.length) {
      // A slumped worn-out pose is shorter on purpose, so only the normal
      // pose is compared against the brief.
      note(`${FORM_NAMES[form]}: ${heights.join('/')} px tall (normal/happy/worn out), brief suggests about ${FORM_HEIGHTS[form]} standing`);
    }
  }
}

// ---- Room ----

function checkRoom() {
  const file = 'assets/room.png';
  console.log(`\n${file}`);
  if (!existsSync(file)) { fail('not found'); return; }
  const img = readPng(readFileSync(file));
  if (img.width !== ROOM.w || img.height !== ROOM.h) {
    fail(`is ${img.width}x${img.height}, must be ${ROOM.w}x${ROOM.h}`);
    return;
  }
  pass(`${ROOM.w}x${ROOM.h}`);

  let transparent = 0;
  for (let i = 3; i < img.rgba.length; i += 4) if (img.rgba[i] < 255) transparent++;
  if (transparent) fail(`${transparent} non-opaque pixels — the room is a background, it must be solid`);
  else pass('fully opaque');

  // The clear box should be plain wall and floor. Lots of distinct colors
  // there usually means furniture was drawn where the monster stands.
  const box = new Set();
  for (let y = CLEAR.y0; y <= CLEAR.y1; y++) {
    for (let x = CLEAR.x0; x <= CLEAR.x1; x++) {
      const i = at(img, x, y);
      box.add((img.rgba[i] << 16) | (img.rgba[i + 1] << 8) | img.rgba[i + 2]);
    }
  }
  note(`clear box x${CLEAR.x0}-${CLEAR.x1}, y${CLEAR.y0}-${CLEAR.y1}: ${box.size} colors`);
  if (box.size > 12) fail('the clear box looks busy — check nothing is drawn where the monster stands');
  else pass('clear box looks like plain wall and floor');

  // The floor line should be a visible change from the row above it.
  let changed = 0;
  for (let x = 0; x < img.width; x++) {
    const a = at(img, x, ROOM.floorY - 1);
    const b = at(img, x, ROOM.floorY);
    if (img.rgba[a] !== img.rgba[b] || img.rgba[a + 1] !== img.rgba[b + 1] || img.rgba[a + 2] !== img.rgba[b + 2]) changed++;
  }
  if (changed < img.width / 4) fail(`y ${ROOM.floorY} does not read as a floor line (${changed}/${img.width} px differ from the row above)`);
  else pass(`floor line at y ${ROOM.floorY} (${changed}/${img.width} px differ from above)`);
}

function checkIcon() {
  const file = 'assets/icon.png';
  console.log(`\n${file}`);
  if (!existsSync(file)) { fail('not found'); return; }
  const img = readPng(readFileSync(file));
  if (img.width !== 32 || img.height !== 32) fail(`is ${img.width}x${img.height}, must be 32x32`);
  else pass('32x32 — run `npm run icons` to rebuild assets/icons/');
}

console.log('Checking art against ART_BRIEF.md');
STARTERS.forEach(checkSheet);
checkRoom();
checkIcon();
console.log(failures ? `\n${failures} problem${failures === 1 ? '' : 's'} found.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
