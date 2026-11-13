/**
 * Keeps the frame rate playable on weaker PCs by rendering at a lower
 * resolution when frames get slow, and back up when there is headroom.
 * Pure logic (no Three.js) so it can be unit-tested.
 */
export class DynamicResolution {
  private avg = 1 / 60;
  private slowFor = 0;
  private fastFor = 0;
  scale: number;

  constructor(
    /** Highest pixel ratio allowed (quality preset × device). */
    private readonly max: number,
    private readonly min = 0.6,
    /** Below this FPS for `downAfter` seconds → lower the resolution. */
    private readonly lowFps = 42,
    /** Above this FPS for `upAfter` seconds → raise it again. */
    private readonly highFps = 57,
    private readonly downAfter = 2,
    private readonly upAfter = 6,
  ) {
    this.scale = max;
  }

  /** Feed one frame's duration (seconds). Returns true when `scale` changed. */
  frame(dt: number): boolean {
    if (dt <= 0 || dt > 0.5) return false; // tab switches, debugger pauses
    this.avg += (dt - this.avg) * 0.08;
    const fps = 1 / this.avg;
    if (fps < this.lowFps) {
      this.slowFor += dt;
      this.fastFor = 0;
    } else if (fps > this.highFps) {
      this.fastFor += dt;
      this.slowFor = 0;
    } else {
      this.slowFor = this.fastFor = 0;
    }
    if (this.slowFor > this.downAfter && this.scale > this.min) {
      this.scale = Math.max(this.min, Math.round((this.scale - 0.15) * 100) / 100);
      this.slowFor = 0;
      return true;
    }
    if (this.fastFor > this.upAfter && this.scale < this.max) {
      this.scale = Math.min(this.max, Math.round((this.scale + 0.1) * 100) / 100);
      this.fastFor = 0;
      return true;
    }
    return false;
  }
}
