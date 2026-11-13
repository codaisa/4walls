import { useEffect, useRef, useState } from 'react';
import type { Dir } from '@4walls/shared';
import { inputManager } from '../input/instance';
import { isTouchDevice, type TouchButton } from '../input/InputManager';
import { useSettings } from '../store/useSettings';

/** Stick travel (px) at which the knob is fully deflected, and the dead zone as a fraction of it. */
const STICK_RADIUS = 56;
const DEAD_ZONE = 0.3;

/**
 * Nintendo-style face buttons (A right, B bottom, X top, Y left) with SNES colors.
 * A = bomb, B = ability, X = roll, Y = jump — the same mapping as a real gamepad.
 */
const FACE: { id: TouchButton; label: string; hint: string; color: string; pos: string }[] = [
  { id: 'jump', label: 'Y', hint: 'Pular', color: '#3fbf5f', pos: 'left-0 top-1/2 -translate-y-1/2' },
  { id: 'roll', label: 'X', hint: 'Rolar', color: '#3f86e0', pos: 'left-1/2 top-0 -translate-x-1/2' },
  { id: 'bomb', label: 'A', hint: 'Bomba', color: '#e0443f', pos: 'right-0 top-1/2 -translate-y-1/2' },
  { id: 'ability', label: 'B', hint: 'Habil.', color: '#f0c23a', pos: 'left-1/2 bottom-0 -translate-x-1/2' },
];

/** Keep receiving this finger's moves even if it slides off the element (never let it throw). */
const capture = (e: React.PointerEvent) => {
  try {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  } catch {
    /* pointer already gone / synthetic: moves still arrive while over the element */
  }
};

const vibrate = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
};

/**
 * On-screen gamepad for phones and tablets: a floating analog stick on the left half (it appears
 * under the thumb) and ABXY + pause on the right. Feeds the "touch" input device, so touch players
 * join lobbies and online rooms exactly like a keyboard or controller.
 *
 * "Controller only" (padMode): the screen goes black and the pad sits centered, for couch play
 * where everyone watches the TV and the phone is just a gamepad. The toggle is remembered.
 */
export function TouchControls({ showPause = true }: { showPause?: boolean }) {
  const [enabled] = useState(isTouchDevice);
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const stickId = useRef<number | null>(null);
  /** Where the thumb first landed (a ref: moves can arrive before React re-renders). */
  const origin = useRef({ x: 0, y: 0 });
  const [pressed, setPressed] = useState<Set<TouchButton>>(new Set());
  const padMode = useSettings((s) => s.padMode);

  // Release the stick if the component goes away mid-touch.
  useEffect(() => () => inputManager.touchDir(null), []);

  if (!enabled) return null;

  const updateStick = (x: number, y: number, ox: number, oy: number) => {
    let dx = x - ox;
    let dy = y - oy;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS;
      dy = (dy / len) * STICK_RADIUS;
    }
    setStick({ x: ox, y: oy, dx, dy });
    let dir: Dir | null = null;
    if (len > STICK_RADIUS * DEAD_ZONE) dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    inputManager.touchDir(dir);
  };

  const press = (id: TouchButton) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    capture(e);
    inputManager.touchPress(id);
    vibrate(12);
    setPressed((s) => new Set(s).add(id));
  };
  const release = (id: TouchButton) => () =>
    setPressed((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });

  return (
    <div
      className={padMode ? 'fixed inset-0 z-[60] select-none bg-black' : 'hud-safe pointer-events-none z-20 select-none'}
      data-testid="touch-controls"
      data-pad-mode={padMode || undefined}
      style={padMode ? { touchAction: 'none', padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' } : { touchAction: 'none' }}
    >
      {/* Stick zone: the whole left half; the stick spawns where the thumb lands. */}
      <div
        className={`pointer-events-auto absolute bottom-0 left-0 w-1/2 ${padMode ? 'top-0' : 'top-1/4'}`}
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          if (stickId.current !== null) return;
          stickId.current = e.pointerId;
          capture(e);
          const r = e.currentTarget.getBoundingClientRect();
          origin.current = { x: e.clientX - r.left, y: e.clientY - r.top };
          updateStick(origin.current.x, origin.current.y, origin.current.x, origin.current.y);
        }}
        onPointerMove={(e) => {
          if (e.pointerId !== stickId.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          updateStick(e.clientX - r.left, e.clientY - r.top, origin.current.x, origin.current.y);
        }}
        onPointerUp={(e) => {
          if (e.pointerId !== stickId.current) return;
          stickId.current = null;
          setStick(null);
          inputManager.touchDir(null);
        }}
        onPointerCancel={() => {
          stickId.current = null;
          setStick(null);
          inputManager.touchDir(null);
        }}
      >
        {stick ? (
          <div className="absolute" style={{ left: stick.x, top: stick.y }}>
            <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/30 bg-black/25" style={{ width: STICK_RADIUS * 2 + 24, height: STICK_RADIUS * 2 + 24 }} />
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/70 bg-white/35 shadow-lg"
              style={{ width: 58, height: 58, left: stick.dx, top: stick.dy }}
            />
          </div>
        ) : (
          <div
            className={`absolute flex items-center justify-center rounded-full border-2 border-dashed border-white/25 text-[10px] font-bold uppercase tracking-wider text-white/45 ${padMode ? 'left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2' : 'bottom-2 left-4 h-28 w-28'}`}
          >
            Mover
          </div>
        )}
      </div>

      {/* Face buttons. */}
      <div
        className={`pointer-events-auto absolute h-44 w-44 ${padMode ? 'right-[25%] top-1/2 -translate-y-1/2 translate-x-1/2 scale-125' : 'bottom-0 right-0'}`}
        style={{ touchAction: 'none' }}
      >
        {FACE.map((b) => (
          <button
            key={b.id}
            aria-label={b.hint}
            onPointerDown={press(b.id)}
            onPointerUp={release(b.id)}
            onPointerCancel={release(b.id)}
            onContextMenu={(e) => e.preventDefault()}
            className={`absolute flex h-[3.6rem] w-[3.6rem] flex-col items-center justify-center rounded-full border-2 font-display text-2xl leading-none text-white shadow-[0_4px_0_rgba(0,0,0,0.45)] transition-transform ${b.pos} ${pressed.has(b.id) ? 'scale-90 brightness-125' : ''}`}
            style={{ background: `${b.color}cc`, borderColor: '#ffffffaa', touchAction: 'none' }}
          >
            {b.label}
            <span className="mt-0.5 font-body text-[9px] font-bold uppercase tracking-wide opacity-90">{b.hint}</span>
          </button>
        ))}
      </div>

      {/* Toggle "controller only": black screen + centered pad (everyone watches the TV). */}
      <button
        aria-label={padMode ? 'Mostrar o jogo' : 'Modo controle'}
        data-testid="pad-mode-toggle"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          vibrate(12);
          useSettings.getState().set({ padMode: !padMode });
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={`pointer-events-auto absolute top-0 z-30 flex h-11 items-center justify-center gap-1.5 rounded-full border-2 border-white/60 bg-black/45 px-3 text-white ${padMode ? 'left-1/2 mt-2 -translate-x-1/2 text-sm font-bold' : `${showPause ? 'right-14' : 'right-0'} w-11 px-0 text-xl`}`}
        style={{ touchAction: 'none' }}
      >
        {padMode ? (
          <>
            <span className="text-lg">📺</span> Mostrar o jogo
          </>
        ) : (
          '🎮'
        )}
      </button>
      {padMode && <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] font-bold uppercase tracking-widest text-white/35">Modo controle · olhe para a TV</div>}

      {showPause && (
        <button
          aria-label="Pausa"
          onPointerDown={press('pause')}
          onPointerUp={release('pause')}
          className={`pointer-events-auto absolute right-0 top-0 z-30 flex h-11 w-11 ${padMode ? 'mr-3 mt-2' : ''} items-center justify-center rounded-full border-2 border-white/60 bg-black/45 text-lg text-white`}
          style={{ touchAction: 'none' }}
        >
          ❚❚
        </button>
      )}
    </div>
  );
}

