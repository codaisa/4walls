/**
 * Procedurally synthesized sound effects (Web Audio API). No external audio files are needed,
 * which keeps Phase 1 offline-friendly and free of licensing concerns.
 * Separate buses for music / sfx / ui are ready for the settings screen.
 */
export type Bus = 'sfx' | 'ui' | 'music';

class SfxEngine {
  private ctx: AudioContext | null = null;
  private buses: Record<Bus, GainNode> | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  volumes: Record<Bus, number> = { sfx: 0.8, ui: 0.7, music: 0.5 };

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.master.connect(comp).connect(this.ctx.destination);
      this.buses = {
        sfx: this.ctx.createGain(),
        ui: this.ctx.createGain(),
        music: this.ctx.createGain(),
      };
      for (const b of Object.keys(this.buses) as Bus[]) {
        this.buses[b].gain.value = this.muted[b] ? 0 : this.volumes[b];
        this.buses[b].connect(this.master);
      }
      const len = this.ctx.sampleRate * 1.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(bus: Bus, v: number) {
    this.volumes[bus] = v;
    if (this.buses) this.buses[bus].gain.value = this.muted[bus] ? 0 : v;
  }

  /** Per-bus on/off, remembered in this browser. */
  muted: Record<Bus, boolean> = loadMuted();

  setMuted(bus: Bus, muted: boolean) {
    this.muted[bus] = muted;
    try {
      localStorage.setItem('4walls.audio', JSON.stringify(this.muted));
    } catch {
      /* storage unavailable: setting lasts for this session */
    }
    this.setVolume(bus, this.volumes[bus]);
  }

