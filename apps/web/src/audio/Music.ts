import { sfx } from './Sfx';

/**
 * Procedural background music: a tiny step sequencer on the Web Audio API.
 * Original compositions generated from chord progressions — no audio files, no licensing.
 */
interface Song {
  bpm: number;
  /** Root MIDI note per bar (chord roots), and chord quality per bar. */
  bars: { root: number; minor: boolean }[];
  /** 16-step patterns (1 = hit). */
  kick: number[];
  snare: number[];
  hat: number[];
  /** Arp offsets into the chord (0..3 = root, third, fifth, octave); -1 = rest. */
  arp: number[];
  bass: number[];
  arpWave: OscillatorType;
  arpGain: number;
  padGain: number;
}

const SONGS: Record<'volcano' | 'forest', Song> = {
  // Driving, minor, a bit menacing: Am – F – G – Em
  volcano: {
    bpm: 126,
    bars: [
      { root: 57, minor: true },
      { root: 53, minor: false },
      { root: 55, minor: false },
      { root: 52, minor: true },
    ],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1],
    arp: [0, 2, 3, 2, 1, 2, 3, 2, 0, 2, 3, 2, 1, 3, 2, 1],
    bass: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0],
    arpWave: 'square',
    arpGain: 0.035,
    padGain: 0.03,
  },
  // Light and playful, major: D – Bm – G – A
  forest: {
    bpm: 104,
    bars: [
      { root: 62, minor: false },
      { root: 59, minor: true },
      { root: 55, minor: false },
      { root: 57, minor: false },
    ],
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    arp: [0, -1, 2, 3, 1, -1, 2, -1, 3, 2, 1, -1, 0, 2, -1, 1],
    bass: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    arpWave: 'triangle',
    arpGain: 0.06,
    padGain: 0.035,
  },
};

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

class MusicEngine {
  private timer: number | null = null;
  private song: Song | null = null;
  private step = 0;
  private nextTime = 0;
  private master: GainNode | null = null;

  play(name: keyof typeof SONGS) {
    const io = sfx.bus('music');
    if (!io) return;
    if (this.song === SONGS[name] && this.timer !== null) return;
    this.stop();
    this.song = SONGS[name];
    this.master = io.ctx.createGain();
    this.master.gain.setValueAtTime(0.0001, io.ctx.currentTime);
    this.master.gain.exponentialRampToValueAtTime(1, io.ctx.currentTime + 1.5);
    this.master.connect(io.out);
    this.step = 0;
    this.nextTime = io.ctx.currentTime + 0.1;
    // Lookahead scheduler: robust against frame hitches.
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    const io = sfx.bus('music');
    if (this.master && io) {
      const m = this.master;
      m.gain.cancelScheduledValues(io.ctx.currentTime);
      m.gain.setValueAtTime(m.gain.value, io.ctx.currentTime);
      m.gain.exponentialRampToValueAtTime(0.0001, io.ctx.currentTime + 0.6);
      window.setTimeout(() => m.disconnect(), 800);
    }
    this.master = null;
    this.song = null;
  }

  private schedule() {
    const io = sfx.bus('music');
    const song = this.song;
    if (!io || !song || !this.master) return;
    const stepDur = 60 / song.bpm / 4;
    while (this.nextTime < io.ctx.currentTime + 0.12) {
      this.playStep(io.ctx, io.noise, song, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % (16 * song.bars.length);
    }
  }

  private playStep(ctx: AudioContext, noise: AudioBuffer, song: Song, step: number, t: number, dur: number) {
    const out = this.master!;
    const bar = song.bars[Math.floor(step / 16)];
    const s = step % 16;
    const chord = [0, bar.minor ? 3 : 4, 7, 12].map((i) => bar.root + i);

    if (s === 0) for (const n of chord.slice(0, 3)) this.osc(ctx, out, 'sine', midi(n), t, dur * 16, song.padGain, 0.4, 3);
    if (song.kick[s]) this.drum(ctx, out, t, 150, 45, 0.5, 0.28);
    if (song.snare[s]) this.noiseHit(ctx, out, noise, t, 1800, 0.18, 0.16, 'bandpass');
    if (song.hat[s]) this.noiseHit(ctx, out, noise, t, 7000, 0.05, 0.05, 'highpass');
    if (song.bass[s]) this.osc(ctx, out, 'triangle', midi(bar.root - 24), t, dur * 2.5, 0.16, 0.01, 0);
    const a = song.arp[s];
    if (a >= 0) this.osc(ctx, out, song.arpWave, midi(chord[a] + 12), t, dur * 0.9, song.arpGain, 0.005, 0);
  }

  private osc(ctx: AudioContext, out: AudioNode, type: OscillatorType, freq: number, t: number, len: number, gain: number, attack: number, detune: number) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    f.type = 'lowpass';
    f.frequency.value = type === 'square' ? 2200 : 5000;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + len + 0.05);
  }

  private drum(ctx: AudioContext, out: AudioNode, t: number, from: number, to: number, gain: number, len: number) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + len);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + len + 0.02);
  }

  private noiseHit(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, t: number, freq: number, gain: number, len: number, type: BiquadFilterType) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + len + 0.02);
  }
}

export const music = new MusicEngine();
