import * as THREE from 'three';

/**
 * V0 (performance): the 5-octave value-noise FBM the liquid shaders used to compute per pixel
 * (≈20 hash + mix per call, several calls per pixel over the whole background), baked once into a
 * small tileable texture. Same algorithm, same look; the GPU does one texture fetch instead.
 *
 * The texture covers NOISE_PERIOD units of the shader's noise space and tiles seamlessly
 * (every octave's lattice wraps at the period). Values are stored divided by the octave sum.
 */
export const NOISE_PERIOD = 8;
const SIZE = 256;
const OCTAVES = 5;
export const NOISE_SUM = 1 - Math.pow(0.5, OCTAVES); // 0.5 + 0.25 + … = 0.96875

let shared: THREE.DataTexture | null = null;

function hash(ix: number, iy: number) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number, period: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const w = (n: number) => ((n % period) + period) % period;
  const a = hash(w(ix), w(iy));
  const b = hash(w(ix + 1), w(iy));
  const c = hash(w(ix), w(iy + 1));
  const d = hash(w(ix + 1), w(iy + 1));
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** The shared tileable FBM texture (built on first use, ~256×256 single channel). */
export function fbmTexture() {
  if (shared) return shared;
  const data = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      let px = (x / SIZE) * NOISE_PERIOD;
      let py = (y / SIZE) * NOISE_PERIOD;
      let v = 0;
      let amp = 0.5;
      let period = NOISE_PERIOD;
      for (let o = 0; o < OCTAVES; o++) {
        v += amp * valueNoise(px, py, period);
        px *= 2;
        py *= 2;
        period *= 2;
        amp *= 0.5;
      }
      data[y * SIZE + x] = Math.round((v / NOISE_SUM) * 255);
    }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  shared = tex;
  return tex;
}

/** GLSL: fbm(p) from the texture (drop-in for the procedural one; needs `uniform sampler2D uNoise`). */
export const FBM_TEXTURE_GLSL = /* glsl */ `
  uniform sampler2D uNoise;
  float fbm(vec2 p) { return texture2D(uNoise, p * ${(1 / NOISE_PERIOD).toFixed(6)}).r * ${NOISE_SUM.toFixed(6)}; }
`;
