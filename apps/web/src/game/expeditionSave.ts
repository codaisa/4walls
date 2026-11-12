import type { ExpeditionSave } from '@4walls/shared';
import { regionInfo, type GameState } from '@4walls/core';

/** Task 3 — the local (this device) expedition save: written at every campfire. */
export interface LocalExpedition {
  seed: number;
  save: ExpeditionSave;
  players: number;
  at: number;
}

const KEY = '4walls.expedition.v1';

export function loadExpedition(): LocalExpedition | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as LocalExpedition;
    return v && typeof v.seed === 'number' && v.save && typeof v.save.camp === 'number' ? v : null;
  } catch {
    return null;
  }
}

export function saveExpedition(s: GameState) {
  const ex = s.expedition;
  if (!ex || ex.ended || ex.camp <= 0) return;
  const { fallAt: _f, ended: _e, ...save } = ex;
  try {
    localStorage.setItem(KEY, JSON.stringify({ seed: s.config.seed, save, players: s.players.length, at: Date.now() } satisfies LocalExpedition));
  } catch {
    /* storage full or blocked: the expedition just isn't resumable */
  }
}

export function clearExpedition() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** "Acampamento 2 · Região 13 · Pouso dos Viajantes" */
export function describeExpedition(e: LocalExpedition) {
  const info = regionInfo(e.seed, e.save.camp);
  return `Acampamento ${e.save.camps} · Região ${e.save.camp + 1} · ${info.name}`;
}
