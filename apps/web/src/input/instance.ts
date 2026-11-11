import { InputManager } from './InputManager';

/** One input manager per browser tab: devices outlive individual matches. */
export const inputManager = new InputManager();
