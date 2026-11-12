import { useSyncExternalStore } from 'react';
import { isTouchDevice } from './input/InputManager';

/**
 * Installable app (PWA) + fullscreen on phones.
 * - Installed from the home screen it opens fullscreen and landscape (manifest), no browser bar.
 * - In the browser, the first tap on a phone goes fullscreen and locks landscape (Android);
 *   iPhones can't do that from a page, so the menu explains "Adicionar à Tela de Início".
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const isStandalone = () =>
  window.matchMedia('(display-mode: fullscreen)').matches ||
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
const fullscreenElement = () => document.fullscreenElement ?? (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;

/** Fullscreen + landscape lock. Must run inside a user gesture. */
export function enterFullscreen() {
  if (fullscreenElement()) return Promise.resolve();
  const el = document.documentElement as FsElement;
  const req = el.requestFullscreen ? () => el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.bind(el);
  return Promise.resolve(req?.())
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape'))
    .catch(() => {});
}

export function startPwa() {
  // iOS Safari can leave the page scrolled after a rotation, showing a strip of background.
  const settle = () => window.setTimeout(() => window.scrollTo(0, 0), 250);
  window.addEventListener('orientationchange', settle);
  window.visualViewport?.addEventListener('resize', settle);
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
  // Phones in the browser: every tap while not fullscreen tries to go fullscreen (the browser
  // bar eats a big slice of a landscape screen). Leaving fullscreen with "back" is respected
  // until the next tap.
  if (isTouchDevice() && !isStandalone()) {
    window.addEventListener(
      'pointerup',
      (e) => {
        if (e.pointerType !== 'mouse' && !fullscreenElement()) void enterFullscreen();
      },
      { capture: true },
    );
  }
}

export type InstallKind = 'prompt' | 'ios' | null;

function installKind(): InstallKind {
  if (isStandalone()) return null;
  if (deferred) return 'prompt';
  if (isIOS()) return 'ios';
  return null;
}

/** What the "Instalar" button can do on this device (null: hide it). */
export function useInstall(): InstallKind {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    installKind,
    () => null,
  );
}

/** Shows the browser's install dialog (Android / desktop Chrome). */
export async function promptInstall() {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  notify();
  await e.prompt();
  return (await e.userChoice).outcome === 'accepted';
}
