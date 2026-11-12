import { create } from 'zustand';
import { CHARACTER_IDS, SLOT_COLORS, type CharacterId } from '@4walls/shared';
// Circular with useAccount on purpose: only used at call time, never during module init.
import { ownedHeroes } from './useAccount';

/** The player's own character: it belongs to the player (not to a room) and follows them everywhere. */
export interface Profile {
  name: string;
  characterId: CharacterId;
  colorIndex: number;
}

interface ProfileState extends Profile {
  set: (p: Partial<Profile>) => void;
  cycleCharacter: (step: 1 | -1) => void;
  cycleColor: (step: 1 | -1) => void;
}

const KEY = '4walls.profile';
const DEFAULT: Profile = { name: 'Jogador', characterId: 'bombito', colorIndex: 0 };

function load(): Profile {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Profile> | null;
    if (!raw) return DEFAULT;
    return {
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 12) : DEFAULT.name,
      characterId: (CHARACTER_IDS as string[]).includes(raw.characterId ?? '') ? (raw.characterId as CharacterId) : DEFAULT.characterId,
      colorIndex: Number.isInteger(raw.colorIndex) && raw.colorIndex! >= 0 && raw.colorIndex! < SLOT_COLORS.length ? raw.colorIndex! : 0,
    };
  } catch {
    return DEFAULT;
  }
}

function save(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode: keep it for this session only */
  }
}

const wrap = (i: number, n: number) => ((i % n) + n) % n;

export const useProfile = create<ProfileState>((set, get) => ({
  ...load(),
  set: (p) => {
    set(p);
    const { name, characterId, colorIndex } = get();
    save({ name, characterId, colorIndex });
  },
  cycleCharacter: (step) => {
    // Only heroes this device owns (starters + rescued ones).
    const pool = CHARACTER_IDS.filter((id) => ownedHeroes().includes(id));
    const i = Math.max(0, pool.indexOf(get().characterId));
    get().set({ characterId: pool[wrap(i + step, pool.length)] });
  },
  cycleColor: (step) => get().set({ colorIndex: wrap(get().colorIndex + step, SLOT_COLORS.length) }),
}));

/** The devices of the profile's owner on this computer: keyboard (left half), first controller, touch. */
export const MY_DEVICES = ['kb1', 'gp0', 'touch'] as const;
/** localId of the profile player inside a room. */
export const ME = 'me';
