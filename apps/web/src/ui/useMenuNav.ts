import { useEffect, useRef, type RefObject } from 'react';
import type { Dir } from '@4walls/shared';
import { sfx } from '../audio/Sfx';
import type { UiEvent } from '../input/InputManager';
import { useUiHandler } from './uiInput';

const SELECTOR = '[data-nav]:not([disabled])';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(SELECTOR)].filter((el) => el.offsetParent !== null);
}

function setNavFocus(root: HTMLElement, el: HTMLElement | null) {
  for (const x of root.querySelectorAll('.nav-focus')) x.classList.remove('nav-focus');
  if (!el) return;
  el.classList.add('nav-focus');
  el.focus({ preventScroll: false });
  el.scrollIntoView({ block: 'nearest' });
}

/**
 * Spatial navigation: go to the nearest row (or column) in the pressed direction first, then pick
 * the best-aligned element in it — so ↓ from a wide button never skips the row right below.
 */
function pick(from: HTMLElement, all: HTMLElement[], dir: Dir): HTMLElement | null {
  const a = from.getBoundingClientRect();
  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'left' || dir === 'up' ? -1 : 1;
  const cands = all
    .filter((el) => el !== from)
    .map((el) => {
      const b = el.getBoundingClientRect();
      // Edge gap along the travel axis (must be ahead of the current element).
      const gap = horizontal ? (sign > 0 ? b.left - a.right : a.left - b.right) : sign > 0 ? b.top - a.bottom : a.top - b.bottom;
      const cross = horizontal ? Math.abs(b.top + b.height / 2 - (a.top + a.height / 2)) : Math.abs(b.left + b.width / 2 - (a.left + a.width / 2));
      // Same line = the spans overlap on the cross axis.
      const sameLine = horizontal ? b.top < a.bottom - 2 && b.bottom > a.top + 2 : b.left < a.right - 2 && b.right > a.left + 2;
      return { el, gap, cross, sameLine };
    })
    .filter((c) => c.gap > -2);
  if (!cands.length) return null;
  // Left/right stay on the same line when possible; up/down go to the nearest row.
  const pool = horizontal && cands.some((c) => c.sameLine) ? cands.filter((c) => c.sameLine) : cands;
  const nearest = Math.min(...pool.map((c) => c.gap));
  const row = pool.filter((c) => c.gap <= nearest + 16);
  row.sort((x, y) => x.cross - y.cross || x.gap - y.gap);
  return row[0].el;
}

export interface MenuNavOptions {
  active?: boolean;
  onBack?: () => void;
  /** Ignore "confirm" for this long after activation (avoids accidental skips while mashing). */
  armDelayMs?: number;
}

/**
 * Makes every `[data-nav]` element inside `root` reachable with D-pad / stick / WASD / arrows,
 * activated with A / Space / Enter, and B / Shift / Ctrl calls `onBack`.
 * The element marked `data-nav-default` (or the first one) starts focused.
 */
export function useMenuNav(root: RefObject<HTMLElement | null>, { active = true, onBack, armDelayMs = 0 }: MenuNavOptions = {}) {
  const current = useRef<HTMLElement | null>(null);
  const armedAt = useRef(0);

  useEffect(() => {
    if (!active || !root.current) return;
    armedAt.current = performance.now() + armDelayMs;
    const el = root.current.querySelector<HTMLElement>('[data-nav-default]:not([disabled])') ?? focusables(root.current)[0] ?? null;
    current.current = el;
    setNavFocus(root.current, el);
    // Mouse users move the highlight too, so it never points somewhere stale.
    const onHover = (ev: Event) => {
      const t = (ev.target as HTMLElement).closest<HTMLElement>(SELECTOR);
      if (t && root.current?.contains(t)) {
        current.current = t;
        setNavFocus(root.current, t);
      }
    };
    const node = root.current;
    node.addEventListener('pointerover', onHover);
    return () => node.removeEventListener('pointerover', onHover);
  }, [active, root, armDelayMs]);

  useUiHandler((e: UiEvent) => {
    const node = root.current;
    if (!node) return false;
    const all = focusables(node);
    if (!current.current || !node.contains(current.current) || !all.includes(current.current)) current.current = all[0] ?? null;
    switch (e.action) {
      case 'up':
      case 'down':
      case 'left':
      case 'right': {
        const next = current.current ? pick(current.current, all, e.action) : all[0];
        if (next) {
          current.current = next;
          setNavFocus(node, next);
          sfx.ui();
        }
        return true;
      }
      case 'confirm':
        if (performance.now() < armedAt.current) return true;
        current.current?.click();
        return true;
      case 'back':
        if (onBack) {
          sfx.ui();
          onBack();
          return true;
        }
        return false;
      default:
        return false;
    }
  }, active);
}
