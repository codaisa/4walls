import * as THREE from 'three';

/**
 * V1: the VFX sprite atlas, painted in code at load time (no downloaded files, no licences to
 * track). One 8×8 grid of white-on-transparent sprites: the color comes from each particle, the
 * grey levels give the shading. 1024 px (128 per cell); 512 px on "low".
 *
 * Flipbooks are consecutive cells (smoke 4, burst 8, flame 4).
 */
export const GRID = 8;

export const SPRITES = {
  glow: 0,
  spark: 1,
  star: 2,
  ring: 3,
  shockRing: 4,
  ember: 5,
  dust: 6,
  shard: 7,
  smoke: 8, // ×4
  burst: 12, // ×8
  flame: 20, // ×4
  leaf: 24,
  petal: 25,
  snow: 26,
  drop: 27,
  heart: 28,
  coin: 29,
  rune: 30,
  crack: 31,
  scorch: 32,
  swirl: 33,
  slash: 34,
  sparkle: 35,
  bubble: 36,
  firefly: 37,
  mist: 38,
  bolt: 39,
} as const;

export type SpriteName = keyof typeof SPRITES;
export const FLIPBOOK: Partial<Record<SpriteName, number>> = { smoke: 4, burst: 8, flame: 4 };

// ── tiny deterministic noise (so the atlas is identical on every device) ──
function hash(x: number, y: number, s: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number, s: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x: number, y: number, s: number) {
  let v = 0, amp = 0.5;
  for (let o = 0; o < 4; o++) {
    v += amp * vnoise(x, y, s + o * 17);
    x *= 2; y *= 2; amp *= 0.5;
  }
  return v / 0.9375;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

type Px = (u: number, v: number) => [number, number]; // (-1..1 coords) → [lum, alpha]

/** Paints one cell pixel by pixel (u, v in -1..1, v up). */
function paintField(ctx: CanvasRenderingContext2D, cell: number, size: number, f: Px) {
  const pad = Math.round(size * 0.04);
  const inner = size - pad * 2;
  const img = ctx.createImageData(inner, inner);
  for (let y = 0; y < inner; y++)
    for (let x = 0; x < inner; x++) {
      const u = ((x + 0.5) / inner) * 2 - 1;
      const v = 1 - ((y + 0.5) / inner) * 2;
      const [l, a] = f(u, v);
      const o = (y * inner + x) * 4;
      const L = Math.round(Math.min(1, Math.max(0, l)) * 255);
      img.data[o] = img.data[o + 1] = img.data[o + 2] = L;
      img.data[o + 3] = Math.round(Math.min(1, Math.max(0, a)) * 255);
    }
  const cx = (cell % GRID) * size + pad;
  const cy = Math.floor(cell / GRID) * size + pad;
  ctx.putImageData(img, cx, cy);
}

/** Paints one cell with canvas paths (white shapes); `draw` works in -1..1 with y up. */
function paintPath(ctx: CanvasRenderingContext2D, cell: number, size: number, draw: (c: CanvasRenderingContext2D) => void) {
  const pad = size * 0.04;
  const half = (size - pad * 2) / 2;
  ctx.save();
  ctx.translate((cell % GRID) * size + size / 2, Math.floor(cell / GRID) * size + size / 2);
  ctx.scale(half, -half);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  draw(ctx);
  ctx.restore();
}

function build(size: number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size * GRID;
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
  const S = SPRITES;
  const r = (u: number, v: number) => Math.hypot(u, v);

  paintField(ctx, S.glow, size, (u, v) => [1, Math.pow(Math.max(0, 1 - r(u, v)), 2.2)]);
  // Spark: a hot needle, long along v (stretched further by speed in the shader).
  paintField(ctx, S.spark, size, (u, v) => {
    const d = Math.hypot(u * 3.2, v * 0.95);
    return [1, Math.pow(Math.max(0, 1 - d), 1.6)];
  });
  paintField(ctx, S.star, size, (u, v) => {
    const a = Math.atan2(v, u);
    const d = r(u, v);
    const arm = Math.pow(Math.abs(Math.cos(a * 2)), 18) * 0.85 + 0.15;
    const core = Math.max(0, 1 - d / 0.22);
    return [1, Math.min(1, Math.max(0, 1 - d / arm) * 1.4 + core)];
  });
  paintField(ctx, S.ring, size, (u, v) => [1, Math.exp(-Math.pow((r(u, v) - 0.82) * 14, 2))]);
  paintField(ctx, S.shockRing, size, (u, v) => {
    const d = r(u, v);
    const n = fbm(u * 3 + 5, v * 3, 3);
    const ring = Math.exp(-Math.pow((d - 0.78) * 7, 2)) * (0.7 + 0.5 * n);
    return [0.8 + 0.2 * smooth(0.5, 0.85, d), ring + 0.15 * smooth(0.9, 0.2, d) * n];
  });
  paintField(ctx, S.ember, size, (u, v) => {
    const d = r(u, v);
    return [1, Math.max(0, 1 - d / 0.3) + 0.35 * Math.pow(Math.max(0, 1 - d), 3)];
  });
  paintField(ctx, S.dust, size, (u, v) => {
    const n = fbm(u * 2.2 + 3, v * 2.2, 9);
    const m = smooth(1, 0.35, r(u, v) + (n - 0.5) * 0.6);
    return [0.75 + 0.35 * n + 0.15 * v, m * 0.9];
  });
  paintPath(ctx, S.shard, size, (c) => {
    c.beginPath();
    c.moveTo(-0.7, -0.55);
    c.lineTo(0.15, 0.85);
    c.lineTo(0.8, -0.2);
    c.lineTo(0.1, -0.75);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.beginPath();
    c.moveTo(0.15, 0.85);
    c.lineTo(0.8, -0.2);
    c.lineTo(0.1, -0.75);
    c.closePath();
    c.fill();
  });
  // Smoke flipbook: a billowing puff that thins out and breaks up.
  for (let f = 0; f < 4; f++)
    paintField(ctx, S.smoke + f, size, (u, v) => {
      const k = f / 3;
      const n = fbm(u * (2 + k) + f * 0.7, v * (2 + k) - f * 0.5, 21);
      const n2 = fbm(u * 5, v * 5, 33);
      const m = smooth(0.95, 0.3 - k * 0.1, r(u, v) * (0.92 + k * 0.1) + (n - 0.5) * (0.6 + k * 0.5));
      const holes = smooth(0.25 + k * 0.45, 0.05 + k * 0.4, n2 * (1 - k * 0.2));
      const lum = 0.55 + 0.45 * n + 0.25 * v;
      return [lum, m * (1 - holes * k * 0.9)];
    });
  // Burst flipbook (cartoon explosion): a solid hot ball → ragged rolling cloud → hollow wisps.
  for (let f = 0; f < 8; f++)
    paintField(ctx, S.burst + f, size, (u, v) => {
      const k = f / 7;
      const d = r(u, v);
      const a = Math.atan2(v, u);
      const n = fbm(Math.cos(a) * 1.8 + 4, Math.sin(a) * 1.8 + k * 1.3, 41);
      const n2 = fbm(u * 4 + k * 2, v * 4 - k * 3, 57);
      const edge = 0.74 + 0.16 * k + (n - 0.5) * (0.3 + 0.3 * k);
      const body = smooth(edge, edge - 0.16, d);
      // It hollows out from the middle as it burns away.
      const hr = smooth(0.3, 1, k) * 0.75 * edge;
      const hole = k > 0.3 ? smooth(hr + 0.12, hr - 0.06, d + (n2 - 0.5) * 0.45) : 0;
      const breakup = smooth(0.55, 0.78, n2 + k * 0.25) * smooth(0.55, 1, k);
      const alpha = body * (1 - hole * 0.92) * (1 - breakup);
      // Bright core, darker billows at the rim and as it ages.
      const lum = (1 - smooth(0, edge, d) * 0.55) * (1 - k * 0.4) * (0.72 + 0.38 * n2);
      return [lum, alpha];
    });
  // Flame licks: a teardrop (round base, pointed tip) that flickers between frames.
  for (let f = 0; f < 4; f++)
    paintField(ctx, S.flame + f, size, (u, v) => {
      const t = (v + 1) / 2;
      const n = fbm(u * 2.5 + f * 1.9, v * 2 - f * 1.3, 71);
      const w = 0.56 * Math.pow(1 - t, 0.85) * Math.sqrt(smooth(0, 0.28, t)) + (n - 0.5) * 0.18 * t;
      const x = u + Math.sin(t * 4 + f * 1.7) * 0.1 * t;
      const m = smooth(w, w - 0.14, Math.abs(x)) * smooth(0.02, 0.08, t);
      const lum = 0.55 + 0.45 * smooth(w, 0, Math.abs(x)) * smooth(0.9, 0.1, t);
      return [lum, m];
    });
  paintPath(ctx, S.leaf, size, (c) => {
    c.beginPath();
    c.moveTo(0, -0.9);
    c.bezierCurveTo(0.75, -0.4, 0.6, 0.55, 0, 0.9);
    c.bezierCurveTo(-0.6, 0.55, -0.75, -0.4, 0, -0.9);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    c.lineWidth = 0.07;
    c.beginPath();
    c.moveTo(0, -0.9);
    c.lineTo(0, 0.75);
    c.stroke();
  });
  paintField(ctx, S.petal, size, (u, v) => {
    const d = Math.hypot(u * 1.4, v);
    return [0.85 + 0.15 * v, smooth(0.8, 0.6, d)];
  });
  paintPath(ctx, S.snow, size, (c) => {
    c.lineWidth = 0.13;
    c.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a) * 0.85, Math.sin(a) * 0.85);
      c.moveTo(Math.cos(a) * 0.5, Math.sin(a) * 0.5);
      c.lineTo(Math.cos(a + 0.5) * 0.7, Math.sin(a + 0.5) * 0.7);
      c.moveTo(Math.cos(a) * 0.5, Math.sin(a) * 0.5);
      c.lineTo(Math.cos(a - 0.5) * 0.7, Math.sin(a - 0.5) * 0.7);
      c.stroke();
    }
  });
  paintField(ctx, S.drop, size, (u, v) => {
    const w = 0.55 * Math.sqrt(Math.max(0, (1 - v) / 2)) * smooth(-1, -0.4, -v * 0 - 1 + (v + 1));
    const m = smooth(w, w - 0.12, Math.abs(u)) * smooth(-0.95, -0.8, v) * smooth(0.95, 0.85, v);
    const hl = smooth(0.25, 0, Math.hypot(u + 0.18, v + 0.35));
    return [0.75 + 0.25 * hl, m];
  });
  paintPath(ctx, S.heart, size, (c) => {
    c.beginPath();
    c.moveTo(0, -0.8);
    c.bezierCurveTo(-1.1, 0, -0.55, 0.95, 0, 0.42);
    c.bezierCurveTo(0.55, 0.95, 1.1, 0, 0, -0.8);
    c.fill();
  });
  paintField(ctx, S.coin, size, (u, v) => {
    const d = Math.hypot(u * 1.0, v);
    const disk = smooth(0.82, 0.75, d);
    const rim = smooth(0.62, 0.56, d);
    const shine = smooth(0.35, 0, Math.hypot(u + 0.3, v - 0.3));
    return [0.7 + 0.3 * rim * 0 + 0.25 * (1 - rim) + 0.3 * shine, disk];
  });
  paintPath(ctx, S.rune, size, (c) => {
    c.lineWidth = 0.08;
    c.beginPath();
    c.arc(0, 0, 0.85, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(0, 0, 0.62, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.beginPath();
      c.moveTo(Math.cos(a) * 0.62, Math.sin(a) * 0.62);
      c.lineTo(Math.cos(a + 0.2) * 0.85, Math.sin(a + 0.2) * 0.85);
      c.stroke();
    }
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      c.lineTo(Math.cos(a) * 0.5, Math.sin(a) * 0.5);
    }
    c.closePath();
    c.stroke();
  });
  // Ground crack: dark branching lines (used as an alpha decal).
  paintPath(ctx, S.crack, size, (c) => {
    c.lineCap = 'round';
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number, seed: number) => {
      let px = x, py = y;
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(px, py);
      const steps = 4;
      for (let i = 0; i < steps; i++) {
        a += (hash(i, depth, seed) - 0.5) * 0.9;
        px += Math.cos(a) * (len / steps);
        py += Math.sin(a) * (len / steps);
        c.lineTo(px, py);
      }
      c.stroke();
      if (depth < 2) branch(px * 0.6 + x * 0.4, py * 0.6 + y * 0.4, a + (hash(depth, seed, 3) - 0.5) * 2, len * 0.5, w * 0.6, depth + 1, seed + 7);
    };
    for (let i = 0; i < 6; i++) branch(0, 0, (i / 6) * Math.PI * 2 + 0.3, 0.85, 0.09, 0, i * 13);
  });
  paintField(ctx, S.scorch, size, (u, v) => {
    const n = fbm(u * 2.5 + 7, v * 2.5, 91);
    const d = r(u, v) + (n - 0.5) * 0.55;
    return [0.15 + 0.25 * n, smooth(0.95, 0.4, d) * (0.75 + 0.25 * smooth(0.7, 0, d))];
  });
  paintField(ctx, S.swirl, size, (u, v) => {
    const d = r(u, v);
    const a = Math.atan2(v, u);
    const s = Math.sin(a * 2 + d * 9);
    return [1, smooth(0.2, 0.9, s) * smooth(1, 0.7, d) * smooth(0.05, 0.3, d)];
  });
  paintField(ctx, S.slash, size, (u, v) => {
    const d = Math.hypot(u, v + 0.6);
    const band = Math.exp(-Math.pow((d - 1.05) * 9, 2));
    const a = Math.atan2(v + 0.6, u);
    const taper = Math.pow(Math.max(0, Math.sin(Math.min(Math.PI, Math.max(0, (a - 0.35) * 1.3)))), 0.8);
    return [1, band * taper];
  });
  paintField(ctx, S.sparkle, size, (u, v) => {
    const d = r(u, v);
    const cross = Math.max(Math.exp(-Math.abs(u) * 14) * Math.max(0, 1 - Math.abs(v)), Math.exp(-Math.abs(v) * 14) * Math.max(0, 1 - Math.abs(u)));
    return [1, Math.min(1, cross + Math.pow(Math.max(0, 1 - d / 0.45), 2))];
  });
  paintField(ctx, S.bubble, size, (u, v) => {
    const d = r(u, v);
    const rim = smooth(0.6, 0.85, d) * smooth(0.92, 0.85, d);
    const hl = smooth(0.22, 0, Math.hypot(u + 0.32, v - 0.32));
    return [1, Math.min(1, rim * 0.9 + hl + 0.12 * smooth(0.85, 0, d))];
  });
  paintField(ctx, S.firefly, size, (u, v) => {
    const d = r(u, v);
    return [1, Math.min(1, Math.max(0, 1 - d / 0.16) + 0.5 * Math.pow(Math.max(0, 1 - d), 4))];
  });
  paintField(ctx, S.mist, size, (u, v) => {
    const n = fbm(u * 1.4 + 2, v * 1.4, 101);
    return [0.9 + 0.1 * n, smooth(1, 0.1, r(u, v) + (n - 0.5) * 0.5) * 0.85];
  });
  paintPath(ctx, S.bolt, size, (c) => {
    c.beginPath();
    c.moveTo(0.15, 0.95);
    c.lineTo(-0.45, 0.05);
    c.lineTo(-0.02, 0.05);
    c.lineTo(-0.22, -0.95);
    c.lineTo(0.48, 0.18);
    c.lineTo(0.05, 0.18);
    c.closePath();
    c.fill();
  });
  return canvas;
}

let cache: { size: number; tex: THREE.CanvasTexture } | null = null;

/** The shared atlas texture (built once; `small` paints 64 px cells for low-end phones). */
export function vfxAtlas(small = false) {
  const size = small ? 64 : 128;
  if (cache && cache.size >= size) return cache.tex;
  const tex = new THREE.CanvasTexture(build(size));
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 1;
  cache = { size, tex };
  return tex;
}
