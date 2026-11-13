import * as THREE from 'three';

/**
 * Rain that follows the player (never falls under roofs) and lightning
 * that briefly lights up the whole village.
 */
export class Weather {
  private readonly rain: THREE.LineSegments;
  private readonly speed: Float32Array;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.LineBasicMaterial;
  private nextLightning = 12;
  private flashSeq: { at: number; level: number }[] = [];
  private static readonly AREA = 34;
  private static readonly TOP = 14;

  constructor(
    scene: THREE.Object3D,
    drops: number,
    private readonly flash: THREE.DirectionalLight,
    private readonly hemi: THREE.HemisphereLight,
    private readonly sheltered: (x: number, z: number, y: number) => boolean,
    private readonly onLightning: (strength: number, delay: number) => void,
  ) {
    const positions = new Float32Array(drops * 6);
    this.speed = new Float32Array(drops);
    for (let i = 0; i < drops; i++) {
      const x = (Math.random() - 0.5) * Weather.AREA;
      const z = (Math.random() - 0.5) * Weather.AREA;
      const y = Math.random() * Weather.TOP;
      const len = 0.35 + Math.random() * 0.35;
      positions.set([x, y, z, x + 0.07, y + len, z], i * 6);
      this.speed[i] = 13 + Math.random() * 7;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0x9fb2c2, transparent: true, opacity: 0.26, depthWrite: false });
    this.rain = new THREE.LineSegments(this.geo, this.mat);
    this.rain.frustumCulled = false;
    scene.add(this.rain);
  }

  update(t: number, dt: number, cam: THREE.Vector3, hemiBase: number, flashScale = 1): void {
    const attr = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const a = attr.array as Float32Array;
    const half = Weather.AREA / 2;
    for (let i = 0; i < this.speed.length; i++) {
      const o = i * 6;
      const fall = this.speed[i] * dt;
      a[o + 1] -= fall;
      a[o + 4] -= fall;
      a[o] -= fall * 0.05;
      a[o + 3] -= fall * 0.05;
      // wrap drops that drifted out of the box around the camera
      const dx = a[o] - cam.x;
      const dz = a[o + 2] - cam.z;
      const out = dx < -half || dx > half || dz < -half || dz > half;
      // under a roof: hide the drop (respawn it) as soon as it reaches roof height
      const under = a[o + 1] < 3.4 && this.sheltered(a[o], a[o + 2], a[o + 1]);
      if (a[o + 1] < cam.y - 3 || out || under) {
        const len = a[o + 4] - a[o + 1];
        const x = cam.x + (Math.random() - 0.5) * Weather.AREA;
        const z = cam.z + (Math.random() - 0.5) * Weather.AREA;
        const y = cam.y + Weather.TOP * (0.5 + Math.random() * 0.5);
        a[o] = x;
        a[o + 1] = y;
        a[o + 2] = z;
        a[o + 3] = x + 0.07;
        a[o + 4] = y + len;
        a[o + 5] = z;
      }
    }
    attr.needsUpdate = true;

    // lightning
    if (t >= this.nextLightning) {
      const strength = 0.55 + Math.random() * 0.45;
      this.flashSeq = [
        { at: t, level: 2.4 * strength },
        { at: t + 0.07, level: 0.2 },
        { at: t + 0.15, level: 1.6 * strength },
        { at: t + 0.32, level: 0 },
      ];
      this.nextLightning = t + 18 + Math.random() * 30;
      if (flashScale > 0.05) this.onLightning(strength * Math.max(0.4, flashScale), 0.8 + (1 - strength) * 2.5);
    }
    let level = 0;
    for (const f of this.flashSeq) if (t >= f.at) level = f.level;
    level *= flashScale;
    const cur = this.flash.intensity;
    this.flash.intensity = level > cur ? level : cur + (level - cur) * Math.min(1, dt * 15);
    this.hemi.intensity = hemiBase + this.flash.intensity * 0.35;
  }

  /** True for a moment while lightning lights the sky (used by HUD/effects). */
  get flashing(): boolean {
    return this.flash.intensity > 0.3;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.rain.removeFromParent();
  }
}
