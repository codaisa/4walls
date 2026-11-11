/** Shared GLSL for the procedural VFX (fire, smoke, decals). */

export const NOISE_GLSL = /* glsl */ `
  float vfxHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vfxNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(vfxHash(i), vfxHash(i + vec2(1, 0)), u.x), mix(vfxHash(i + vec2(0, 1)), vfxHash(i + vec2(1, 1)), u.x), u.y);
  }
  float vfxFbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vfxNoise(p); p = p * 2.07 + 13.1; a *= 0.5; }
    return v;
  }
`;

/**
 * Heat (0..1) → HDR color. kind: 0 = normal blast, 1 = lingering hellfire (redder), 2 = ice.
 * Values above 1 feed the bloom pass so the hottest parts glow.
 */
export const RAMP_GLSL = /* glsl */ `
  vec3 heatRamp(float h, float kind) {
    if (kind > 1.5) {
      vec3 c = mix(vec3(0.02, 0.16, 0.45), vec3(0.45, 1.5, 2.8), smoothstep(0.08, 0.55, h));
      return mix(c, vec3(3.2, 4.4, 5.0), smoothstep(0.6, 1.0, h));
    }
    if (kind > 0.5) h *= 0.88;
    vec3 c = mix(vec3(0.3, 0.015, 0.0), vec3(2.3, 0.42, 0.03), smoothstep(0.04, 0.42, h));
    c = mix(c, vec3(3.6, 1.9, 0.35), smoothstep(0.42, 0.72, h));
    return mix(c, vec3(5.0, 4.3, 2.8), smoothstep(0.8, 1.0, h));
  }
`;

/**
 * Vertex snippet: camera-facing quad around the instance center, kept upright but leaning
 * halfway toward the camera so flames still read tall from the high top-down camera.
 * Expects a PlaneGeometry(1, 1); `position.y` −0.5 is the flame's base.
 */
export const BILLBOARD_UPRIGHT_GLSL = /* glsl */ `
  vec3 billboardUpright(vec3 center, float sx, float sy) {
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 right = normalize(vec3(camRight.x, 0.0, camRight.z));
    vec3 up = normalize(mix(vec3(0.0, 1.0, 0.0), camUp, 0.5));
    return center + right * position.x * sx + up * (position.y + 0.5) * sy;
  }
`;
