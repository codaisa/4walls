import { create } from 'zustand';
import { sfx, type Bus } from '../audio/Sfx';
import { isTouchDevice } from '../input/InputManager';

export type Quality = 'auto' | 'low' | 'medium' | 'high';
/** "auto": close follow camera on phones, whole arena elsewhere. */
export type CameraMode = 'auto' | 'close' | 'arena';

export interface Settings {
  quality: Quality;
  /** Camera shake on explosions / boss hits (some players get motion sick). */
  shake: boolean;
  showFps: boolean;
  camera: CameraMode;
  volumes: Record<Bus, number>;
}

const KEY = '4walls.settings';
const DEFAULTS: Settings = { quality: 'auto', shake: true, showFps: false, camera: 'auto', volumes: { music: 0.5, sfx: 0.8, ui: 0.7 } };

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Settings> | null;
    if (!raw) return DEFAULTS;
    const vol = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d);
    return {
      quality: (['auto', 'low', 'medium', 'high'] as Quality[]).includes(raw.quality as Quality) ? (raw.quality as Quality) : 'auto',
      shake: raw.shake !== false,
      showFps: raw.showFps === true,
      camera: (['auto', 'close', 'arena'] as CameraMode[]).includes(raw.camera as CameraMode) ? (raw.camera as CameraMode) : 'auto',
      volumes: {
        music: vol(raw.volumes?.music, DEFAULTS.volumes.music),
        sfx: vol(raw.volumes?.sfx, DEFAULTS.volumes.sfx),
        ui: vol(raw.volumes?.ui, DEFAULTS.volumes.ui),
      },
    };
  } catch {
    return DEFAULTS;
  }
}

interface SettingsState extends Settings {
  set: (p: Partial<Settings>) => void;
  setVolume: (bus: Bus, v: number) => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  set: (p) => {
    set(p);
    const { quality, shake, showFps, camera, volumes } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ quality, shake, showFps, camera, volumes }));
    } catch {
      /* private mode: settings last for this session */
    }
  },
  setVolume: (bus, v) => {
    const volumes = { ...get().volumes, [bus]: Math.round(Math.max(0, Math.min(1, v)) * 10) / 10 };
    sfx.setVolume(bus, volumes[bus]);
    get().set({ volumes });
  },
}));

// Saved volumes apply as soon as the app starts (the audio engine reads them when it unlocks).
for (const [bus, v] of Object.entries(useSettings.getState().volumes) as [Bus, number][]) sfx.setVolume(bus, v);

export interface GraphicsPreset {
  dpr: [number, number];
  shadows: boolean;
  shadowMap: number;
  /** Bloom + vignette post-processing. */
  post: boolean;
  msaa: number;
  /** V0: real point lights for scene props (pooled) and for explosion flashes. Fixed per quality. */
  lights: number;
  fxLights: number;
  /** V0: share of the particle pools (1 = full). */
  particles: number;
  /** V0: bloom computed at this fraction of the screen resolution (soft glow looks the same). */
  bloomScale: number;
}

const PRESETS: Record<Exclude<Quality, 'auto'>, GraphicsPreset> = {
  low: { dpr: [0.75, 1], shadows: false, shadowMap: 512, post: false, msaa: 0, lights: 2, fxLights: 1, particles: 0.4, bloomScale: 0.5 },
  medium: { dpr: [1, 1.25], shadows: true, shadowMap: 1024, post: true, msaa: 0, lights: 4, fxLights: 2, particles: 0.65, bloomScale: 0.5 },
  high: { dpr: [1, 1.75], shadows: true, shadowMap: 2048, post: true, msaa: 4, lights: 6, fxLights: 4, particles: 1, bloomScale: 1 },
};

/** The preset in effect ("auto": phones and tablets get medium, computers high). */
export function graphicsPreset(q: Quality): GraphicsPreset {
  return PRESETS[q === 'auto' ? (isTouchDevice() ? 'medium' : 'high') : q];
}

/** Small landscape screens (phones): the whole arena would be tiny, so the camera follows you. */
export function isCompactScreen() {
  return Math.min(window.innerWidth, window.innerHeight) < 560 && isTouchDevice();
}

export function closeCamera(mode: CameraMode) {
  return mode === 'close' || (mode === 'auto' && isCompactScreen());
}
