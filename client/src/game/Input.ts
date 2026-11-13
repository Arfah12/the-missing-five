/**
 * Keyboard + mouse input for the first-person game.
 *
 * Uses `event.code` (physical keys), so WASD works on AZERTY/QWERTZ too.
 * Mouse look requires pointer lock, which browsers only grant after a click.
 */

export type Action = 'forward' | 'back' | 'left' | 'right' | 'sprint' | 'crouch' | 'flashlight' | 'pause' | 'interact' | 'map' | 'inventory' | 'journal' | 'drop';

const BINDINGS: Record<string, Action> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  KeyC: 'crouch',
  ControlLeft: 'crouch',
  ControlRight: 'crouch',
  KeyF: 'flashlight',
  KeyE: 'interact',
  KeyM: 'map',
  Tab: 'inventory',
  KeyI: 'inventory',
  KeyJ: 'journal',
  KeyG: 'drop',
};

const PRESS = new Set<string>(['flashlight', 'interact', 'map', 'inventory', 'journal', 'drop']);

/** Actions that fire once per key press (not while held). */
export type PressAction = 'flashlight' | 'interact' | 'map' | 'inventory' | 'journal' | 'drop';

export class Input {
  private held = new Set<Action>();
  private pressed = new Set<PressAction>();
  private dx = 0;
  private dy = 0;
  private locked = false;
  private attached = false;

  /** Called when pointer lock is gained or lost (lost = show pause screen). */
  onLockChange: (locked: boolean) => void = () => {};

  constructor(private readonly target: HTMLElement) {}

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    this.releasePointer();
    this.clear();
  }

  /** Must be called from a user gesture (click). */
  requestPointer(): void {
    if (document.pointerLockElement === this.target) return;
    try {
      // unadjustedMovement gives raw mouse input where supported
      // (older TS DOM typings don't know the options argument or the returned promise)
      const lock = this.target.requestPointerLock as unknown as (opts?: { unadjustedMovement?: boolean }) => Promise<void> | undefined;
      const p = lock.call(this.target, { unadjustedMovement: true });
      p?.catch?.(() => {
        try {
          const q = this.target.requestPointerLock() as unknown as Promise<void> | undefined;
          q?.catch?.(() => this.onPointerLockError());
        } catch {
          this.onPointerLockError();
        }
      });
    } catch {
      this.onPointerLockError();
    }
  }

  releasePointer(): void {
    if (document.pointerLockElement === this.target) document.exitPointerLock();
  }

  get isLocked(): boolean {
    return this.locked;
  }

  isHeld(a: Action): boolean {
    return this.held.has(a);
  }

  /** True once per key press. */
  consume(a: PressAction): boolean {
    const had = this.pressed.has(a);
    this.pressed.delete(a);
    return had;
  }

  /** Mouse movement since the last call (pixels). */
  takeMouse(): [number, number] {
    const r: [number, number] = [this.dx, this.dy];
    this.dx = 0;
    this.dy = 0;
    return r;
  }

  axis(): { forward: number; right: number } {
    return {
      forward: (this.held.has('forward') ? 1 : 0) - (this.held.has('back') ? 1 : 0),
      right: (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0),
    };
  }

  clear(): void {
    this.held.clear();
    this.pressed.clear();
    this.dx = this.dy = 0;
  }

  /** While a keyboard-driven panel is open the game ignores keys (except Tab/J to close it). */
  passthrough = false;

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.locked) return;
    if (this.passthrough) {
      if (e.code === 'Tab') e.preventDefault();
      return;
    }
    const action = BINDINGS[e.code];
    if (!action) return;
    // Keep the page from scrolling / Ctrl shortcuts firing while playing.
    // (Browsers never let pages block Ctrl+W – that's why C is the main crouch key.)
    e.preventDefault();
    if (!e.repeat && PRESS.has(action)) this.pressed.add(action as PressAction);
    this.held.add(action);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const action = BINDINGS[e.code];
    if (action) this.held.delete(action);
  };

  private onBlur = () => this.clear();

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    // Guard against the occasional huge spike some browsers emit on lock.
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    this.dx += e.movementX;
    this.dy += e.movementY;
  };

  private onPointerLockChange = () => {
    const locked = document.pointerLockElement === this.target;
    if (locked === this.locked) return;
    this.locked = locked;
    if (!locked) this.clear();
    this.onLockChange(locked);
  };

  private onPointerLockError = () => {
    this.locked = false;
    this.onLockChange(false);
  };
}
