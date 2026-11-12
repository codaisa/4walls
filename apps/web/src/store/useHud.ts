import { create } from 'zustand';
import type { GameResult, Phase } from '@4walls/core';

export interface HudPlayer {
  id: string;
  name: string;
  slot: number;
  colorIndex: number;
  /** Human-readable device(s) controlling this player. */
  device: string;
  alive: boolean;
  bombs: number;
  bombsAvailable: number;
  range: number;
  speedLevel: number;
  shield: boolean;
  kills: number;
  character: string;
  abilityName: string;
  /** 0 = just used … 1 = ready (quantized to keep re-renders cheap). */
  abilityCharge: number;
  hasRemoteBombs: boolean;
  special: { kind: 'fire' | 'ice'; charges: number } | null;
  perks: ('kick' | 'boots' | 'remote' | 'ghost' | 'glove')[];
  /** Seconds of Ghost left (0 = none). */
  ghostLeft: number;
  /** Roll / jump readiness: 0 = just used … 1 = ready (quantized). */
  moveCharge: number;
  frozen: boolean;
}

export interface HudEvent {
  name: string;
  description: string;
  phase: 'warning' | 'active';
  secondsLeft: number;
}

export interface HudAdventure {
  regionName: string;
  chapter: string;
  /** 1-based region number (the journey is endless). */
  index: number;
  /** Deepest region reached (1-based). */
  depth: number;
  objective: 'clear' | 'key' | 'lever' | 'seals' | 'purify';
  progress: number;
  goal: number;
  /** Key objective: somebody carries the key. */
  keyCarried: boolean;
  /** Side mission in this region (null if none). */
  braziers: { lit: number; goal: number } | null;
  gateOpen: boolean;
  /** Seconds until the gate behind closes (null when nothing is closing). */
  closingIn: number | null;
}

export interface HudBoss {
  name: string;
  title: string;
  hp: number;
  maxHp: number;
  enraged: boolean;
  /** 1-based position in the Boss Rush and how many there are. */
  index: number;
  total: number;
  dead: boolean;
}

export interface HudState {
  phase: Phase;
  countdown: number;
  timeLeft: number;
  players: HudPlayer[];
  enemiesAlive: number;
  enemiesTotal: number;
  result: GameResult | null;
  showResult: boolean;
  paused: boolean;
  banner: { text: string; key: number } | null;
  /** Players whose controller is disconnected (the match is paused until resolved). */
  missing: { slot: number; name: string; colorIndex: number }[];
  event: HudEvent | null;
  adventure: HudAdventure | null;
  boss: HudBoss | null;
  /** Player preference: hide the controls box (remembered in this browser). */
  controlsHidden: boolean;
  setControlsHidden: (hidden: boolean) => void;
  set: (p: Partial<HudState>) => void;
}

const CONTROLS_KEY = '4walls.controlsHidden';
function readControlsHidden() {
  try {
    return localStorage.getItem(CONTROLS_KEY) === '1';
  } catch {
    return false;
  }
}

export const useHud = create<HudState>((set) => ({
  phase: 'countdown',
  countdown: 3,
  timeLeft: 0,
  players: [],
  enemiesAlive: 0,
  enemiesTotal: 0,
  result: null,
  showResult: false,
  paused: false,
  banner: null,
  missing: [],
  event: null,
  adventure: null,
  boss: null,
  controlsHidden: readControlsHidden(),
  setControlsHidden: (hidden) => {
    try {
      localStorage.setItem(CONTROLS_KEY, hidden ? '1' : '0');
    } catch {
      /* private mode: just keep it for this session */
    }
    set({ controlsHidden: hidden });
  },
  set: (p) => set(p),
}));
