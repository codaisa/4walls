import { beforeEach, describe, expect, it } from 'vitest';
import { GP, InputManager } from './InputManager';

/** Minimal fake window: an EventTarget with a controllable Gamepad API. */
function fakeWindow() {
  const pads: (Gamepad | null)[] = [null, null, null, null];
  const target = new EventTarget() as EventTarget & { navigator: { getGamepads: () => (Gamepad | null)[] } };
  target.navigator = { getGamepads: () => pads };
  return { win: target as unknown as Window, pads };
}

function pad(index: number, pressed: number[] = [], axes: number[] = [0, 0]): Gamepad {
  return {
    index,
    id: `Test pad ${index}`,
    connected: true,
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), touched: false, value: pressed.includes(i) ? 1 : 0 })),
  } as unknown as Gamepad;
}

const key = (win: Window, type: 'keydown' | 'keyup', code: string) =>
  win.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
const padEvent = (win: Window, type: string, p: Gamepad) => win.dispatchEvent(Object.assign(new Event(type), { gamepad: p }));

describe('InputManager', () => {
  let win: Window;
  let pads: (Gamepad | null)[];
  let im: InputManager;

  beforeEach(() => {
    ({ win, pads } = fakeWindow());
    im = new InputManager(win);
    im.attach();
  });

  it('two players on one keyboard keep independent state', () => {
    im.bind(0, ['kb1']);
    im.bind(1, ['kb2']);
    key(win, 'keydown', 'KeyD');
    key(win, 'keydown', 'ArrowUp');
    key(win, 'keydown', 'Enter');
    expect(im.read(0)).toEqual({ move: 'right', bomb: false, ability: false, roll: false, jump: false });
    expect(im.read(1)).toEqual({ move: 'up', bomb: true, ability: false, roll: false, jump: false });
    // The bomb press is consumed exactly once.
    expect(im.read(1).bomb).toBe(false);
  });

  it('the most recently pressed direction wins and releasing restores the previous one', () => {
    im.bind(0, ['kb1']);
    key(win, 'keydown', 'KeyW');
    key(win, 'keydown', 'KeyA');
    expect(im.read(0).move).toBe('left');
    key(win, 'keyup', 'KeyA');
    expect(im.read(0).move).toBe('up');
  });

  it('four gamepads drive four slots independently', () => {
    for (let i = 0; i < 4; i++) im.bind(i, [`gp${i}`]);
    pads[0] = pad(0, [GP.RIGHT]);
    pads[1] = pad(1, [GP.A]);
    pads[2] = pad(2, [], [0, -0.9]);
    pads[3] = pad(3);
    im.poll();
    expect(im.read(0)).toMatchObject({ move: 'right', bomb: false });
    expect(im.read(1)).toMatchObject({ move: null, bomb: true });
    expect(im.read(2)).toMatchObject({ move: 'up' });
    expect(im.read(3)).toMatchObject({ move: null, bomb: false });
  });

  it('keyboard + gamepad players coexist', () => {
    im.bind(0, ['kb1']);
    im.bind(1, ['gp0']);
    key(win, 'keydown', 'Space');
    pads[0] = pad(0, [GP.DOWN]);
    im.poll();
    expect(im.read(0)).toMatchObject({ move: null, bomb: true });
    expect(im.read(1)).toMatchObject({ move: 'down', bomb: false });
  });

  it('holding a gamepad button fires the bomb once (rising edge)', () => {
    im.bind(0, ['gp0']);
    pads[0] = pad(0, [GP.A]);
    im.poll();
    expect(im.read(0).bomb).toBe(true);
    im.poll();
    expect(im.read(0).bomb).toBe(false);
  });

  it('reports disconnection and reconnection, and ignores a disconnected pad', () => {
    const changes: string[] = [];
    im.onDeviceChange((id, c) => changes.push(`${id}:${c}`));
    im.bind(0, ['gp1']);
    pads[1] = pad(1, [GP.LEFT]);
    im.poll();
    expect(im.read(0).move).toBe('left');
    pads[1] = null;
    padEvent(win, 'gamepaddisconnected', pad(1));
    im.poll();
    expect(im.isConnected('gp1')).toBe(false);
    expect(im.read(0).move).toBeNull();
    pads[1] = pad(1, [GP.LEFT]);
    padEvent(win, 'gamepadconnected', pads[1]!);
    im.poll();
    expect(im.read(0).move).toBe('left');
    expect(changes).toEqual(['gp1:true', 'gp1:false', 'gp1:true']);
  });

  it('emits menu events per device for lobby join / ready', () => {
    key(win, 'keydown', 'Space');
    key(win, 'keydown', 'Enter');
    pads[2] = pad(2, [GP.A]);
    im.poll();
    expect(im.drainUi()).toEqual([
      { device: 'kb1', action: 'confirm' },
      { device: 'kb2', action: 'confirm' },
      { device: 'gp2', action: 'confirm' },
    ]);
    expect(im.drainUi()).toEqual([]);
  });

  it('resetLatches drops a pending press so the lobby "ready" never becomes a bomb', () => {
    im.bind(0, ['kb1']);
    key(win, 'keydown', 'Space');
    im.resetLatches();
    expect(im.read(0).bomb).toBe(false);
  });
});
