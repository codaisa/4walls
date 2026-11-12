import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { FBM_TEXTURE_GLSL, fbmTexture } from './noiseTexture';

const vertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const common = /* glsl */ `
  uniform float uTime;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec2 uHalf;   // arena half extents (shoreline); uShore = 0 disables it
  uniform float uShore;
  varying vec3 vWorld;
  float shoreDist(vec2 p) {
    if (uShore < 0.5) return 99.0;
    return length(max(abs(p) - uHalf, 0.0));
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  ${FBM_TEXTURE_GLSL}
  float vfxBubble(vec2 p, float t) {
    vec2 c = floor(p); vec2 f = fract(p) - 0.5;
    float h = hash(c);
    float life = fract(t * (0.4 + h * 0.6) + h * 7.0);
    float r = 0.08 + 0.3 * life;
    float ring = smoothstep(r, r - 0.06, length(f + (vec2(hash(c + 3.1), hash(c + 7.7)) - 0.5) * 0.4));
    return ring * step(0.72, h) * (1.0 - life);
  }
  vec4 fogged(vec3 col) {
    float depth = gl_FragCoord.z / gl_FragCoord.w;
    return vec4(mix(col, uFogColor, smoothstep(uFogNear, uFogFar, depth)), 1.0);
  }
`;

const lavaFragment = /* glsl */ `
  ${common}
  void main() {
    vec2 p = vWorld.xz * 0.22;
    float t = uTime * 0.08;
    vec2 q = vec2(fbm(p + vec2(t, -t)), fbm(p + vec2(-t * 0.7, t * 1.3) + 4.0));
    float n = fbm(p * 1.6 + q * 2.2 + t);
    // Crust: dark cooled rock floating over glowing magma.
    float crust = smoothstep(0.3, 0.44, n);
    vec3 magma = mix(vec3(0.75, 0.11, 0.02), vec3(1.35, 0.45, 0.07), smoothstep(0.25, 0.55, q.x));
    vec3 col = mix(magma, vec3(0.07, 0.03, 0.03), crust);
    float vein = 1.0 - abs(crust - 0.5) * 2.0;
    col += vec3(1.2, 0.3, 0.04) * pow(max(vein, 0.0), 6.0) * 0.5;
    // Bubbling hot spots that swell and pop.
    float cellT = uTime * 0.6;
    float bub = vfxBubble(vWorld.xz * 0.9, cellT);
    col += vec3(1.6, 0.6, 0.1) * bub * (1.0 - crust);
    // Magma churns hotter right against the arena walls.
    float shore = shoreDist(vWorld.xz);
    col += vec3(0.9, 0.22, 0.03) * smoothstep(2.5, 0.0, shore) * (0.6 + 0.4 * sin(uTime * 2.0 + n * 8.0)) * (1.0 - crust * 0.7);
    gl_FragColor = fogged(col);
  }
`;

const waterFragment = /* glsl */ `
  ${common}
  float waveH(vec2 p, float t) {
    return fbm(p * 0.55 + vec2(t * 0.05, t * 0.035)) * 0.6 + fbm(p * 1.6 - vec2(t * 0.09, -t * 0.07)) * 0.4;
  }
  void main() {
    vec2 p = vWorld.xz;
    float t = uTime;
    // Wave normal from the height field.
    float e = 0.12;
    float h0 = waveH(p, t);
    vec3 N = normalize(vec3((h0 - waveH(p + vec2(e, 0.0), t)) * 2.6, 1.0, (h0 - waveH(p + vec2(0.0, e), t)) * 2.6));
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float shore = shoreDist(p);
    vec3 deep = vec3(0.015, 0.08, 0.11);
    vec3 shallow = vec3(0.05, 0.3, 0.29);
    vec3 col = mix(shallow, deep, smoothstep(0.0, 7.0, shore));
    // Sky reflection + sun glints.
    vec3 sky = vec3(0.32, 0.55, 0.62);
    col = mix(col, sky, clamp(fres * 0.6, 0.0, 1.0));
    vec3 L = normalize(vec3(-0.4, 0.8, 0.45));
    float spec = pow(max(dot(N, normalize(L + V)), 0.0), 160.0);
    col += vec3(1.8, 1.7, 1.4) * spec;
    // Caustic shimmer.
    float m = fbm(p * 0.6 - vec2(t * 0.1, -t * 0.12) + h0 * 2.0);
    col += vec3(0.25, 0.6, 0.5) * pow(smoothstep(0.55, 0.85, m), 3.0) * 0.45;
    // Foam lapping at the arena's edge.
    float fn = fbm(p * 1.8 + vec2(t * 0.3, -t * 0.2));
    float band = smoothstep(0.9, 0.0, shore + (fn - 0.5) * 0.6);
    // Thin lines of foam rolling in toward the shore, broken up by noise.
    float wave = 0.5 + 0.5 * sin(shore * 9.0 - t * 2.2 + fn * 5.0);
    float foam = band * smoothstep(0.62, 0.9, fn * 0.5 + wave * 0.6);
    col = mix(col, vec3(0.8, 0.94, 0.93), foam * 0.65);
    // Drifting lily pads.
    float pads = smoothstep(0.7, 0.72, fbm(p * 0.5 + 7.0 + vec2(t * 0.01, 0.0)));
    col = mix(col, vec3(0.12, 0.3, 0.1), pads * 0.85);
    gl_FragColor = fogged(col);
  }
`;

/** Animated liquid that surrounds an arena: magma (Caldeira) or an enchanted pond (Floresta). */
export function Lava({ fogColor, variant = 'lava', fog = [26, 70], half }: { fogColor: string; variant?: 'lava' | 'water'; fog?: [number, number]; half?: [number, number] }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: variant === 'lava' ? lavaFragment : waterFragment,
        uniforms: {
          uTime: { value: 0 },
          uFogColor: { value: new THREE.Color(fogColor) },
          uFogNear: { value: fog[0] },
          uFogFar: { value: fog[1] },
          uHalf: { value: new THREE.Vector2(half?.[0] ?? 0, half?.[1] ?? 0) },
          uShore: { value: half ? 1 : 0 },
          uNoise: { value: fbmTexture() },
        },
        toneMapped: false,
      }),
    [fogColor, variant, fog, half?.[0], half?.[1]],
  );
  const mesh = useRef<THREE.Mesh>(null!);
  useFrame(({ camera }, dt) => {
    mat.uniforms.uTime.value += dt;
    // The endless Adventure travels far from the origin: the sea follows the camera (its pattern is
    // computed in world space, so it doesn't slide).
    mesh.current.position.x = Math.round(camera.position.x);
    mesh.current.position.z = Math.round(camera.position.z - 10);
  });
  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} position={[0, -0.55, 0]} material={mat}>
      <planeGeometry args={[160, 160, 1, 1]} />
    </mesh>
  );
}
