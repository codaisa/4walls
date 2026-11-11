import { useEffect, useRef } from 'react';
import type { UiEvent } from '../input/InputManager';
import { inputManager } from '../input/instance';

/** Returns true when the event was consumed; otherwise it falls through to the handler below. */
export type UiHandler = (e: UiEvent) => boolean | void;

const stack: { current: UiHandler }[] = [];
let started = false;

/**
 * One global loop polls every device and routes menu events (from keyboard or gamepad alike)
 * to the top-most active handler, falling through while handlers return false.
 * This is what makes every screen usable with a controller.
 */
export function startUiInput() {
  if (started) return;
  started = true;
  inputManager.attach();
  const loop = () => {
    inputManager.poll();
    for (const e of inputManager.drainUi()) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].current(e) !== false) break;
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/** Registers a handler while the component is mounted (and `active`). Later mounts sit on top. */
export function useUiHandler(handler: UiHandler, active = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    const entry = { current: (e: UiEvent) => ref.current(e) };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
    };
  }, [active]);
}