  private ready() {
    return this.ctx && this.buses && this.noise ? { ctx: this.ctx, buses: this.buses, noise: this.noise } : null;
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; to?: number; gain?: number; delay?: number; bus?: Bus } = {}) {
    const r = this.ready();
    if (!r) return;
    const t = r.ctx.currentTime + (opts.delay ?? 0);
    const o = r.ctx.createOscillator();
    const g = r.ctx.createGain();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(r.buses[opts.bus ?? 'sfx']);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(dur: number, filterFrom: number, filterTo: number, gain: number, q = 0.7) {
    const r = this.ready();
    if (!r) return;
    const t = r.ctx.currentTime;
    const src = r.ctx.createBufferSource();
    src.buffer = r.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = r.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(filterFrom, t);
    f.frequency.exponentialRampToValueAtTime(filterTo, t + dur);
    const g = r.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(r.buses.sfx);
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.05);
  }

  explosion(intensity = 1, fire = false) {
    this.burst(0.9 * intensity, 2400, 60, 0.9);
    this.tone(110, 0.5, { to: 32, gain: 0.7, type: 'sine' });
    this.tone(70, 0.35, { to: 28, gain: 0.5, type: 'triangle', delay: 0.02 });
    if (fire) this.burst(1.6, 900, 200, 0.35, 0.5); // long crackling roar
  }
  iceBlast() {
    this.burst(0.5, 7000, 1800, 0.35, 4);
    [1760, 2349, 2960].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', gain: 0.08, delay: i * 0.03 }));
  }
  freeze() {
    this.tone(2400, 0.35, { to: 900, type: 'triangle', gain: 0.1 });
  }
  dash() {
    this.burst(0.18, 5000, 600, 0.3, 1.5);
    this.tone(500, 0.15, { to: 1400, type: 'sine', gain: 0.1 });
  }
  mine() {
    this.tone(880, 0.08, { type: 'square', gain: 0.08 });
    this.tone(1320, 0.08, { type: 'square', gain: 0.08, delay: 0.1 });
  }
  kick() {
    this.tone(160, 0.12, { to: 70, type: 'sine', gain: 0.4 });
    this.burst(0.1, 1200, 300, 0.2);
  }
  alarm(times = 3) {
    for (let i = 0; i < times; i++) this.tone(740, 0.16, { to: 520, type: 'sawtooth', gain: 0.1, delay: i * 0.25, bus: 'ui' });
  }

  /** Audio graph access for the music engine (null until unlocked by a user gesture). */
  bus(name: Bus) {
    return this.ready() ? { ctx: this.ctx!, out: this.buses![name], noise: this.noise! } : null;
  }
  bombPlaced() {
    this.tone(220, 0.12, { to: 140, type: 'square', gain: 0.12 });
    this.burst(0.08, 900, 200, 0.15);
  }
  blockBreak() {
    this.burst(0.35, 1400, 120, 0.35, 2);
  }
  pickup() {
    [660, 880, 1320].forEach((f, i) => this.tone(f, 0.14, { type: 'triangle', gain: 0.18, delay: i * 0.06 }));
  }
  shield() {
    this.tone(1200, 0.4, { to: 300, type: 'sawtooth', gain: 0.12 });
  }
  death() {
    this.tone(520, 0.7, { to: 90, type: 'sawtooth', gain: 0.2 });
    this.tone(260, 0.7, { to: 50, type: 'square', gain: 0.1, delay: 0.05 });
  }
  enemyDeath() {
    this.tone(900, 0.25, { to: 1800, type: 'triangle', gain: 0.14 });
    this.burst(0.2, 3000, 400, 0.2);
  }
  countdown() {
    this.tone(440, 0.18, { type: 'square', gain: 0.12, bus: 'ui' });
  }
  go() {
    this.tone(880, 0.35, { type: 'square', gain: 0.14, bus: 'ui' });
    this.tone(1320, 0.35, { type: 'triangle', gain: 0.1, bus: 'ui', delay: 0.05 });
  }
  victory() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', gain: 0.18, delay: i * 0.12, bus: 'ui' }));
  }
  defeat() {
    [392, 330, 262].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', gain: 0.16, delay: i * 0.18, bus: 'ui' }));
  }
  ui() {
    this.tone(700, 0.06, { type: 'triangle', gain: 0.1, bus: 'ui' });
  }

  // ── Endless Adventure ──
  chest(rare: boolean) {
    this.tone(180, 0.18, { to: 120, type: 'square', gain: 0.12 });
    (rare ? [784, 988, 1175, 1568, 1976] : [660, 880, 1046]).forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', gain: 0.14, delay: 0.12 + i * 0.07, bus: 'ui' }));
  }
  secret() {
    // The classic "you found it" rising arpeggio.
    [392, 494, 587, 784, 988, 1175].forEach((f, i) => this.tone(f, 0.16, { type: 'square', gain: 0.07, delay: i * 0.09, bus: 'ui' }));
  }
  keyPick() {
    [1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.12, { type: 'sine', gain: 0.14, delay: i * 0.05 }));
  }
  keyDrop() {
    this.tone(900, 0.18, { to: 500, type: 'triangle', gain: 0.12 });
  }
  unlockGate() {
    this.tone(220, 0.1, { type: 'square', gain: 0.14 });
    this.tone(330, 0.1, { type: 'square', gain: 0.14, delay: 0.1 });
    this.burst(0.3, 3000, 600, 0.3, 2);
  }

  /** Fagulha spots you: a rising sizzle (the warning before the charge). */
  sparkAlert() {
    this.burst(0.3, 6000, 2500, 0.18, 3);
    this.tone(700, 0.35, { to: 1500, type: 'sawtooth', gain: 0.07 });
  }
  brazier() {
    this.burst(0.6, 1600, 300, 0.4, 0.6);
    this.tone(220, 0.3, { to: 330, type: 'triangle', gain: 0.12 });
  }
  missionDone() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.18, { type: 'square', gain: 0.07, delay: i * 0.08, bus: 'ui' }));
  }

  // ── Rescued heroes ──
  /** "Joins the fight!": a whoosh, a brass stab and (new hero) a fanfare. */
  heroReveal(isNew: boolean) {
    this.burst(0.4, 6000, 500, 0.35, 1.2);
    [196, 247, 294, 392].forEach((f) => this.tone(f, 0.5, { type: 'sawtooth', gain: 0.07, delay: 0.32, bus: 'ui' }));
    this.tone(98, 0.6, { type: 'square', gain: 0.1, delay: 0.32, bus: 'ui' });
    if (isNew) [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', gain: 0.16, delay: 0.75 + i * 0.1, bus: 'ui' }));
  }
  cageOpen() {
    this.tone(1900, 0.25, { to: 1400, type: 'square', gain: 0.06 });
    this.tone(2600, 0.3, { to: 2100, type: 'triangle', gain: 0.06, delay: 0.04 });
    this.burst(0.15, 4000, 1200, 0.2, 3);
  }
  /** Luiz Bombzaga: an accordion chord with bellows tremolo. */
  forro() {
    [262, 330, 392].forEach((f) => {
      for (let k = 0; k < 4; k++) this.tone(f * (k % 2 ? 1.004 : 1), 0.11, { type: 'sawtooth', gain: 0.05, delay: k * 0.1 });
    });
    this.burst(0.4, 600, 120, 0.25, 0.8);
  }
  /** Tiringão: "ha-ha-ha". */
  laugh() {
    [520, 470, 430, 380].forEach((f, i) => this.tone(f, 0.12, { to: f * 0.8, type: 'triangle', gain: 0.16, delay: i * 0.13 }));
  }
  /** Bombião: the blunderbuss boom. */
  blunderbuss() {
    this.burst(0.35, 3000, 200, 0.6, 1);
    this.tone(180, 0.3, { to: 50, type: 'square', gain: 0.25 });
  }
  /** Ayrton Senha: an engine revving up. */
  turbo() {
    this.tone(90, 0.9, { to: 520, type: 'sawtooth', gain: 0.12 });
    this.tone(180, 0.9, { to: 1040, type: 'square', gain: 0.04 });
  }
  /** Silvio Bombos: "ma-oe!" glide and a prize chime. */
  prize() {
    this.tone(600, 0.18, { to: 900, type: 'triangle', gain: 0.14 });
    this.tone(900, 0.3, { to: 520, type: 'triangle', gain: 0.14, delay: 0.18 });
    [1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.2, { type: 'sine', gain: 0.1, delay: 0.45 + i * 0.07 }));
  }
}

function loadMuted(): Record<Bus, boolean> {
  const fallback = { sfx: false, ui: false, music: false };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem('4walls.audio') ?? '{}') };
  } catch {
    return fallback;
  }
}

export const sfx = new SfxEngine();
