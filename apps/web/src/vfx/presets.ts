import type { VfxPreset } from './vfx';

/**
 * V1: the effect catalog, as data. Each preset is a few emitter layers over the shared atlas;
 * `minTier` hides the costly layers on phones (0 low, 1 medium, 2 high). Previewed live on /vfx.
 */
export const PRESETS = {
  // ───────────────────────────── Combat ─────────────────────────────
  'explosion.core': {
    label: 'Explosão — núcleo',
    group: 'Combate',
    desc: 'Clarão, bola de fogo em flipbook, estilhaços e faíscas no centro da bomba.',
    shake: 0,
    emitters: [
      { sprite: 'glow', additive: true, count: 1, life: 0.16, size: 2.8, grow: 1.3, height: 0.6, colors: ['#ffd890', '#ff6a1a'], intensity: 1.4 },
      { sprite: 'burst', flipbook: true, count: 1, life: 0.55, size: 1.5, grow: 1.7, height: 0.7, up: 0.8, colors: ['#ffc060', '#4a2018'], intensity: 1.7 },
      { sprite: 'burst', flipbook: true, count: 2, life: [0.55, 0.7], size: [0.9, 1.1], grow: 1.8, radius: 0.3, height: [0.6, 0.9], up: [0.8, 1.4], colors: ['#ffb060', '#3a2a28'], intensity: 1.3, delay: [0.02, 0.06], minTier: 1 },
      { sprite: 'spark', mode: 'streak', additive: true, count: 16, life: [0.25, 0.5], size: [0.09, 0.14], height: 0.5, speed: [5, 9], up: [1, 5], colors: ['#fff2b0', '#ff6a1f'], intensity: 3, gravity: 9, drag: 2, stretch: 0.12 },
      { sprite: 'shard', count: 6, life: [0.6, 0.95], size: [0.1, 0.18], height: 0.4, speed: [2.5, 4.5], up: [3, 6], colors: ['#2a2220', '#151010'], gravity: 16, drag: 0.4, bounce: true, spin: [6, 14], minTier: 1 },
      { sprite: 'scorch', mode: 'ground', count: 1, life: 5, size: 1.6, height: 0.025, colors: ['#ffffff'], alpha: 0.55 },
    ],
  },
  'explosion.arm': {
    label: 'Explosão — braço',
    group: 'Combate',
    desc: 'Pequena bola de fogo e brasas em cada casa atingida (atraso pela distância).',
    emitters: [
      { sprite: 'burst', flipbook: true, count: 1, life: [0.36, 0.46], size: [0.8, 0.95], grow: 1.5, height: 0.5, up: [0.6, 1.2], colors: ['#ffa040', '#5a2016'], intensity: 1.6 },
      { sprite: 'ember', additive: true, count: 3, life: [0.4, 0.8], size: [0.08, 0.13], height: 0.4, speed: [0.5, 2], up: [2, 4], colors: ['#ffd27a', '#ff3a10'], intensity: 3, gravity: 6, drag: 1.5, minTier: 1 },
    ],
  },
  'bomb.place': {
    label: 'Bomba posta',
    group: 'Combate',
    desc: 'Baforada de poeira no chão quando a bomba cai.',
    emitters: [
      { sprite: 'dust', count: 6, ring: true, life: [0.4, 0.55], size: [0.25, 0.35], grow: 1.8, height: 0.12, speed: [1.2, 1.8], up: [0.1, 0.4], colors: ['#d9c7a8', '#b9a588'], alpha: 0.7, drag: 4 },
      { sprite: 'ring', mode: 'ground', additive: true, count: 1, life: 0.3, size: 0.5, grow: 2.2, height: 0.03, colors: ['#ffffff'], intensity: 0.7, alpha: 0.6 },
    ],
  },
  'bomb.fuse': {
    label: 'Pavio aceso',
    group: 'Combate',
    desc: 'Faíscas pequenas saltando do pavio (chamado em ritmo pelo pavio).',
    emitters: [{ sprite: 'spark', mode: 'streak', additive: true, count: [1, 2], life: [0.15, 0.3], size: 0.05, speed: [0.5, 1.5], up: [1, 2.5], colors: ['#fff4c0', '#ff8a2a'], intensity: 3, gravity: 6, stretch: 0.15 }],
  },
  'block.wood': {
    label: 'Bloco quebrando (madeira)',
    group: 'Combate',
    desc: 'Lascas de madeira, poeira e serragem.',
    emitters: [
      { sprite: 'shard', count: 9, life: [0.6, 1], size: [0.1, 0.2], radius: 0.3, height: [0.2, 0.6], speed: [1.5, 3.5], up: [2.5, 5.5], colors: ['#c27a48', '#7a4426'], gravity: 15, drag: 0.4, bounce: true, spin: [5, 12] },
      { sprite: 'dust', count: 4, life: [0.6, 0.9], size: [0.35, 0.5], grow: 2, radius: 0.25, height: [0.2, 0.5], speed: [0.3, 0.8], up: [0.3, 0.7], colors: ['#c8a684', '#8f775f'], alpha: 0.65, drag: 2 },
    ],
  },
  'block.stone': {
    label: 'Bloco quebrando (pedra)',
    group: 'Combate',
    desc: 'Lascas de pedra cinza e poeira clara.',
    emitters: [
      { sprite: 'shard', count: 9, life: [0.6, 1], size: [0.1, 0.2], radius: 0.3, height: [0.2, 0.6], speed: [1.5, 3.5], up: [2.5, 5.5], colors: ['#9b96a0', '#55515a'], gravity: 16, drag: 0.4, bounce: true, spin: [5, 12] },
      { sprite: 'dust', count: 4, life: [0.6, 0.9], size: [0.35, 0.5], grow: 2, radius: 0.25, height: [0.2, 0.5], speed: [0.3, 0.8], up: [0.3, 0.7], colors: ['#c9c4cc', '#8b8790'], alpha: 0.6, drag: 2 },
    ],
  },
  'hit.player': {
    label: 'Golpe no herói',
    group: 'Combate',
    desc: 'Corte branco, estrelas e anel: lê-se na hora que você levou dano.',
    emitters: [
      { sprite: 'slash', additive: true, count: 1, life: 0.2, size: 1.3, grow: 1.25, height: 0.7, colors: ['#ffffff', '#ffd0d0'], intensity: 2 },
      { sprite: 'star', additive: true, count: 6, ring: true, life: [0.35, 0.5], size: [0.16, 0.24], height: 0.7, speed: [2, 3], up: [0.5, 2], colors: ['#fff6c8', '#ffb040'], intensity: 2.2, drag: 4, spin: [3, 6] },
      { sprite: 'ring', additive: true, count: 1, life: 0.25, size: 0.6, grow: 2.4, height: 0.7, colors: ['#ffffff'], intensity: 1.5 },
    ],
  },
  'heart.lost': {
    label: 'Coração perdido',
    group: 'Combate',
    desc: 'Um coração sobe e se parte em cacos vermelhos.',
    emitters: [
      { sprite: 'heart', count: 1, life: 0.7, size: 0.42, grow: 1.3, height: 1.5, up: 1.2, colors: ['#ff4a6a', '#ff4a6a'], intensity: 1.4, drag: 2, randomRot: false },
      { sprite: 'shard', count: 6, life: [0.5, 0.7], size: [0.08, 0.12], height: 1.6, speed: [1, 2], up: [1, 3], colors: ['#ff5a78', '#a01830'], gravity: 9, spin: [6, 12], delay: 0.45 },
    ],
  },
  'dust.step': {
    label: 'Poeira de corrida',
    group: 'Combate',
    desc: 'Nuvenzinha atrás dos pés ao correr.',
    emitters: [{ sprite: 'dust', count: 1, life: [0.35, 0.5], size: [0.16, 0.24], grow: 1.8, radius: 0.08, height: 0.08, up: [0.2, 0.5], colors: ['#d8c8ae', '#b5a48c'], alpha: 0.55, drag: 3 }],
  },
  'dust.land': {
    label: 'Pouso / rolamento',
    group: 'Combate',
    desc: 'Anel de poeira no chão ao pousar ou rolar.',
    emitters: [
      { sprite: 'dust', count: 7, ring: true, life: [0.4, 0.6], size: [0.2, 0.3], grow: 1.9, height: 0.1, speed: [1.4, 2.2], up: [0.2, 0.5], colors: ['#d8c8ae', '#b5a48c'], alpha: 0.6, drag: 4 },
    ],
  },
  'powerup.pickup': {
    label: 'Power-up coletado',
    group: 'Combate',
    desc: 'Anel de brilhos que sobe em espiral.',
    emitters: [
      { sprite: 'sparkle', additive: true, count: 10, ring: true, life: [0.5, 0.7], size: [0.18, 0.26], height: 0.4, speed: [1.2, 1.8], up: [1.5, 2.5], colors: ['#fff6b0', '#ffc030'], intensity: 2.2, drag: 2.5, spin: [2, 4] },
      { sprite: 'ring', additive: true, count: 1, life: 0.35, size: 0.6, grow: 2.2, mode: 'ground', height: 0.05, colors: ['#fff0a0'], intensity: 1.6 },
      { sprite: 'glow', additive: true, count: 1, life: 0.25, size: 1.4, height: 0.5, colors: ['#fff0a0'], intensity: 1.2 },
    ],
  },
  'powerup.burn': {
    label: 'Power-up queimando',
    group: 'Combate',
    desc: 'Chama curta e fumaça quando a explosão destrói um power-up.',
    emitters: [
      { sprite: 'flame', flipbook: true, mode: 'upright', additive: true, count: 1, life: 0.45, size: 0.6, height: 0.05, colors: ['#ffd27a', '#ff3a10'], intensity: 2 },
      { sprite: 'smoke', flipbook: true, count: 2, life: [0.8, 1.1], size: [0.3, 0.4], grow: 2, height: 0.4, up: [0.6, 1], colors: ['#4a4044', '#2a2426'], alpha: 0.6, delay: [0.1, 0.25] },
    ],
  },
  'enemy.hit': {
    label: 'Inimigo atingido',
    group: 'Combate',
    desc: 'Estrelinhas e um corte rápido.',
    emitters: [
      { sprite: 'slash', additive: true, count: 1, life: 0.16, size: 0.9, height: 0.5, colors: ['#ffffff'], intensity: 1.8 },
      { sprite: 'star', additive: true, count: 4, life: [0.3, 0.45], size: [0.12, 0.18], height: 0.5, speed: [1.5, 2.5], up: [1, 2.5], colors: ['#fff6c8', '#ffb040'], intensity: 2, drag: 3, gravity: 4 },
    ],
  },
  'enemy.poof': {
    label: 'Inimigo derrotado',
    group: 'Combate',
    desc: 'Puf de fumaça com estrelas, em vez de sumir.',
    emitters: [
      { sprite: 'smoke', flipbook: true, count: 4, life: [0.5, 0.7], size: [0.4, 0.55], grow: 1.8, radius: 0.2, height: [0.3, 0.6], speed: [0.6, 1.2], up: [0.4, 0.9], colors: ['#f2ecf4', '#a49aa8'], alpha: 0.85, drag: 3 },
      { sprite: 'star', additive: true, count: 5, ring: true, life: [0.45, 0.6], size: [0.14, 0.2], height: 0.5, speed: [2, 3], up: [1.5, 3], colors: ['#fff6c8', '#ffb040'], intensity: 2, gravity: 6, drag: 2, spin: [3, 6] },
    ],
  },
  'coins.pop': {
    label: 'Moedas',
    group: 'Interface',
    desc: 'Moedas giram para cima e caem quicando.',
    emitters: [
      { sprite: 'coin', count: 5, life: [0.8, 1.1], size: [0.18, 0.22], height: 0.5, speed: [0.6, 1.4], up: [3.5, 5], colors: ['#ffd23f', '#ffb020'], intensity: 1.3, gravity: 14, bounce: true, randomRot: false },
      { sprite: 'sparkle', additive: true, count: 3, life: 0.4, size: 0.2, radius: 0.3, height: [0.5, 1], colors: ['#fff6b0'], intensity: 2, delay: [0, 0.2] },
    ],
  },
  'heal': {
    label: 'Cura / reviver',
    group: 'Interface',
    desc: 'Corações e brilhos verdes subindo.',
    emitters: [
      { sprite: 'heart', count: 3, life: [0.8, 1.1], size: [0.18, 0.24], radius: 0.35, height: [0.4, 0.8], up: [0.9, 1.4], colors: ['#7dff9a', '#3acc66'], intensity: 1.5, drag: 1, randomRot: false, delay: [0, 0.25] },
      { sprite: 'sparkle', additive: true, count: 8, life: [0.5, 0.8], size: [0.12, 0.18], radius: 0.45, height: [0.2, 1], up: [0.8, 1.6], colors: ['#c8ffd0', '#5aff8a'], intensity: 2, drag: 1.5, delay: [0, 0.3] },
    ],
  },

  // ───────────────────────────── Bosses ─────────────────────────────
  'boss.telegraph': {
    label: 'Preparação de golpe',
    group: 'Chefes',
    desc: 'Runa no chão que acende e brilho crescente (chamado durante a preparação).',
    emitters: [
      { sprite: 'rune', mode: 'ground', additive: true, count: 1, life: 0.5, size: 2.2, grow: 1.15, height: 0.04, colors: ['#ff6a3a', '#ff2a10'], intensity: 1.6, fadeIn: 0.4, spin: 1.2 },
      { sprite: 'ember', additive: true, count: 3, life: [0.4, 0.6], size: [0.1, 0.15], radius: 1, height: 0.1, up: [1.5, 2.5], colors: ['#ffb060', '#ff3a10'], intensity: 2.5 },
    ],
  },
  'boss.slam': {
    label: 'Pancada no chão',
    group: 'Chefes',
    desc: 'Rachadura, onda de choque, anel de poeira e pedras voando.',
    shake: 0.75,
    emitters: [
      { sprite: 'crack', mode: 'ground', count: 1, life: 3.5, size: 3.2, height: 0.03, colors: ['#1a1210'], alpha: 0.85 },
      { sprite: 'shockRing', mode: 'ground', additive: true, count: 1, life: 0.5, size: 1.2, grow: 4.5, height: 0.05, colors: ['#ffd8a0', '#ff6a2a'], intensity: 1.8 },
      { sprite: 'dust', count: 14, ring: true, life: [0.6, 0.9], size: [0.4, 0.6], grow: 2.2, radius: 0.6, height: 0.15, speed: [3, 4.5], up: [0.3, 0.8], colors: ['#bfae98', '#8a7a68'], alpha: 0.7, drag: 3 },
      { sprite: 'shard', count: 10, life: [0.7, 1.1], size: [0.14, 0.24], radius: 0.8, height: 0.3, speed: [2, 4], up: [4, 7], colors: ['#7a6e64', '#3e3632'], gravity: 18, bounce: true, spin: [4, 10], minTier: 1 },
    ],
  },
  'boss.trail': {
    label: 'Rastro da investida',
    group: 'Chefes',
    desc: 'Poeira e faíscas atrás do chefe correndo (chamado a cada quadro).',
    emitters: [
      { sprite: 'dust', count: 1, life: [0.5, 0.8], size: [0.45, 0.65], grow: 2, radius: 0.7, height: 0.15, up: [0.2, 0.5], colors: ['#8c7a6c', '#5e5048'], alpha: 0.55, drag: 1.5 },
      { sprite: 'spark', mode: 'streak', additive: true, count: [0, 1.4], life: [0.2, 0.35], size: 0.07, radius: 0.6, height: 0.1, speed: [1, 3], up: [1, 3], colors: ['#ffd27a', '#ff6a1f'], intensity: 3, gravity: 8, minTier: 1 },
    ],
  },
  'boss.phase': {
    label: 'Troca de fase',
    group: 'Chefes',
    desc: 'Explosão de energia: clarão, anéis e estrelas para todo lado.',
    shake: 0.6,
    emitters: [
      { sprite: 'glow', additive: true, count: 1, life: 0.4, size: 6, grow: 1.4, height: 1.2, colors: ['#ffffff', '#ffb0f0'], intensity: 2 },
      { sprite: 'ring', additive: true, count: 2, life: [0.45, 0.6], size: 1.5, grow: 4, height: 1.2, colors: ['#ffe0ff', '#c070ff'], intensity: 2, delay: [0, 0.12] },
      { sprite: 'shockRing', mode: 'ground', additive: true, count: 1, life: 0.7, size: 1.5, grow: 5, height: 0.05, colors: ['#ffd0ff', '#a050ff'], intensity: 1.6 },
      { sprite: 'star', additive: true, count: 18, ring: true, life: [0.6, 0.9], size: [0.2, 0.3], height: 1, speed: [4, 6], up: [1, 4], colors: ['#fff6ff', '#d080ff'], intensity: 2.4, drag: 2, spin: [3, 6] },
    ],
  },
  'boss.rage': {
    label: 'Aura de fúria',
    group: 'Chefes',
    desc: 'Brasas e chamas subindo em volta do chefe furioso (chamado a cada quadro).',
    emitters: [
      { sprite: 'flame', flipbook: true, mode: 'upright', additive: true, count: [0, 1.2], life: [0.35, 0.5], size: [0.5, 0.8], radius: 1.1, height: 0, colors: ['#ff8a3a', '#ff1a10'], intensity: 1.8, minTier: 1 },
      { sprite: 'ember', additive: true, count: [0, 1.5], life: [0.6, 1], size: [0.08, 0.12], radius: 1.2, height: [0.2, 1.5], up: [1, 2], colors: ['#ffb060', '#ff2a10'], intensity: 3, drag: 0.5 },
    ],
  },
  'boss.land': {
    label: 'Pouso do chefe',
    group: 'Chefes',
    desc: 'Anel de poeira largo e onda no chão.',
    shake: 0.5,
    emitters: [
      { sprite: 'shockRing', mode: 'ground', additive: true, count: 1, life: 0.45, size: 1, grow: 4, height: 0.05, colors: ['#fff0d0', '#ffb070'], intensity: 1.2 },
      { sprite: 'dust', count: 12, ring: true, life: [0.6, 0.9], size: [0.45, 0.6], grow: 2.2, radius: 0.8, height: 0.15, speed: [2.5, 3.5], up: [0.2, 0.6], colors: ['#bfae98', '#8a7a68'], alpha: 0.7, drag: 3 },
    ],
  },
  'boss.roots': {
    label: 'Rajada de raízes',
    group: 'Chefes',
    desc: 'Terra, folhas e lascas verdes saltando do chão.',
    emitters: [
      { sprite: 'leaf', count: 6, life: [0.9, 1.3], size: [0.14, 0.2], radius: 0.3, height: 0.3, speed: [0.8, 1.8], up: [2.5, 4], colors: ['#7ed05a', '#3e8a2a'], gravity: 5, drag: 1.5, spin: [3, 7] },
      { sprite: 'shard', count: 6, life: [0.5, 0.8], size: [0.08, 0.14], radius: 0.3, height: 0.2, speed: [1, 2], up: [3, 5], colors: ['#6a4a30', '#3a2818'], gravity: 14, bounce: true, spin: [5, 10] },
      { sprite: 'dust', count: 2, life: 0.7, size: 0.45, grow: 2, height: 0.2, up: 0.5, colors: ['#8a6e50'], alpha: 0.6, drag: 2 },
    ],
  },
  'boss.spores': {
    label: 'Esporos',
    group: 'Chefes',
    desc: 'Nuvem de esporos esverdeados flutuando.',
    emitters: [
      { sprite: 'bubble', additive: true, count: 8, life: [1, 1.6], size: [0.12, 0.2], radius: 0.6, height: [0.3, 1], up: [0.3, 0.8], speed: [0.2, 0.5], colors: ['#c8ff7a', '#6acc3a'], intensity: 1.4, drag: 0.6, fadeIn: 0.2 },
      { sprite: 'mist', count: 2, life: [1.2, 1.6], size: [0.9, 1.2], grow: 1.6, radius: 0.4, height: 0.5, up: 0.2, colors: ['#a8d870', '#6a9a40'], alpha: 0.35, fadeIn: 0.3 },
    ],
  },
  'lava.bubble': {
    label: 'Bolha de lava',
    group: 'Chefes',
    desc: 'Bolha que estoura com respingos (lava subindo).',
    emitters: [
      { sprite: 'bubble', additive: true, count: 1, life: 0.5, size: 0.3, grow: 1.6, height: 0.08, colors: ['#ffd27a', '#ff4a10'], intensity: 1.8, fadeIn: 0.6 },
      { sprite: 'drop', additive: true, count: 3, life: [0.4, 0.6], size: [0.08, 0.12], height: 0.1, speed: [0.5, 1.2], up: [2, 3.5], colors: ['#ffb060', '#ff2a10'], intensity: 2.2, gravity: 10, delay: 0.3 },
    ],
  },
  'mist.strike': {
    label: 'Golpe da névoa',
    group: 'Chefes',
    desc: 'Redemoinho violeta com faíscas frias.',
    emitters: [
      { sprite: 'swirl', mode: 'ground', additive: true, count: 1, life: 0.6, size: 1.4, grow: 1.5, height: 0.05, colors: ['#d0a0ff', '#6a30c0'], intensity: 1.8, spin: 6 },
      { sprite: 'mist', count: 3, life: [0.7, 1], size: [0.6, 0.8], grow: 1.8, radius: 0.4, height: 0.4, up: 0.4, colors: ['#b890e0', '#5a3a80'], alpha: 0.45 },
      { sprite: 'sparkle', additive: true, count: 6, life: [0.3, 0.5], size: [0.12, 0.18], radius: 0.5, height: [0.2, 0.9], up: [0.5, 1.5], colors: ['#f0e0ff', '#a070ff'], intensity: 2.2 },
    ],
  },
  'mote.trail': {
    label: 'Rastro de mota',
    group: 'Chefes',
    desc: 'Pontinho violeta deixado pelas motas (chamado a cada quadro).',
    emitters: [{ sprite: 'firefly', additive: true, count: 1, life: [0.3, 0.45], size: [0.16, 0.22], colors: ['#e0b0ff', '#7030c0'], intensity: 2.2, up: 0.2 }],
  },
  'boss.defeat': {
    label: 'Chefe derrotado',
    group: 'Chefes',
    desc: 'Grande final: clarões em sequência, estrelas e chuva de brilhos.',
    shake: 1,
    emitters: [
      { sprite: 'glow', additive: true, count: 3, life: 0.35, size: [4, 6], radius: 0.8, height: [0.8, 1.6], colors: ['#ffffff', '#ffd080'], intensity: 2.2, delay: [0, 0.5] },
      { sprite: 'burst', flipbook: true, count: 4, life: [0.5, 0.65], size: [1.2, 1.6], grow: 1.7, radius: 1, height: [0.6, 1.4], colors: ['#ffc060', '#4a2018'], intensity: 1.7, delay: [0, 0.6] },
      { sprite: 'star', additive: true, count: 26, life: [0.8, 1.2], size: [0.2, 0.32], height: 1.2, speed: [3, 6], up: [3, 7], colors: ['#fffbe0', '#ffc040'], intensity: 2.4, gravity: 6, drag: 1, spin: [3, 6] },
      { sprite: 'coin', count: 10, life: [1, 1.4], size: [0.2, 0.25], height: 1, speed: [1, 3], up: [4, 7], colors: ['#ffd23f'], intensity: 1.3, gravity: 14, bounce: true, randomRot: false, delay: [0.3, 0.6] },
    ],
  },

  // ───────────────────────────── World ─────────────────────────────
  'amb.embers': {
    label: 'Ambiente: brasas',
    group: 'Mundo',
    desc: 'Brasas e cinzas flutuando sobre o vulcão (emitido em volta da câmera).',
    emitters: [
      { sprite: 'ember', additive: true, count: 1, life: [2.5, 4], size: [0.05, 0.09], radius: 8, height: [0, 1], up: [0.3, 0.8], speed: [0.1, 0.4], colors: ['#ffb060', '#ff3a10'], intensity: 2.5, fadeIn: 0.2 },
      { sprite: 'petal', count: [0, 1.4], life: [3, 5], size: [0.04, 0.07], radius: 8, height: [1, 3], up: [-0.25, -0.1], speed: [0.1, 0.3], colors: ['#5a5254', '#3a3436'], alpha: 0.7, fadeIn: 0.2, spin: [1, 2], minTier: 1 },
    ],
  },
  'amb.fireflies': {
    label: 'Ambiente: vagalumes',
    group: 'Mundo',
    desc: 'Pontinhos verde-amarelos que piscam devagar.',
    emitters: [{ sprite: 'firefly', additive: true, count: 1, life: [2.5, 4], size: [0.12, 0.18], radius: 8, height: [0.3, 1.6], up: [-0.1, 0.15], speed: [0.1, 0.3], colors: ['#e8ff8a', '#a0e040'], intensity: 2.4, fadeIn: 0.5, drag: 0.2 }],
  },
  'amb.pollen': {
    label: 'Ambiente: pólen e folhas',
    group: 'Mundo',
    desc: 'Pólen dourado e folhas caindo na floresta.',
    emitters: [
      { sprite: 'petal', count: 1, life: [3, 5], size: [0.04, 0.06], radius: 8, height: [0.3, 2], up: [-0.05, 0.1], speed: [0.15, 0.35], colors: ['#fff2a0', '#e8d070'], alpha: 0.8, fadeIn: 0.3 },
      { sprite: 'leaf', count: [0, 1.3], life: [3.5, 5], size: [0.1, 0.14], radius: 8, height: [2.5, 3.5], up: [-0.6, -0.35], speed: [0.2, 0.5], colors: ['#8ed05a', '#c8a040'], fadeIn: 0.15, spin: [1.5, 3], minTier: 1 },
    ],
  },
  'amb.night': {
    label: 'Ambiente: noite',
    group: 'Mundo',
    desc: 'Vagalumes azulados e brilhos lentos na escuridão.',
    emitters: [{ sprite: 'firefly', additive: true, count: 1, life: [3, 5], size: [0.1, 0.16], radius: 8, height: [0.3, 2], up: [-0.1, 0.1], speed: [0.05, 0.2], colors: ['#a8e0ff', '#5080ff'], intensity: 2.2, fadeIn: 0.5 }],
  },
  'amb.mist': {
    label: 'Ambiente: névoa',
    group: 'Mundo',
    desc: 'Faixas de névoa rasteira passando devagar.',
    emitters: [{ sprite: 'mist', count: 1, life: [5, 7], size: [2.2, 3], grow: 1.3, radius: 8, height: [0.2, 0.5], speed: [0.15, 0.3], colors: ['#d8d0e8', '#b8b0d0'], alpha: 0.18, fadeIn: 0.4 }],
  },
  'amb.snow': {
    label: 'Ambiente: neve',
    group: 'Mundo',
    desc: 'Flocos girando devagar (bioma gelado / variante de inverno).',
    emitters: [{ sprite: 'snow', count: 1, life: [4, 6], size: [0.06, 0.1], radius: 8, height: [3, 4], up: [-0.7, -0.4], speed: [0.1, 0.3], colors: ['#ffffff', '#d8f0ff'], alpha: 0.9, fadeIn: 0.1, spin: [0.5, 1.5] }],
  },
  'camp.sparks': {
    label: 'Fogueira: fagulhas',
    group: 'Mundo',
    desc: 'Fagulhas subindo da fogueira do acampamento (chamado em ritmo).',
    emitters: [{ sprite: 'ember', additive: true, count: 1, life: [0.8, 1.4], size: [0.05, 0.08], radius: 0.15, height: 0.4, up: [1, 1.8], speed: [0.1, 0.35], colors: ['#ffd27a', '#ff3a10'], intensity: 3, drag: 0.3 }],
  },
  'portal.swirl': {
    label: 'Portal / portão',
    group: 'Mundo',
    desc: 'Brilhos girando e subindo de um portão aberto.',
    emitters: [
      { sprite: 'sparkle', additive: true, count: 1, life: [0.8, 1.2], size: [0.12, 0.18], radius: 0.5, height: [0, 0.4], up: [0.8, 1.4], colors: ['#c8f8ff', '#40c0ff'], intensity: 2.2, fadeIn: 0.2 },
      { sprite: 'rune', mode: 'ground', additive: true, count: [0, 1.05], life: 1.2, size: 1.1, height: 0.04, colors: ['#80e0ff', '#2060ff'], intensity: 1, fadeIn: 0.3, spin: 0.8 },
    ],
  },
  'gate.open': {
    label: 'Portão abrindo',
    group: 'Mundo',
    desc: 'Explosão de brilhos azuis e poeira quando o portão destrava.',
    shake: 0.25,
    emitters: [
      { sprite: 'glow', additive: true, count: 1, life: 0.3, size: 2.5, height: 0.8, colors: ['#c8f8ff'], intensity: 1.6 },
      { sprite: 'sparkle', additive: true, count: 14, life: [0.6, 0.9], size: [0.16, 0.24], radius: 0.4, height: 0.6, speed: [1.5, 3], up: [1.5, 3.5], colors: ['#e8fcff', '#40c0ff'], intensity: 2.2, drag: 2, gravity: 2 },
      { sprite: 'dust', count: 6, ring: true, life: 0.7, size: 0.4, grow: 2, height: 0.1, speed: 2, up: 0.3, colors: ['#bfb6a8'], alpha: 0.6, drag: 3 },
    ],
  },
} as const satisfies Record<string, VfxPreset>;

export type PresetId = keyof typeof PRESETS;
