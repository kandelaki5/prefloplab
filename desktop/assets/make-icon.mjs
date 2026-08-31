/**
 * Generates assets/icon.png — four tiled tables on a dark felt square.
 * Written by hand (zlib + CRC) so the repo carries no binary blob that nobody
 * can diff, and the icon can be tweaked by editing numbers here.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 256;
const BG = [13, 19, 17, 255];
const FELT = [22, 46, 36, 255];
const TABLE = [53, 196, 139, 255];
const TABLE_DIM = [31, 122, 87, 255];

const pixels = Buffer.alloc(SIZE * SIZE * 4);

function set(x, y, color) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const offset = (y * SIZE + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function roundedRect(x0, y0, w, h, radius, color) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const dx = Math.max(x0 + radius - x, x - (x0 + w - 1 - radius), 0);
      const dy = Math.max(y0 + radius - y, y - (y0 + h - 1 - radius), 0);
      if (dx * dx + dy * dy <= radius * radius) set(x, y, color);
    }
  }
}

roundedRect(0, 0, SIZE, SIZE, 52, BG);
roundedRect(16, 16, SIZE - 32, SIZE - 32, 40, FELT);

const margin = 40;
const gap = 14;
const cell = (SIZE - margin * 2 - gap) / 2;
for (let row = 0; row < 2; row += 1) {
  for (let col = 0; col < 2; col += 1) {
    const color = row === col ? TABLE : TABLE_DIM;
    roundedRect(margin + col * (cell + gap), margin + row * (cell + gap), cell, cell * 0.75, 12, color);
  }
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // truecolour with alpha
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), 'icon.png');
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
