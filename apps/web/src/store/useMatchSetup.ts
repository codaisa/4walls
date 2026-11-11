import { create } from 'zustand';
import type { ArenaId, CharacterId } from '@4walls/shared';
import type { DeviceId } from '../input/InputManager';

export type LocalMode = 'versus' | 'solo' | 'adventure' | 'bossrush';

export interface LobbyPlayer {
  /** Gameplay slot 0..3 (spawn corner). */
  slot: number;
  device: DeviceId;
  colorIndex: number;
  characterId: CharacterId;
  ready: boolean;
}

export const MAX_LOCAL_PLAYERS = 4;
export const MODE_INFO: Record<LocalMode, { title: string; subtitle: string; min: number }> = {
  versus: { title: 'Versus', subtitle: 'Todos contra todos · sozinho, treino contra Magmitos', min: 1 },
  solo: { title: 'Caçada co-op', subtitle: 'Juntos contra os Magmitos', min: 1 },
  adventure: { title: 'Aventura', subtitle: 'Explore regiões e abra os portões', min: 1 },
  bossrush: { title: 'Chefões', subtitle: 'Boss Rush co-op · Golem e Guardião', min: 1 },
};

interface MatchSetupState {
  mode: LocalMode;
  arena: ArenaId;
  players: LobbyPlayer[];
  setMode: (m: LocalMode) => void;
  setArena: (a: ArenaId) => void;
  setPlayers: (p: LobbyPlayer[]) => void;
}

/** Local lobby result, read by the game screen. Lives in memory only — no account or server. */
export const useMatchSetup = create<MatchSetupState>((set) => ({
  mode: 'versus',
  arena: 'caldeira',
  players: [],
  setMode: (mode) => set({ mode }),
  setArena: (arena) => set({ arena }),
  setPlayers: (players) => set({ players }),
}));
