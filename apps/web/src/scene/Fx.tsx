import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SLOT_COLORS } from '@4walls/shared';
import { useGame } from './context';
import { SoftPool } from './SoftParticles';
import { meteorRockPos } from './Hazards';

const dummy = new THREE.Object3D();
const col = new THREE.Color();
const tmpV = new THREE.Vector3();

interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  size: number;
  color: THREE.ColorRepresentation;
  intensity?: number;
  gravity?: number;
  drag?: number;
  grow?: number;
  bounce?: boolean;
}

/** Fixed-capacity particle pool rendered as a single instanced mesh (one draw call). */
class ParticlePool {
  n: number;
  head = 0;
  pos: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  size: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  grow: Float32Array;
  bounce: Uint8Array;
  color: Float32Array;
  rot: Float32Array;
  /** Sparks are drawn as streaks stretched along their velocity. */
  constructor(n: number, readonly stretch = false) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.size = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.bounce = new Uint8Array(n);
    this.color = new Float32Array(n * 3);
    this.rot = new Float32Array(n * 3);
  }
  spawn(p: ParticleSpec) {
    const i = this.head;
    this.head = (this.head + 1) % this.n;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([p.vx, p.vy, p.vz], i * 3);
    this.life[i] = this.maxLife[i] = p.life;
    this.size[i] = p.size;
    this.grav[i] = p.gravity ?? 0;
    this.drag[i] = p.drag ?? 0;
    this.grow[i] = p.grow ?? 0;
    this.bounce[i] = p.bounce ? 1 : 0;
    col.set(p.color).multiplyScalar(p.intensity ?? 1);
    this.color.set([col.r, col.g, col.b], i * 3);
    this.rot.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
  }
  update(dt: number, mesh: THREE.InstancedMesh) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }
      this.life[i] -= dt;
      const k = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const o = i * 3;
      this.vel[o + 1] -= this.grav[i] * dt;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[o] *= dr;
      this.vel[o + 1] *= dr;
      this.vel[o + 2] *= dr;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      if (this.bounce[i] && this.pos[o + 1] < 0.05) {
        this.pos[o + 1] = 0.05;
        this.vel[o + 1] *= -0.35;
        this.vel[o] *= 0.6;
        this.vel[o + 2] *= 0.6;
      }
      const s = this.size[i] * (1 + this.grow[i] * k) * (1 - Math.pow(k, 3));
      dummy.position.set(this.pos[o], this.pos[o + 1], this.pos[o + 2]);
      if (this.stretch) {
        const vx = this.vel[o], vy = this.vel[o + 1], vz = this.vel[o + 2];
        const speed = Math.hypot(vx, vy, vz);
        tmpV.set(this.pos[o] + vx, this.pos[o + 1] + vy, this.pos[o + 2] + vz);
        dummy.lookAt(tmpV);
        dummy.scale.set(Math.max(s * 0.55, 1e-4), Math.max(s * 0.55, 1e-4), Math.max(s * (1 + speed * 0.9), 1e-4));
      } else {
        this.rot[o] += dt * 3;
        dummy.rotation.set(this.rot[o], this.rot[o + 1], this.rot[o + 2]);
        dummy.scale.setScalar(Math.max(s, 1e-4));
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      col.setRGB(this.color[o], this.color[o + 1], this.color[o + 2]);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const LIGHTS = 4;

/**
 * Event-driven VFX: sparks (additive, bloom), smoke, debris chunks, flash lights and camera trauma.
 */
export function Fx() {
  const { controller, fx, ox, oz } = useGame();
  const sparks = useMemo(() => new ParticlePool(900, true), []);
  const solids = useMemo(() => new ParticlePool(500), []);
  const smoke = useMemo(() => new SoftPool(480, 'smoke'), []);
  const fireballs = useMemo(() => new SoftPool(360, 'fireball'), []);
  const decals = useMemo(() => new SoftPool(160, 'decal'), []);
  const shocks = useMemo(() => new SoftPool(40, 'shockwave'), []);
  const sparkMesh = useRef<THREE.InstancedMesh>(null!);
  const solidMesh = useRef<THREE.InstancedMesh>(null!);
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const lightLife = useRef<number[]>(Array(LIGHTS).fill(0));
  const nextLight = useRef(0);
  const trailAcc = useRef(0);

  useEffect(
    () =>
      controller.on((e, s) => {
        switch (e.type) {
          case 'explosion': {
            const ice = e.kind === 'ice';
            const kind = ice ? 2 : e.kind === 'fire' ? 1 : 0;
            const palette = ice ? ['#bff4ff', '#5cc8ff'] : e.kind === 'fire' ? ['#ff8a2a', '#ff3a10'] : ['#ffd27a', '#ff6a1f'];
            // Blast-center fireball rolling up into a mushroom of smoke.
            const cx = e.x + ox;
            const cz = e.y + oz;
            fireballs.spawn({ x: cx, y: 0.55, z: cz, vy: 1.6, life: 0.5, size: 1.0, grow: 1.9, color: '#fff', kind, drag: 2 });
            fireballs.spawn({ x: cx, y: 0.9, z: cz, vy: 2.4, life: 0.6, size: 0.7, grow: 2.0, color: '#fff', kind, drag: 2.5, delay: 0.05 });
            shocks.spawn({ x: cx, y: 0.05, z: cz, life: 0.45, size: 1.2, grow: 4.2, color: ice ? '#9fe6ff' : '#ff9a3a', alpha: 0.9 });
            // Glowing embers that bounce and skitter across the floor.
            for (let i = 0; i < 10; i++)
              sparks.spawn({
                x: cx, y: 0.4, z: cz, vx: rnd(-4, 4), vy: rnd(3, 6), vz: rnd(-4, 4),
                life: rnd(0.8, 1.4), size: rnd(0.04, 0.07), color: palette[0], intensity: 3, gravity: 14, drag: 0.6, bounce: true,
              });
            for (const c of e.cells) {
              const wx = c.x + ox;
              const wz = c.y + oz;
              const dist = Math.abs(c.x - e.x) + Math.abs(c.y - e.y);
              for (let i = 0; i < 4; i++)
                sparks.spawn({
                  x: wx + rnd(-0.3, 0.3), y: rnd(0.2, 0.6), z: wz + rnd(-0.3, 0.3),
                  vx: rnd(-2.5, 2.5), vy: rnd(2.5, 7), vz: rnd(-2.5, 2.5),
                  life: rnd(0.35, 0.9), size: rnd(0.035, 0.08), color: Math.random() < 0.5 ? palette[0] : palette[1],
                  intensity: 4, gravity: 9, drag: 1.5,
                });
              // A rolling fireball travels down each arm (staggered by distance from the bomb).
              fireballs.spawn({
                x: wx + rnd(-0.15, 0.15), y: rnd(0.35, 0.55), z: wz + rnd(-0.15, 0.15),
                vx: rnd(-0.3, 0.3), vy: rnd(0.8, 1.6), vz: rnd(-0.3, 0.3),
                life: rnd(0.32, 0.45), size: rnd(0.55, 0.75), grow: 1.6, color: '#fff', kind, drag: 2, delay: dist * 0.012,
              });
              // Smoke (or frost mist) lingering after the fire.
              for (let i = 0; i < 2; i++)
                smoke.spawn({
                  x: wx + rnd(-0.25, 0.25), y: rnd(0.5, 0.9), z: wz + rnd(-0.25, 0.25),
                  vx: rnd(-0.35, 0.35), vy: rnd(0.5, 1.1), vz: rnd(-0.35, 0.35),
                  life: rnd(1.3, 2.2), size: rnd(0.55, 0.8), grow: rnd(2, 2.8),
                  color: ice ? '#d8f4ff' : i === 0 ? '#3d3538' : '#5a5054', alpha: ice ? 0.45 : 0.7, drag: 0.8,
                  delay: 0.12 + dist * 0.02 + i * 0.08,
                });
              // Scorch (or frost) left on the floor.
              decals.spawn({
                x: wx + rnd(-0.08, 0.08), y: 0.02, z: wz + rnd(-0.08, 0.08), life: ice ? 2.5 : 4.5,
                size: rnd(0.95, 1.15), color: ice ? '#cdf3ff' : '#0b0706', alpha: ice ? 0.4 : 0.55,
              });
            }
            const L = lights.current[nextLight.current];
            if (L) {
              L.color.set(ice ? '#7fd6ff' : '#ff9a4a');
              L.position.set(e.x + ox, 1.4, e.y + oz);
              lightLife.current[nextLight.current] = 1;
            }
            nextLight.current = (nextLight.current + 1) % LIGHTS;
            fx.shake = Math.min(1, fx.shake + 0.28 + e.cells.length * 0.015);
            break;
          }
          case 'blockDestroyed':
            for (let i = 0; i < 3; i++)
              smoke.spawn({
                x: e.x + ox + rnd(-0.25, 0.25), y: rnd(0.25, 0.5), z: e.y + oz + rnd(-0.25, 0.25),
                vx: rnd(-0.6, 0.6), vy: rnd(0.3, 0.8), vz: rnd(-0.6, 0.6),
                life: rnd(0.9, 1.4), size: rnd(0.45, 0.65), grow: 2.2, color: '#a07a5c', alpha: 0.55, drag: 1.5, delay: i * 0.05,
              });
            for (let i = 0; i < 11; i++)
              solids.spawn({
                x: e.x + ox + rnd(-0.3, 0.3), y: rnd(0.2, 0.7), z: e.y + oz + rnd(-0.3, 0.3),
                vx: rnd(-3, 3), vy: rnd(2.5, 6), vz: rnd(-3, 3),
                life: rnd(0.7, 1.2), size: rnd(0.08, 0.17), color: Math.random() < 0.6 ? '#b8613a' : '#7a3c22',
                gravity: 16, drag: 0.4, bounce: true,
              });
            break;
          case 'powerupCollected':
          case 'powerupSpawned': {
            const collected = e.type === 'powerupCollected';
            for (let i = 0; i < (collected ? 22 : 8); i++) {
              const a = (i / (collected ? 22 : 8)) * Math.PI * 2;
              sparks.spawn({
                x: e.x + ox, y: 0.4, z: e.y + oz,
                vx: Math.cos(a) * rnd(1.5, 3), vy: rnd(1, 3.5), vz: Math.sin(a) * rnd(1.5, 3),
                life: rnd(0.4, 0.7), size: 0.06, color: collected ? '#fff3a0' : '#ffd23f', intensity: 3, drag: 3,
              });
            }
            break;
          }
          case 'shieldBroken': {
            const p = s.players.find((pp) => pp.id === e.playerId);
            if (!p) break;
            for (let i = 0; i < 26; i++)
              sparks.spawn({
                x: p.x + ox, y: 0.6, z: p.y + oz,
                vx: rnd(-3, 3), vy: rnd(0, 4), vz: rnd(-3, 3),
                life: rnd(0.3, 0.6), size: rnd(0.05, 0.1), color: '#7fd6ff', intensity: 3, drag: 2,
              });
            break;
          }
          case 'bridgeFell':
          case 'playerFell':
          case 'sankInLava': {
            // A gulp of lava: hot droplets and a puff of smoke.
            for (let i = 0; i < 22; i++)
              sparks.spawn({
                x: e.x + ox, y: 0.05, z: e.y + oz,
                vx: rnd(-1.8, 1.8), vy: rnd(2.5, 5), vz: rnd(-1.8, 1.8),
                life: rnd(0.4, 0.8), size: rnd(0.06, 0.12), color: i % 2 ? '#ff7a1a' : '#ffd23f', intensity: 3, drag: 0.8,
              });
            for (let i = 0; i < 6; i++)
              smoke.spawn({
                x: e.x + ox + rnd(-0.2, 0.2), y: 0.2, z: e.y + oz + rnd(-0.2, 0.2),
                vx: rnd(-0.4, 0.4), vy: rnd(0.6, 1.2), vz: rnd(-0.4, 0.4),
                life: rnd(0.8, 1.3), size: rnd(0.3, 0.5), grow: 2, color: '#3a2a26', alpha: 0.5, drag: 2,
              });
            break;
          }
          case 'geyserErupt': {
            for (let i = 0; i < 34; i++)
              sparks.spawn({
                x: e.x + ox + rnd(-0.15, 0.15), y: rnd(0.3, 2.2), z: e.y + oz + rnd(-0.15, 0.15),
                vx: rnd(-1.5, 1.5), vy: rnd(1, 4), vz: rnd(-1.5, 1.5),
                life: rnd(0.5, 1.0), size: rnd(0.07, 0.13), color: i % 3 ? '#ff6a1a' : '#ffe08a', intensity: 3, drag: 0.6,
              });
            fx.shake = Math.min(1, fx.shake + 0.15);
            break;
          }
          case 'leverPulled': {
            for (let i = 0; i < 24; i++)
              sparks.spawn({
                x: e.x + ox, y: 0.9, z: e.y + oz,
                vx: rnd(-2, 2), vy: rnd(1, 3.5), vz: rnd(-2, 2),
                life: rnd(0.4, 0.8), size: rnd(0.05, 0.09), color: '#ffe08a', intensity: 3, drag: 1.4,
              });
            fx.shake = Math.min(1, fx.shake + 0.35);
            break;
          }
          case 'brazierLit': {
            for (let i = 0; i < 30; i++)
              sparks.spawn({
                x: e.x + ox + rnd(-0.2, 0.2), y: rnd(0.6, 1.0), z: e.y + oz + rnd(-0.2, 0.2),
                vx: rnd(-0.8, 0.8), vy: rnd(2, 5), vz: rnd(-0.8, 0.8),
                life: rnd(0.5, 1.0), size: rnd(0.06, 0.12), color: i % 2 ? '#ffb030' : '#ff5a1f', intensity: 3, drag: 1.2,
              });
            break;
          }
          case 'missionDone': {
            for (let i = 0; i < 40; i++)
              sparks.spawn({
                x: e.x + ox + rnd(-0.3, 0.3), y: rnd(0.1, 0.4), z: e.y + oz + rnd(-0.3, 0.3),
                vx: rnd(-0.4, 0.4), vy: rnd(3, 7), vz: rnd(-0.4, 0.4),
                life: rnd(0.7, 1.2), size: rnd(0.06, 0.12), color: i % 2 ? '#ffd23f' : '#3fd0ff', intensity: 3, drag: 1,
              });
            fx.shake = Math.min(1, fx.shake + 0.2);
            break;
          }
          case 'chestOpened': {
            // Coins and sparkles burst out of the chest.
            for (let i = 0; i < (e.rare ? 44 : 26); i++)
              solids.spawn({
                x: e.x + ox, y: 0.55, z: e.y + oz,
                vx: rnd(-2.2, 2.2), vy: rnd(3.5, 6.5), vz: rnd(-2.2, 2.2),
                life: rnd(0.8, 1.4), size: rnd(0.05, 0.09), color: i % 3 ? '#ffd23f' : e.rare ? '#3fd0ff' : '#fff1b8',
                gravity: 12, drag: 0.5, bounce: true,
              });
            for (let i = 0; i < 18; i++)
              sparks.spawn({
                x: e.x + ox + rnd(-0.3, 0.3), y: rnd(0.4, 0.9), z: e.y + oz + rnd(-0.3, 0.3),
                vx: rnd(-0.4, 0.4), vy: rnd(1.5, 3.5), vz: rnd(-0.4, 0.4),
                life: rnd(0.5, 0.9), size: rnd(0.06, 0.1), color: '#ffe08a', intensity: 3, drag: 1.5,
              });
            break;
          }
          case 'secretFound': {
            // The cracked wall crumbles into rubble and dust.
            for (let i = 0; i < 30; i++)
              solids.spawn({
                x: e.x + ox, y: 0.6, z: e.y + oz,
                vx: rnd(-3, 3), vy: rnd(2, 5), vz: rnd(-3, 3),
                life: rnd(0.8, 1.3), size: rnd(0.07, 0.14), color: i % 4 ? '#5a4a52' : '#ff9a4c',
                gravity: 14, drag: 0.4, bounce: true,
              });
            for (let i = 0; i < 12; i++)
              smoke.spawn({
                x: e.x + ox + rnd(-0.3, 0.3), y: rnd(0.2, 0.8), z: e.y + oz + rnd(-0.3, 0.3),
                vx: rnd(-1, 1), vy: rnd(0.3, 0.9), vz: rnd(-1, 1),
                life: rnd(0.7, 1.2), size: rnd(0.35, 0.55), grow: 2, color: '#8a7a74', alpha: 0.5, drag: 2.5,
              });
            fx.shake = Math.min(1, fx.shake + 0.25);
            break;
          }
          case 'cageOpened': {
            for (let i = 0; i < 26; i++)
              solids.spawn({
                x: e.x + ox, y: 0.6, z: e.y + oz,
                vx: rnd(-3.5, 3.5), vy: rnd(2.5, 6), vz: rnd(-3.5, 3.5),
                life: rnd(0.8, 1.4), size: rnd(0.04, 0.09), color: i % 3 ? '#3b3a44' : '#f2b622',
                gravity: 12, drag: 0.5, bounce: true,
              });
            break;
          }
          case 'heroJoined': {
            // A column of green-and-gold light where the hero appears.
            for (let i = 0; i < 48; i++)
              sparks.spawn({
                x: e.x + ox + rnd(-0.4, 0.4), y: rnd(0.05, 0.4), z: e.y + oz + rnd(-0.4, 0.4),
                vx: rnd(-0.5, 0.5), vy: rnd(3, 7), vz: rnd(-0.5, 0.5),
                life: rnd(0.6, 1.1), size: rnd(0.06, 0.12), color: i % 2 ? '#ffdf00' : '#19c25c', intensity: 3, drag: 1,
              });
            fx.shake = Math.min(1, fx.shake + 0.3);
            break;
          }
          case 'playerRevived': {
            // Back through the gate: a column of sparks in the player's colors.
            const p = s.players.find((pp) => pp.id === e.playerId);
            const c = p ? SLOT_COLORS[p.colorIndex % SLOT_COLORS.length] : SLOT_COLORS[0];
            for (let i = 0; i < 36; i++)
              solids.spawn({
                x: e.x + ox + rnd(-0.35, 0.35), y: rnd(0.05, 0.4), z: e.y + oz + rnd(-0.35, 0.35),
                vx: rnd(-0.6, 0.6), vy: rnd(3, 6), vz: rnd(-0.6, 0.6),
                life: rnd(0.7, 1.2), size: rnd(0.04, 0.08), color: Math.random() < 0.5 ? c.primary : '#fff6c8',
                gravity: 2, drag: 1.2, bounce: false,
              });
            break;
          }
          case 'playerDied': {
            const p = s.players.find((pp) => pp.id === e.playerId);
            const c = p ? SLOT_COLORS[p.colorIndex % SLOT_COLORS.length] : SLOT_COLORS[0];
            for (let i = 0; i < 40; i++)
              solids.spawn({
                x: e.x + ox, y: 0.7, z: e.y + oz,
                vx: rnd(-3.5, 3.5), vy: rnd(3, 7), vz: rnd(-3.5, 3.5),
                life: rnd(0.9, 1.6), size: rnd(0.05, 0.1), color: Math.random() < 0.5 ? c.primary : c.secondary,
                gravity: 12, drag: 0.6, bounce: true,
              });
            fx.shake = Math.min(1, fx.shake + 0.4);
            break;
          }
          case 'playerFrozen':
            for (let i = 0; i < 22; i++)
              solids.spawn({
                x: e.x + ox + rnd(-0.3, 0.3), y: rnd(0.3, 1), z: e.y + oz + rnd(-0.3, 0.3),
                vx: rnd(-2.5, 2.5), vy: rnd(1.5, 4.5), vz: rnd(-2.5, 2.5),
                life: rnd(0.5, 0.9), size: rnd(0.05, 0.1), color: '#cdf3ff', gravity: 12, drag: 0.6, bounce: true,
              });
            break;
          case 'abilityUsed': {
            // Rescued heroes: a signature burst each.
            const ring = (n: number, speed: number, color: string, y = 0.5, life = 0.6) => {
              for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2;
                sparks.spawn({
                  x: e.x + ox, y, z: e.y + oz,
                  vx: Math.cos(a) * speed, vy: rnd(0.2, 0.8), vz: Math.sin(a) * speed,
                  life, size: rnd(0.07, 0.12), color, intensity: 2.8, drag: 1.2,
                });
              }
            };
            if (e.ability === 'forro') {
              ring(28, 5.5, '#ffcc4d', 0.45);
              ring(18, 3.2, '#ff5a3c', 0.7);
              fx.shake = Math.min(1, fx.shake + 0.25);
              break;
            }
            if (e.ability === 'laugh') {
              ring(36, 6.5, '#fff06a', 0.6, 0.5);
              ring(24, 4, '#ffb020', 1.0, 0.7);
              break;
            }
            if (e.ability === 'blunderbuss') {
              for (let i = 0; i < 14; i++)
                smoke.spawn({
                  x: e.x + ox + rnd(-0.2, 0.2), y: rnd(0.4, 0.8), z: e.y + oz + rnd(-0.2, 0.2),
                  vx: rnd(-1, 1), vy: rnd(0.4, 1.2), vz: rnd(-1, 1),
                  life: rnd(0.6, 1.1), size: rnd(0.3, 0.5), grow: 2.2, color: '#6b5a50', alpha: 0.55, drag: 2.5,
                });
              fx.shake = Math.min(1, fx.shake + 0.35);
              break;
            }
            if (e.ability === 'turbo') {
              ring(24, 3, '#ffd400', 0.3, 0.45);
              ring(16, 2, '#0a9b45', 0.6, 0.55);
              break;
            }
            if (e.ability === 'prize') {
              for (let i = 0; i < 30; i++)
                solids.spawn({
                  x: e.x + ox, y: 1.0, z: e.y + oz,
                  vx: rnd(-2.5, 2.5), vy: rnd(3, 6), vz: rnd(-2.5, 2.5),
                  life: rnd(0.9, 1.5), size: rnd(0.04, 0.08), color: ['#ffd23f', '#2f6bff', '#0a9b45', '#ffffff'][i % 4],
                  gravity: 10, drag: 0.8, bounce: true,
                });
              break;
            }
            const color = e.ability === 'dash' ? '#d9c7ff' : e.ability === 'mine' ? '#ffc21a' : e.ability === 'bicycle' ? '#e8e0d0' : '#ffb347';
            const steps = e.ability === 'dash' ? 14 : 10;
            for (let i = 0; i < steps; i++) {
              const k = i / steps;
              const px = e.ability === 'dash' ? e.fromX + (e.x - e.fromX) * k : e.x;
              const pz = e.ability === 'dash' ? e.fromY + (e.y - e.fromY) * k : e.y;
              sparks.spawn({
                x: px + ox, y: rnd(0.2, 0.9), z: pz + oz,
                vx: rnd(-0.8, 0.8), vy: rnd(0.5, 1.8), vz: rnd(-0.8, 0.8),
                life: rnd(0.3, 0.6), size: rnd(0.05, 0.1), color, intensity: 2.6, drag: 2,
              });
            }
            break;
          }
          case 'playerRolled':
          case 'playerLanded':
          case 'bombThrown': {
            const p = s.players.find((pp) => pp.id === e.playerId);
            if (!p) break;
            const n = e.type === 'playerLanded' ? 8 : e.type === 'playerRolled' ? 5 : 3;
            for (let i = 0; i < n; i++) {
              const ang = (i / n) * Math.PI * 2 + Math.random();
              smoke.spawn({
                x: p.x + ox + Math.cos(ang) * 0.2, y: 0.12, z: p.y + oz + Math.sin(ang) * 0.2,
                vx: Math.cos(ang) * rnd(0.8, 1.6), vy: rnd(0.2, 0.5), vz: Math.sin(ang) * rnd(0.8, 1.6),
                life: rnd(0.5, 0.8), size: rnd(0.28, 0.4), grow: 2, color: '#8a7466', alpha: 0.45, drag: 3,
              });
            }
            break;
          }
          case 'bombKicked': {
            const b = s.bombs.find((bb) => bb.id === e.bombId);
            if (!b) break;
            for (let i = 0; i < 8; i++)
              solids.spawn({
                x: b.x + ox, y: 0.15, z: b.y + oz,
                vx: rnd(-1.5, 1.5), vy: rnd(0.5, 1.5), vz: rnd(-1.5, 1.5),
                life: rnd(0.4, 0.7), size: rnd(0.08, 0.14), color: '#8a7a6a', drag: 2, grow: 1,
              });
            break;
          }
          case 'meteorImpact':
            fireballs.spawn({ x: e.x + ox, y: 0.4, z: e.y + oz, vy: 1.4, life: 0.45, size: 1.1, grow: 1.9, color: '#fff', kind: 1, drag: 2 });
            smoke.spawn({ x: e.x + ox, y: 0.6, z: e.y + oz, vy: 0.8, life: 1.6, size: 0.7, grow: 2.4, color: '#2e2729', alpha: 0.55, drag: 0.8, delay: 0.1 });
            decals.spawn({ x: e.x + ox, y: 0.02, z: e.y + oz, life: 4, size: 1.2, color: '#0b0706', alpha: 0.7 });
            shocks.spawn({ x: e.x + ox, y: 0.05, z: e.y + oz, life: 0.5, size: 1, grow: 3.6, color: '#ff7a2a', alpha: 1 });
            for (let i = 0; i < 14; i++)
              sparks.spawn({
                x: e.x + ox, y: 0.3, z: e.y + oz, vx: rnd(-4.5, 4.5), vy: rnd(3, 7), vz: rnd(-4.5, 4.5),
                life: rnd(0.6, 1.2), size: rnd(0.04, 0.08), color: '#ffb347', intensity: 3.5, gravity: 14, drag: 0.5, bounce: true,
              });
            for (let i = 0; i < 16; i++)
              solids.spawn({
                x: e.x + ox, y: 0.3, z: e.y + oz,
                vx: rnd(-4, 4), vy: rnd(3, 7), vz: rnd(-4, 4),
                life: rnd(0.7, 1.2), size: rnd(0.08, 0.16), color: '#3a1d14', gravity: 16, drag: 0.4, bounce: true,
              });
            fx.shake = Math.min(1, fx.shake + 0.35);
            break;
          case 'bossSlam': {
            const bx = e.x + ox;
            const bz = e.y + oz;
            shocks.spawn({ x: bx, y: 0.05, z: bz, life: 0.6, size: 2.5, grow: 3.4, color: '#ff8a2a', alpha: 1 });
            for (let i = 0; i < 16; i++) {
              const ang = (i / 16) * Math.PI * 2;
              smoke.spawn({
                x: bx + Math.cos(ang) * 1.4, y: 0.25, z: bz + Math.sin(ang) * 1.4,
                vx: Math.cos(ang) * 2.2, vy: rnd(0.2, 0.6), vz: Math.sin(ang) * 2.2,
                life: rnd(0.9, 1.4), size: rnd(0.6, 0.9), grow: 2, color: '#6b5a52', alpha: 0.55, drag: 2.2,
              });
            }
            for (let i = 0; i < 14; i++)
              solids.spawn({
                x: bx + rnd(-1.4, 1.4), y: 0.2, z: bz + rnd(-1.4, 1.4),
                vx: rnd(-3, 3), vy: rnd(3, 6), vz: rnd(-3, 3),
                life: rnd(0.8, 1.3), size: rnd(0.1, 0.2), color: '#2a1d18', gravity: 16, drag: 0.4, bounce: true,
              });
            fx.shake = Math.min(1, fx.shake + 0.75);
            break;
          }
          case 'bossRoots':
            for (const c of e.cells) {
              smoke.spawn({
                x: c.x + ox + rnd(-0.2, 0.2), y: 0.15, z: c.y + oz + rnd(-0.2, 0.2), vy: rnd(0.3, 0.8),
                life: rnd(0.7, 1.1), size: rnd(0.4, 0.6), grow: 1.8, color: '#7a6146', alpha: 0.45, drag: 1.5,
              });
              if (Math.random() < 0.5)
                solids.spawn({
                  x: c.x + ox, y: 0.2, z: c.y + oz, vx: rnd(-1.5, 1.5), vy: rnd(2, 4), vz: rnd(-1.5, 1.5),
                  life: rnd(0.6, 1), size: rnd(0.06, 0.12), color: '#5a3b22', gravity: 14, drag: 0.5, bounce: true,
                });
            }
            fx.shake = Math.min(1, fx.shake + 0.35);
            break;
          case 'bossSpores':
            for (let i = 0; i < 40; i++)
              sparks.spawn({
                x: e.x + ox + rnd(-1, 1), y: rnd(1.6, 2.6), z: e.y + oz + rnd(-1, 1),
                vx: rnd(-1.5, 1.5), vy: rnd(0.5, 2), vz: rnd(-1.5, 1.5),
                life: rnd(0.8, 1.5), size: rnd(0.04, 0.08), color: '#b8ff6a', intensity: 3, gravity: -0.5, drag: 1.2,
              });
            break;
          case 'bossBurrow':
          case 'bossEmerge': {
            const bx = e.x + ox;
            const bz = e.y + oz;
            for (let i = 0; i < 14; i++) {
              const ang = (i / 14) * Math.PI * 2;
              smoke.spawn({
                x: bx + Math.cos(ang) * 1.2, y: 0.25, z: bz + Math.sin(ang) * 1.2,
                vx: Math.cos(ang) * 1.8, vy: rnd(0.3, 0.8), vz: Math.sin(ang) * 1.8,
                life: rnd(0.8, 1.3), size: rnd(0.6, 0.9), grow: 2, color: '#6b5236', alpha: 0.55, drag: 2,
              });
            }
            for (let i = 0; i < 24; i++)
              solids.spawn({
                x: bx + rnd(-1.2, 1.2), y: 0.2, z: bz + rnd(-1.2, 1.2), vx: rnd(-3, 3), vy: rnd(3, 6), vz: rnd(-3, 3),
                life: rnd(0.8, 1.3), size: rnd(0.08, 0.16), color: Math.random() < 0.6 ? '#4a3220' : '#3f9a2e', gravity: 16, drag: 0.4, bounce: true,
              });
            if (e.type === 'bossEmerge') shocks.spawn({ x: bx, y: 0.05, z: bz, life: 0.5, size: 2.2, grow: 2.6, color: '#9cff5a', alpha: 0.9 });
            fx.shake = Math.min(1, fx.shake + (e.type === 'bossEmerge' ? 0.7 : 0.3));
            break;
          }
          case 'bossRoar':
            for (let i = 0; i < 30; i++)
              sparks.spawn({
                x: e.x + ox + rnd(-0.8, 0.8), y: rnd(1.4, 2.4), z: e.y + oz + rnd(-0.8, 0.8),
                vx: rnd(-1.5, 1.5), vy: rnd(4, 8), vz: rnd(-1.5, 1.5),
                life: rnd(0.6, 1.1), size: rnd(0.05, 0.09), color: '#ff7a1f', intensity: 4, gravity: 6, drag: 0.8,
              });
            fx.shake = Math.min(1, fx.shake + 0.35);
            break;
          case 'bossHit':
            for (let i = 0; i < 18; i++)
              sparks.spawn({
                x: e.x + ox + rnd(-0.7, 0.7), y: rnd(0.8, 2.2), z: e.y + oz + rnd(-0.7, 0.7),
                vx: rnd(-4, 4), vy: rnd(1, 5), vz: rnd(-4, 4),
                life: rnd(0.3, 0.7), size: rnd(0.05, 0.1), color: '#ffd27a', intensity: 4, gravity: 9, drag: 1,
              });
            for (let i = 0; i < 5; i++)
              solids.spawn({
                x: e.x + ox + rnd(-0.6, 0.6), y: rnd(1, 2), z: e.y + oz + rnd(-0.6, 0.6),
                vx: rnd(-3, 3), vy: rnd(2, 5), vz: rnd(-3, 3),
                life: rnd(0.8, 1.2), size: rnd(0.1, 0.18), color: '#2a1d18', gravity: 16, drag: 0.4, bounce: true,
              });
            fx.shake = Math.min(1, fx.shake + 0.2);
            break;
          case 'bossDefeated': {
            const bx = e.x + ox;
            const bz = e.y + oz;
            for (let i = 0; i < 14; i++)
              fireballs.spawn({
                x: bx + rnd(-1.2, 1.2), y: rnd(0.6, 2.4), z: bz + rnd(-1.2, 1.2), vy: rnd(0.8, 2),
                life: rnd(0.5, 0.9), size: rnd(0.9, 1.5), grow: 2, color: '#fff', kind: 0, drag: 2, delay: i * 0.07,
              });
            for (let i = 0; i < 20; i++)
              smoke.spawn({
                x: bx + rnd(-1.4, 1.4), y: rnd(0.5, 2), z: bz + rnd(-1.4, 1.4), vx: rnd(-0.5, 0.5), vy: rnd(0.6, 1.4), vz: rnd(-0.5, 0.5),
                life: rnd(1.8, 3), size: rnd(0.8, 1.2), grow: 2.4, color: '#3d3538', alpha: 0.6, drag: 0.6, delay: 0.3 + i * 0.05,
              });
            for (let i = 0; i < 40; i++)
              solids.spawn({
                x: bx + rnd(-1, 1), y: rnd(0.5, 2.4), z: bz + rnd(-1, 1),
                vx: rnd(-5, 5), vy: rnd(3, 8), vz: rnd(-5, 5),
                life: rnd(1.2, 2), size: rnd(0.12, 0.28), color: Math.random() < 0.7 ? '#2a1d18' : '#4a3028', gravity: 16, drag: 0.3, bounce: true,
              });
            shocks.spawn({ x: bx, y: 0.05, z: bz, life: 0.9, size: 3, grow: 4, color: '#ff8a2a', alpha: 1 });
            decals.spawn({ x: bx, y: 0.02, z: bz, life: 8, size: 3.6, color: '#0b0706', alpha: 0.75 });
            fx.shake = 1;
            break;
          }
          case 'enemyDied':
            for (let i = 0; i < 24; i++)
              sparks.spawn({
                x: e.x + ox, y: 0.35, z: e.y + oz,
                vx: rnd(-3, 3), vy: rnd(1.5, 5), vz: rnd(-3, 3),
                life: rnd(0.4, 0.9), size: rnd(0.06, 0.13), color: '#ff5a1f', intensity: 2.5, gravity: 10, drag: 1,
              });
            break;
        }
      }),
    [controller, fx, ox, oz, sparks, solids, smoke, fireballs, decals, shocks],
  );

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    sparks.update(d, sparkMesh.current);
    solids.update(d, solidMesh.current);
    // A charging boss kicks up dust.
    const boss = controller.state.boss;
    if (boss && boss.action === 'charge' && Math.random() < 0.6)
      smoke.spawn({
        x: boss.x + ox + rnd(-1, 1), y: 0.2, z: boss.y + oz + rnd(-1, 1), vy: rnd(0.2, 0.5),
        life: rnd(0.7, 1.1), size: rnd(0.5, 0.8), grow: 2, color: '#6b5a52', alpha: 0.5, drag: 1.5,
      });
    // Falling meteors leave a trail of fire and smoke.
    trailAcc.current += d;
    if (trailAcc.current > 1 / 45) {
      trailAcc.current = 0;
      for (const met of controller.state.meteors) {
        const pos = meteorRockPos(met, controller.tickF);
        if (!pos) continue;
        fireballs.spawn({ x: pos.x + ox + rnd(-0.08, 0.08), y: pos.y, z: pos.z + oz + rnd(-0.08, 0.08), vy: 0.3, life: 0.28, size: 0.75 - pos.f * 0.2, grow: 1.4, color: '#fff', kind: 1, drag: 3 });
        smoke.spawn({ x: pos.x + ox, y: pos.y + 0.2, z: pos.z + oz, vy: 0.4, life: 0.9, size: 0.4, grow: 2.2, color: '#3d3538', alpha: 0.5, drag: 1 });
      }
    }
    smoke.update(d);
    fireballs.update(d);
    decals.update(d);
    shocks.update(d);
    for (let i = 0; i < LIGHTS; i++) {
      const L = lights.current[i];
      if (!L) continue;
      lightLife.current[i] = Math.max(0, lightLife.current[i] - d * 3);
      L.intensity = Math.pow(lightLife.current[i], 2) * 60;
    }
    fx.shake = Math.max(0, fx.shake - d * 1.6);
  });

  return (
    <>
      <instancedMesh ref={sparkMesh} args={[undefined, undefined, sparks.n]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
        <meshBasicMaterial toneMapped={false} />
        <instancedBufferAttribute attach="instanceColor" args={[new Float32Array(sparks.n * 3), 3]} />
      </instancedMesh>
      <instancedMesh ref={solidMesh} args={[undefined, undefined, solids.n]} frustumCulled={false} castShadow>
        <boxGeometry args={[1, 0.7, 0.85]} />
        <meshStandardMaterial roughness={0.85} />
        <instancedBufferAttribute attach="instanceColor" args={[new Float32Array(solids.n * 3), 3]} />
      </instancedMesh>
      <primitive object={decals.mesh} />
      <primitive object={shocks.mesh} />
      <primitive object={fireballs.mesh} />
      <primitive object={smoke.mesh} />
      {Array.from({ length: LIGHTS }, (_, i) => (
        <pointLight key={i} ref={(l) => void (lights.current[i] = l)} color="#ff9a4a" intensity={0} distance={10} decay={1.5} />
      ))}
    </>
  );
}
