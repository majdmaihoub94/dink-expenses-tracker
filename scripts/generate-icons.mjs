/**
 * Generates the DINX PWA icons as PNGs with no image dependencies —
 * a plum gradient tile with a white "D", rasterised by hand and written
 * through Node's built-in zlib.
 *
 *   node scripts/generate-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

// ---------------------------------------------------------------------------
// Minimal PNG writer (truecolour + alpha, 8-bit).
// ---------------------------------------------------------------------------
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  // Each scanline is prefixed with its filter byte (0 = none).
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Shape helpers, all in a normalised 0–1 space so one routine covers all sizes.
// ---------------------------------------------------------------------------
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Signed-distance coverage for a rounded rectangle, anti-aliased. */
function roundedRectCoverage(x, y, size, inset, radius) {
  const min = inset;
  const max = size - inset;
  const cx = Math.min(Math.max(x, min + radius), max - radius);
  const cy = Math.min(Math.max(y, min + radius), max - radius);
  const d = Math.hypot(x - cx, y - cy) - radius;
  return clamp01(0.5 - d);
}

/** The "D": a vertical stem plus the right half of an elliptical ring. */
function glyphCoverage(x, y, size) {
  const s = size / 512;
  const stemX0 = 168 * s;
  const stemX1 = 214 * s;
  const top = 128 * s;
  const bottom = 384 * s;

  // Stem.
  let stem = 0;
  {
    const dx = Math.max(stemX0 - x, x - stemX1, 0);
    const dy = Math.max(top - y, y - bottom, 0);
    stem = clamp01(1 - Math.hypot(dx, dy));
  }

  // Bowl — the right half of an elliptical ring. Its centre sits slightly
  // left of the stem's right edge so the two overlap and leave no seam.
  let bowl = 0;
  const cx = stemX1 - 8 * s;
  if (x >= cx) {
    const cy = (top + bottom) / 2;
    const outerRx = 156 * s;
    const outerRy = (bottom - top) / 2;
    const thickness = 46 * s;

    const outer = Math.hypot((x - cx) / outerRx, (y - cy) / outerRy);
    const inner = Math.hypot((x - cx) / (outerRx - thickness), (y - cy) / (outerRy - thickness));

    // Feather both edges by roughly a pixel for smooth curves.
    const outerAA = clamp01((1 - outer) * outerRx + 0.5);
    const innerAA = clamp01((inner - 1) * (outerRx - thickness) + 0.5);
    bowl = Math.min(outerAA, innerAA);
  }

  // Union of the two strokes.
  return Math.max(stem, bowl);
}

function render(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  // Maskable icons must survive a circular crop, so the tile fills the canvas
  // and the glyph shrinks into the safe zone.
  const inset = maskable ? 0 : size * 0.055;
  const radius = maskable ? 0 : size * 0.22;
  const glyphScale = maskable ? 0.78 : 1;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // Plum gradient, top-left #4A3364 → bottom-right #2C1E3E.
      const t = clamp01((x / size + y / size) / 2);
      const r = Math.round(lerp(0x4a, 0x2c, t));
      const g = Math.round(lerp(0x33, 0x1e, t));
      const b = Math.round(lerp(0x64, 0x3e, t));

      const tile = maskable ? 1 : roundedRectCoverage(x + 0.5, y + 0.5, size, inset, radius);

      // Map the pixel back into unscaled glyph space when shrinking.
      const gx = (x + 0.5 - size / 2) / glyphScale + size / 2;
      const gy = (y + 0.5 - size / 2) / glyphScale + size / 2;
      const glyph = glyphCoverage(gx, gy, size) * tile;

      rgba[i] = Math.round(lerp(r, 255, glyph));
      rgba[i + 1] = Math.round(lerp(g, 255, glyph));
      rgba[i + 2] = Math.round(lerp(b, 255, glyph));
      rgba[i + 3] = Math.round(tile * 255);
    }
  }

  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["maskable-512.png", 512, { maskable: true }],
  ["apple-touch-icon.png", 180, {}],
  ["badge-72.png", 72, {}],
];

for (const [name, size, options] of targets) {
  writeFileSync(join(OUT_DIR, name), render(size, options));
  console.log(`✓ icons/${name} (${size}×${size})`);
}
