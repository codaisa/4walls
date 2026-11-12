import * as THREE from 'three';
import { graphicsPreset, useSettings } from '../store/useSettings';

/**
 * V5: a "hand-painted" touch on every lit material, at almost no cost.
 *
 * - Rim light: surfaces facing away from the camera catch a soft edge glow of their own color,
 *   so heroes, enemies and blocks separate from the floor (and read better on a phone).
 * - Color variation: static scenery gets a low-frequency light/dark variation by world position
 *   (computed per vertex), so repeated tiles, blocks and walls stop looking like the same plastic.
 *   Skinned characters are left alone (the pattern would swim as they move).
 *
 * The built-in standard / physical shaders are patched once, before the game compiles anything,
 * so no material recompiles mid-game. Medium and high only; low keeps the plain shaders.
 */
let applied = false;

const VERT_HEAD = /* glsl */ `
varying float vStyleVar;
float stHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float stNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(stHash(i), stHash(i + vec2(1.0, 0.0)), u.x), mix(stHash(i + vec2(0.0, 1.0)), stHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

const VERT_BODY = /* glsl */ `
#ifndef USE_SKINNING
  vec4 stW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    stW = instanceMatrix * stW;
  #endif
  stW = modelMatrix * stW;
  float stN = stNoise(stW.xz * 0.42) * 0.65 + stNoise(stW.xz * 1.7 + 13.0) * 0.35;
  vStyleVar = 0.88 + stN * 0.22;
#else
  vStyleVar = 1.0;
#endif
`;

const FRAG_RIM = /* glsl */ `
  {
    float stRim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
    outgoingLight += (diffuseColor.rgb * 0.32 + vec3(0.035)) * stRim;
  }
`;

export function applyMaterialStyle() {
  if (applied) return;
  applied = true;
  if (graphicsPreset(useSettings.getState().quality).tier < 1) return;
  for (const id of ['standard', 'physical'] as const) {
    const lib = THREE.ShaderLib[id];
    lib.vertexShader = lib.vertexShader
      .replace('varying vec3 vViewPosition;', `varying vec3 vViewPosition;\n${VERT_HEAD}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${VERT_BODY}`);
    lib.fragmentShader = lib.fragmentShader
      .replace('varying vec3 vViewPosition;', 'varying vec3 vViewPosition;\nvarying float vStyleVar;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vStyleVar;')
      .replace('#include <opaque_fragment>', `${FRAG_RIM}\n  #include <opaque_fragment>`);
  }
}
