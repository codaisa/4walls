import { useEffect, useState } from 'react';
import { isTouchDevice } from '../input/InputManager';

const isPortrait = () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth;

/** Phones always play lying down: in portrait, cover everything with a "rotate" screen. */
export function RotatePrompt() {
  const [touch] = useState(isTouchDevice);
  const [portrait, setPortrait] = useState(isPortrait);
  useEffect(() => {
    const on = () => setPortrait(isPortrait());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  if (!touch || !portrait) return null;
  return (
    <div className="menu-bg fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 px-8 text-center font-body text-white" data-testid="rotate-prompt">
      <div className="rotate-phone text-7xl" aria-hidden>
        📱
      </div>
      <div className="font-display text-4xl text-amber-100">Gire o celular</div>
      <p className="max-w-xs text-base text-amber-50/80">O 4Walls é jogado com o celular deitado.</p>
      <button
        className="menu-btn !min-w-0 !px-5 !py-2 !text-lg"
        onClick={() => {
          // Android: full screen + lock to landscape in one tap (iOS ignores it gracefully).
          const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
          const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
          Promise.resolve(req?.())
            .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape'))
            .catch(() => {});
        }}
      >
        ⛶ Tela cheia deitada
      </button>
    </div>
  );
}
