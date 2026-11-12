/**
 * V2: "you got hit" read at a glance: the hero flashes white for a few frames. Fx marks the
 * player; the avatar reads the flash amount (1 → 0 over FLASH_MS).
 */
const FLASH_MS = 140;
const hits = new Map<string, number>();

export function flashPlayer(id: string) {
  hits.set(id, performance.now());
}

export function flashAmount(id: string, now = performance.now()) {
  const t0 = hits.get(id);
  if (t0 === undefined) return 0;
  const k = 1 - (now - t0) / FLASH_MS;
  if (k <= 0) hits.delete(id);
  return Math.max(0, k);
}