/**
 * Compact docked pad for lobbies (scrollable menus): D-pad + A/B + Start along the bottom edge,
 * so a phone can join, pick a character/color, get ready and open the match settings.
 */
export function TouchDock() {
  const [enabled] = useState(isTouchDevice);
  if (!enabled) return null;
  const tapDir = (d: Dir) => (e: React.PointerEvent) => {
    e.preventDefault();
    inputManager.touchDir(d);
    vibrate(8);
    window.setTimeout(() => inputManager.touchDir(null), 60);
  };
  const tap = (b: TouchButton) => (e: React.PointerEvent) => {
    e.preventDefault();
    inputManager.touchPress(b);
    vibrate(12);
  };
  const pad = 'flex h-12 w-12 items-center justify-center rounded-xl border-2 border-white/40 bg-black/45 text-xl text-white active:scale-90 active:bg-white/25 [@media(max-height:500px)]:h-9 [@media(max-height:500px)]:w-10 [@media(max-height:500px)]:text-base';
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-white/15 bg-black/60 py-2 backdrop-blur [@media(max-height:500px)]:py-1" data-testid="touch-dock" style={{ touchAction: 'manipulation', paddingLeft: 'max(var(--edge-x), env(safe-area-inset-left))', paddingRight: 'max(var(--edge-x), env(safe-area-inset-right))', paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}>
      <div className="grid grid-cols-3 grid-rows-2 gap-1 [@media(max-height:500px)]:gap-0.5">
        <span />
        <button className={pad} aria-label="Cima" onPointerDown={tapDir('up')}>▲</button>
        <span />
        <button className={pad} aria-label="Esquerda" onPointerDown={tapDir('left')}>◀</button>
        <button className={pad} aria-label="Baixo" onPointerDown={tapDir('down')}>▼</button>
        <button className={pad} aria-label="Direita" onPointerDown={tapDir('right')}>▶</button>
      </div>
      <button className="rounded-full border-2 border-white/40 bg-black/45 px-4 py-2 text-sm font-bold text-white active:scale-95" onPointerDown={tap('pause')}>
        Start
      </button>
      <div className="flex items-center gap-2">
        <button className="flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 border-white/60 font-display text-2xl text-white active:scale-90 [@media(max-height:500px)]:h-11 [@media(max-height:500px)]:w-11 [@media(max-height:500px)]:text-xl" style={{ background: '#f0c23acc' }} onPointerDown={tap('ability')}>
          B<span className="font-body text-[9px] font-bold uppercase">Voltar</span>
        </button>
        <button className="flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 border-white/60 font-display text-3xl text-white active:scale-90 [@media(max-height:500px)]:h-12 [@media(max-height:500px)]:w-12 [@media(max-height:500px)]:text-2xl" style={{ background: '#e0443fcc' }} onPointerDown={tap('bomb')}>
          A<span className="font-body text-[9px] font-bold uppercase">Entrar/OK</span>
        </button>
      </div>
    </div>
  );
}
