// Builds the app icons from the 32 x 32 pixel art master at assets/icon.png.
// Every size is a whole-number nearest-neighbor scale, padded with the
// icon's own background color, so the pixels stay crisp.
//
//   node scripts/make-icons.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

const SOURCE = 'assets/icon.png';
const OUT_DIR = 'assets/icons';

// [file, canvas size, scale]. The art is centered, the rest is background.
const SIZES = [
  ['icon-180.png', 180, 5],           // iPhone home screen
  ['icon-192.png', 192, 6],           // Android, install prompts
  ['icon-512.png', 512, 16],          // large icon
  ['icon-maskable-512.png', 512, 12], // circle-cropped launchers need the extra margin
];

// ---- Minimal PNG reading: 8-bit RGB or RGBA, not interlaced ----

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
        throw new Error('icon.png must be an 8-bit RGB or RGBA PNG without interlacing.');
      }
    }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 3);
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
      const add = [0, a, b, (a + b) >> 1, paeth()][filter];
      line[i] = (line[i] + add) & 0xff;
    }
    for (let x = 0; x < width; x++) line.copy(out, (y * width + x) * 3, x * bpp, x * bpp + 3);
    prev = line;
  }
  return { width, height, rgb: out };
}

// ---- Minimal PNG writing: 8-bit RGB ----

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function writePng(size, rgb) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- Build ----

const icon = readPng(readFileSync(SOURCE));
if (icon.width !== 32 || icon.height !== 32) throw new Error(`${SOURCE} must be 32 x 32, got ${icon.width} x ${icon.height}.`);
const background = icon.rgb.subarray(0, 3); // top-left pixel

mkdirSync(OUT_DIR, { recursive: true });
for (const [file, size, scale] of SIZES) {
  const rgb = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) background.copy(rgb, i * 3);
  const offset = (size - 32 * scale) / 2;
  for (let y = 0; y < 32 * scale; y++) {
    for (let x = 0; x < 32 * scale; x++) {
      const src = (Math.floor(y / scale) * 32 + Math.floor(x / scale)) * 3;
      icon.rgb.copy(rgb, ((offset + y) * size + offset + x) * 3, src, src + 3);
    }
  }
  writeFileSync(`${OUT_DIR}/${file}`, writePng(size, rgb));
  console.log(`${OUT_DIR}/${file}  ${size} x ${size}  (art ${32 * scale} px, ${offset} px border)`);
}
