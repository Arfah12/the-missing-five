import * as THREE from 'three';

/**
 * Hand-held torch: a soft spotlight attached to the camera that lags a
 * little behind your view. The battery is intentionally unlimited so players
 * can focus on finding the children instead of searching for pickups.
 */

export const FLASHLIGHT = {
  /** Battery does not drain during exploration. */
  drainPerSecond: 0,
  lowLevel: 0.15,
  intensity: 38,
  distance: 26,
  angle: 0.48,
  penumbra: 0.55,
} as const;

function cookieTexture(): THREE.CanvasTexture {
  // A light "cookie" with a hot centre, a faint ring and dirty-lens noise.
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(235,235,235,1)');
  g.addColorStop(0.62, 'rgba(150,150,150,1)');
  g.addColorStop(0.7, 'rgba(190,190,190,1)');
  g.addColorStop(0.86, 'rgba(60,60,60,1)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Flashlight {
  readonly light: THREE.SpotLight;
  /** Small fill so the area right around you isn't pitch black. */
  private readonly spill: THREE.PointLight;
  private readonly holder = new THREE.Object3D();
  private readonly cookie: THREE.CanvasTexture | null;
  private on = false;
  private flicker = 0;
  private nextFlicker = 0;
  private time = 0;
  battery = 1;

  constructor(
    private readonly camera: THREE.Camera,
    scene: THREE.Scene,
    shadows: { enabled: boolean; mapSize: number },
  ) {
    this.light = new THREE.SpotLight(0xfff1dc, 0, FLASHLIGHT.distance, FLASHLIGHT.angle, FLASHLIGHT.penumbra, 2);
    this.light.castShadow = shadows.enabled;
    this.light.shadow.mapSize.set(shadows.mapSize, shadows.mapSize);
    this.light.shadow.camera.near = 0.2;
    this.light.shadow.camera.far = FLASHLIGHT.distance;
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.02;
    let cookie: THREE.CanvasTexture | null = null;
    try {
      cookie = cookieTexture();
      this.light.map = cookie; // supported since r148
    } catch {
      cookie = null;
    }
    this.cookie = cookie;
    this.spill = new THREE.PointLight(0xffe8cc, 0, 3.2, 2);
    this.holder.add(this.light, this.light.target, this.spill);
    scene.add(this.holder);
  }

  get isOn(): boolean {
    return this.on;
  }

  /** Returns the new state (false if the battery is empty). */
  toggle(): boolean {
    if (!this.on && this.battery <= 0) return false;
    this.on = !this.on;
    return this.on;
  }

  update(dt: number): void {
    this.time += dt;
    // Torch sits at the right hand and lags slightly behind the view.
    const cam = this.camera;
    const offset = new THREE.Vector3(0.22, -0.2, -0.1).applyQuaternion(cam.quaternion);
    const target = cam.position.clone().add(offset);
    const k = 1 - Math.exp(-dt * 22);
    this.holder.position.lerp(target, k);
    const forward = new THREE.Vector3(0, 0, -6).applyQuaternion(cam.quaternion);
    const aim = cam.position.clone().add(forward);
    this.light.target.position.lerp(aim.sub(this.holder.position), 1 - Math.exp(-dt * 14));
    this.spill.position.set(0, 0, 0);

    if (this.on) {
      this.battery = Math.max(0, this.battery - FLASHLIGHT.drainPerSecond * dt);
      if (this.battery <= 0) this.on = false;
    }

    // Weak battery: dimmer and it stutters.
    let level = this.on ? 1 : 0;
    if (this.on) {
      const weak = this.battery < FLASHLIGHT.lowLevel ? 1 - this.battery / FLASHLIGHT.lowLevel : 0;
      level *= 1 - weak * 0.55;
      if (this.time > this.nextFlicker && Math.random() < 0.004 + weak * 0.05) {
        this.flicker = 0.05 + Math.random() * (0.08 + weak * 0.35);
        this.nextFlicker = this.time + 0.3;
      }
      if (this.flicker > 0) {
        this.flicker -= dt;
        level *= Math.random() < 0.5 ? 0.08 : 0.5;
      }
    }
    this.light.intensity = FLASHLIGHT.intensity * level;
    this.spill.intensity = 0.35 * level;
  }

  /** Something is interfering with it: stutter for a moment. */
  stutter(seconds: number): void {
    this.flicker = seconds;
  }

  /** Battery pickups arrive with the inventory (Phase 5). */
  recharge(amount: number): void {
    this.battery = Math.min(1, this.battery + amount);
  }

  dispose(): void {
    this.light.shadow.map?.dispose();
    this.light.dispose();
    this.spill.dispose();
    this.cookie?.dispose();
    this.holder.removeFromParent();
  }
}
