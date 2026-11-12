import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { regionAt } from '@4walls/core';
import { lerp, useGame } from '../scene/context';
import type { ArenaTheme } from '../scene/themes';
import { flashPlayer } from './hitFlash';
import type { PresetId } from './presets';
import { vfx } from './vfx';

const ICE = '#bff4ff';
const HELL = '#ff7a3a';

/**
 * V2–V4: plays the effect presets from game events (combat, bosses) and keeps the continuous ones
 * going each frame (running dust, boss auras and trails, biome ambience). Purely cosmetic: it never
 * touches the simulation, apart from a few frames of hit-stop in local play.
 */
export function VfxEvents({ theme }: { theme: ArenaTheme }) {
  const { controller, fx, ox, oz } = useGame();
  const stop = (sec: number) => {
    if (controller.hitstop !== undefined) controller.hitstop = Math.max(controller.hitstop, sec);
  };
  const shake = (v: number) => (fx.shake = Math.min(1, fx.shake + v));
  const punch = (v: number) => (fx.punch = Math.max(fx.punch ?? 0, v));

  useEffect(
    () =>
      controller.on((e, s) => {
        switch (e.type) {
          case 'explosion': {
            const tint = e.kind === 'ice' ? ICE : undefined;
            vfx.emit('explosion.core', e.x + ox, 0, e.y + oz, { tint, scale: 0.8 + Math.min(0.5, e.cells.length * 0.02) });
            for (const c of e.cells) {
              if (c.x === e.x && c.y === e.y) continue;
              const dist = Math.abs(c.x - e.x) + Math.abs(c.y - e.y);
              vfx.emit('explosion.arm', c.x + ox, 0, c.y + oz, { tint: tint ?? (e.kind === 'fire' ? HELL : undefined), delay: dist * 0.014 });
            }
            break;
          }
          case 'bombPlaced':
            vfx.emit('bomb.place', e.x + ox, 0, e.y + oz);
            break;
          case 'blockDestroyed':
            vfx.emit('block.wood', e.x + ox, 0, e.y + oz);
            break;
          case 'powerupCollected':
            vfx.emit('powerup.pickup', e.x + ox, 0, e.y + oz);
            break;
          case 'powerupBurned':
            vfx.emit('powerup.burn', e.x + ox, 0, e.y + oz);
            break;
          case 'heartLost': {
            vfx.emit('hit.player', e.x + ox, 0, e.y + oz);
            vfx.emit('heart.lost', e.x + ox, 0, e.y + oz);
            flashPlayer(e.playerId);
            stop(0.075);
            shake(0.3);
            punch(0.6);
            break;
          }
          case 'playerDied': {
            const p = s.players.find((pp) => pp.id === e.playerId);
            if (!p) break;
            vfx.emit('hit.player', p.x + ox, 0, p.y + oz, { scale: 1.2 });
            flashPlayer(e.playerId);
            stop(0.1);
            break;
          }
          case 'shieldBroken': {
            const p = s.players.find((pp) => pp.id === e.playerId);
            if (!p) break;
            vfx.emit('hit.player', p.x + ox, 0, p.y + oz, { tint: '#9fe6ff' });
            flashPlayer(e.playerId);
            stop(0.05);
            break;
          }
          case 'mimicBite':
            flashPlayer(e.playerId);
            vfx.emit('hit.player', e.x + ox, 0, e.y + oz);
            break;
          case 'playerRolled':
          case 'playerLanded': {
            const p = s.players.find((pp) => pp.id === e.playerId);
            if (p) vfx.emit('dust.land', p.x + ox, 0, p.y + oz, { amount: e.type === 'playerRolled' ? 0.7 : 1 });
            break;
          }
          case 'playerRevived':
          case 'totemRevive': {
            const p = s.players.find((pp) => pp.id === e.playerId);
            vfx.emit('heal', (p?.x ?? e.x) + ox, 0, (p?.y ?? e.y) + oz);
            break;
          }
          case 'heartsRestored':
            for (const p of s.players) if (p.alive) vfx.emit('heal', p.x + ox, 0, p.y + oz, { amount: 0.6 });
            break;
          case 'enemyHurt':
            vfx.emit('enemy.hit', e.x + ox, 0, e.y + oz);
            break;
          case 'enemyDied':
            vfx.emit('enemy.poof', e.x + ox, 0, e.y + oz, { scale: e.elite ? 1.4 : 1, tint: e.kind === 'mote' ? '#c8a0ff' : undefined });
            break;
          case 'coins':
            vfx.emit('coins.pop', e.x + ox, 0, e.y + oz, { amount: Math.min(2.5, 0.6 + e.amount / 20) });
            break;
          case 'gateOpened':
            vfx.emit('gate.open', e.x + ox, 0, e.y + oz);
            break;
          case 'cageOpened':
          case 'secretFound':
            vfx.emit('powerup.pickup', e.x + ox, 0, e.y + oz, { scale: 1.3 });
            break;
          // ── V3: bosses ──
          case 'bossSlam':
            vfx.emit('boss.slam', e.x + ox, 0, e.y + oz);
            stop(0.06);
            punch(0.8);
            break;
          case 'bossLand':
          case 'mimicLand':
            vfx.emit('boss.land', e.x + ox, 0, e.y + oz, { scale: e.type === 'mimicLand' ? 0.6 : 1 });
            break;
          case 'bossEmerge':
            vfx.emit('boss.slam', e.x + ox, 0, e.y + oz, { scale: 0.8 });
            vfx.emit('boss.roots', e.x + ox, 0, e.y + oz, { amount: 1.5 });
            break;
          case 'bossHit':
            vfx.emit('enemy.hit', e.x + ox, 1, e.y + oz, { scale: 1.8 });
            punch(e.core ? 0.7 : 0.35);
            stop(e.core ? 0.09 : 0.045);
            break;
          case 'bossPhase':
          case 'bossEnraged': {
            const b = s.boss;
            if (b) vfx.emit('boss.phase', b.x + ox, 0, b.y + oz, { tint: b.enraged ? '#ff9a6a' : undefined });
            stop(0.12);
            punch(1);
            break;
          }
          case 'bossArmor':
          case 'bossPlate':
            vfx.emit('gate.open', e.x + ox, 0.4, e.y + oz, { tint: '#dfe6ff', scale: 0.8 });
            break;
          case 'bossLeap':
            vfx.emit('dust.land', e.x + ox, 0, e.y + oz, { scale: 1.8 });
            break;
          case 'bossRoots':
            for (const c of e.cells.slice(0, 14)) vfx.emit('boss.roots', c.x + ox, 0, c.y + oz, { amount: 0.6 });
            break;
          case 'bossSpores':
            vfx.emit('boss.spores', e.x + ox, 0, e.y + oz, { scale: 1.6 });
            break;
          case 'lavaRising':
            for (const c of e.cells.slice(0, 18)) vfx.emit('lava.bubble', c.x + ox, 0, c.y + oz, { delay: Math.random() * 0.4 });
            break;
          case 'mistStrike':
            vfx.emit('mist.strike', e.x + ox, 0, e.y + oz);
            break;
          case 'motesSummoned':
            for (const c of e.cells) vfx.emit('mist.strike', c.x + ox, 0, c.y + oz, { scale: 0.6, tint: '#c8a0ff' });
            break;
          case 'bossDefeated':
          case 'mimicDefeated':
            vfx.emit('boss.defeat', e.x + ox, 0, e.y + oz, { scale: e.type === 'mimicDefeated' ? 0.6 : 1 });
            punch(1);
            break;
        }
      }),
    [controller, fx, ox, oz],
  );

  // ── Continuous effects ──
  const acc = useRef(new Map<string, number>());
  const scratch = useMemo(() => ({ dir: new THREE.Vector3(), focus: new THREE.Vector3() }), []);
  /** Emits `id` at `rate` per second under the key `key` (fractional rates carry over). */
  const every = (key: string, rate: number, dt: number, fn: () => void) => {
    const m = acc.current;
    let a = (m.get(key) ?? Math.random()) + rate * dt;
    while (a >= 1) {
      a -= 1;
      fn();
    }
    m.set(key, a);
  };
  useFrame(({ camera }, dt) => {
    const d = Math.min(dt, 0.05);
    const s = controller.state;
    if (controller.paused) return;
    const al = controller.alpha;
    // Running dust behind each moving hero (not mid-jump).
    if (vfx.tier >= 1)
      for (const p of s.players) {
        if (!p.alive || !p.moving || p.maneuver?.kind === 'jump' || p.slideDir) continue;
        const x = lerp(p.px, p.x, al) + ox;
        const z = lerp(p.py, p.y, al) + oz;
        every(`run${p.id}`, 6, d, () => vfx.emit('dust.step', x, 0, z));
      }
    // Bosses: wind-up runes, charge trail, rage aura.
    const b = s.boss;
    if (b && b.action !== 'dead' && b.action !== 'burrowed') {
      const x = lerp(b.px, b.x, al) + ox;
      const z = lerp(b.py, b.y, al) + oz;
      if (b.action === 'windup') every('bossWind', 5, d, () => vfx.emit('boss.telegraph', x, 0, z));
      if (b.action === 'charge') every('bossTrail', 30, d, () => vfx.emit('boss.trail', x, 0, z));
      if (b.enraged && vfx.tier >= 1) every('bossRage', 14, d, () => vfx.emit('boss.rage', x, 0, z));
    }
    // Corrupted motes leave a violet trail.
    for (const en of s.enemies)
      if (en.kind === 'mote' && en.alive !== false) every(`mote${en.id}`, 18, d, () => vfx.emit('mote.trail', lerp(en.px, en.x, al) + ox, 0.55, lerp(en.py, en.y, al) + oz));
    // V4: lit campfires and braziers send sparks up; burning grass smokes embers.
    if (s.adventure)
      for (const pr of s.adventure.props) {
        if ((pr.kind === 'campfire' || pr.kind === 'brazier') && pr.state === 'lit') every(`fire${pr.id}`, pr.kind === 'campfire' ? 7 : 3, d, () => vfx.emit('camp.sparks', pr.x + ox, pr.kind === 'brazier' ? 0.5 : 0, pr.y + oz));
        else if (pr.kind === 'grass' && pr.state === 'burning') every(`grass${pr.id}`, 5, d, () => vfx.emit('camp.sparks', pr.x + ox, 0, pr.y + oz));
      }
    // V4: biome ambience around where the camera looks.
    let amb: PresetId | null = theme.liquid === 'water' ? 'amb.pollen' : 'amb.embers';
    const adv = s.adventure;
    if (adv) {
      const lead = s.players.find((p) => p.alive) ?? s.players[0];
      const region = lead ? adv.regions.find((r) => r.id === regionAt(s, lead.x, lead.y)) : undefined;
      if (region) {
        amb = region.biome === 'forest' ? 'amb.pollen' : region.biome === 'volcanic' ? 'amb.embers' : Math.random() < 0.5 ? 'amb.pollen' : 'amb.embers';
        // Mood variants bring their own particles already (fireflies, wisps, motes): a light touch.
        if (region.variant === 'night') amb = 'amb.night';
        else if (region.variant === 'mist') amb = 'amb.mist';
      }
    }
    if (amb) {
      camera.getWorldDirection(scratch.dir);
      const t = scratch.dir.y < -0.05 ? -camera.position.y / scratch.dir.y : 10;
      scratch.focus.copy(camera.position).addScaledVector(scratch.dir, t);
      const rate = amb === 'amb.mist' ? 1 : amb === 'amb.night' ? 4 : 9;
      const f = scratch.focus;
      every('amb', rate, d, () => vfx.emit(amb!, f.x, 0, f.z));
    }
  });
  return null;
}
