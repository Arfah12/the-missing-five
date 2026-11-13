import * as THREE from 'three';
import { WATCHER, type NetWatcher } from '@tmf/shared';
import { audio } from '../audio/AudioManager';

/**
 * Draws THE WATCHER from the server's frames: a too-tall, too-thin black
 * figure with two pale points for eyes. Plus the brief "silhouette" scares.
 */

interface Figure {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  eyes: THREE.MeshBasicMaterial;
}

export class WatcherView {
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];
  private readonly fig: Figure;
  private readonly ghost: Figure;
  private target: NetWatcher | null = null;
  private shown = false;
  private phase = 0;
  private fade = 0;
  private presenceTimer = 0;
  private ghostUntil = 0;
  private time = 0;

  constructor(private readonly scene: THREE.Object3D) {
    this.fig = this.build();
    this.ghost = this.build();
    scene.add(this.fig.root, this.ghost.root);
  }

  private build(): Figure {
    const black = new THREE.MeshBasicMaterial({ color: 0x010102 });
    const eyes = new THREE.MeshBasicMaterial({ color: 0xd9dccf, transparent: true, opacity: 0, fog: false });
    this.mats.push(black, eyes);
    const geo = <T extends THREE.BufferGeometry>(g: T) => (this.geos.push(g), g);
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const torso = new THREE.Mesh(geo(new THREE.CapsuleGeometry(0.19, 1.1, 4, 10)), black);
    torso.position.y = 1.7;
    torso.scale.z = 0.7;
    body.add(torso);
    const head = new THREE.Group();
    head.position.set(0, 2.42, 0);
    const skull = new THREE.Mesh(geo(new THREE.SphereGeometry(0.15, 12, 10)), black);
    skull.scale.set(0.9, 1.2, 0.9);
    head.add(skull);
    const eyeGeo = geo(new THREE.SphereGeometry(0.018, 6, 4));
    for (const x of [-0.05, 0.05]) {
      const e = new THREE.Mesh(eyeGeo, eyes);
      e.position.set(x, 0.02, -0.13);
      head.add(e);
    }
    body.add(head);
    const limb = (len: number, r: number, x: number, y: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const m = new THREE.Mesh(geo(new THREE.CapsuleGeometry(r, len, 3, 6)), black);
      m.position.y = -len / 2 - r;
      pivot.add(m);
      body.add(pivot);
      return pivot;
    };
    const armL = limb(1.3, 0.045, -0.27, 2.2);
    const armR = limb(1.3, 0.045, 0.27, 2.2);
    const legL = limb(1.0, 0.065, -0.1, 1.15);
    const legR = limb(1.0, 0.065, 0.1, 1.15);
    root.visible = false;
    root.traverse((o: THREE.Object3D) => {
      o.frustumCulled = false;
    });
    return { root, body, head, armL, armR, legL, legR, eyes };
  }

  /** Latest server state (null = gone). */
  setState(w: NetWatcher | null): void {
    this.target = w;
    if (w && !this.shown) {
      // appear in place, not sliding in from where it vanished
      this.fig.root.position.set(w.x, w.y, w.z);
      this.fig.root.rotation.y = w.yaw;
      this.fade = 0;
      this.shown = true;
    }
  }

  /** A figure standing in the fog for a moment (random scare). */
  showSilhouette(x: number, y: number, z: number, towards: { x: number; z: number }): void {
    const g = this.ghost.root;
    g.position.set(x, y, z);
    g.rotation.y = Math.atan2(-(towards.x - x), -(towards.z - z));
    g.visible = true;
    this.ghostUntil = this.time + 2.6;
  }

  /** Distance from (x, z) to the visible Watcher, or Infinity. */
  distanceTo(x: number, z: number): number {
    if (!this.shown || !this.target) return Number.POSITIVE_INFINITY;
    return Math.hypot(this.fig.root.position.x - x, this.fig.root.position.z - z);
  }

  get mode(): NetWatcher['mode'] | 'hidden' {
    return this.target?.mode ?? 'hidden';
  }

  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;
    const f = this.fig;
    const w = this.target;

    if (!w) {
      // the server says it's gone: fade out with a flicker
      if (this.shown) {
        this.fade -= dt * 2.5;
        f.root.visible = this.fade > 0 && Math.random() < 0.7;
        if (this.fade <= 0) {
          this.shown = false;
          f.root.visible = false;
        }
      }
    } else {
      this.fade = Math.min(1, this.fade + dt * (w.mode === 'disappear' ? -2.5 : 3));
      const disappearing = w.mode === 'disappear';
      f.root.visible = disappearing ? this.fade > 0 && Math.random() < 0.6 : this.fade > 0.05;
      // smooth towards the server position
      const k = 1 - Math.exp(-dt * (w.mode === 'chase' ? 14 : 8));
      const p = f.root.position;
      const moved = Math.hypot(w.x - p.x, w.z - p.z);
      p.x += (w.x - p.x) * k;
      p.y += (w.y - p.y) * k;
      p.z += (w.z - p.z) * k;
      let dy = w.yaw - f.root.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      f.root.rotation.y += dy * k;

      // limbs: still when watching, slow when stalking, frantic when chasing
      const speed = moved / Math.max(dt, 1e-3);
      const running = w.mode === 'chase' && !w.windup;
      this.phase += dt * (running ? 9 : w.mode === 'stalk' ? 3.2 : 0) * Math.min(1, speed + 0.2);
      const swing = running ? 0.9 : w.mode === 'stalk' ? 0.35 : 0;
      f.legL.rotation.x = Math.sin(this.phase) * swing;
      f.legR.rotation.x = -Math.sin(this.phase) * swing;
      f.armL.rotation.x = running ? -1.2 + Math.sin(this.phase) * 0.3 : -Math.sin(this.phase) * swing * 0.6;
      f.armR.rotation.x = running ? -1.2 - Math.sin(this.phase) * 0.3 : Math.sin(this.phase) * swing * 0.6;
      f.body.rotation.x = running ? -0.35 : 0;
      if (w.windup) {
        // the scream: arms out, shaking
        f.armL.rotation.z = -1.1 + (Math.random() - 0.5) * 0.2;
        f.armR.rotation.z = 1.1 + (Math.random() - 0.5) * 0.2;
        f.head.rotation.z = (Math.random() - 0.5) * 0.5;
      } else {
        f.armL.rotation.z = f.armR.rotation.z = 0;
        f.head.rotation.z = w.mode === 'observe' ? Math.sin(this.time * 0.6) * 0.4 : Math.sin(this.time * 2) * 0.05;
      }

      // eyes catch the light when you're close enough to see them
      const d = camera.position.distanceTo(p);
      f.eyes.opacity = d < 18 ? Math.min(0.9, (18 - d) / 10) * this.fade : 0;

      // breathing / drone while it is near
      this.presenceTimer -= dt;
      if (this.presenceTimer <= 0 && d < 25) {
        audio.presence(p.x, p.y + 1.6, p.z, Math.min(1, (25 - d) / 18));
        this.presenceTimer = 2.4;
      }
    }

    // silhouette scare: gone after a moment, or the instant you get close
    const g = this.ghost.root;
    if (g.visible) {
      const d = camera.position.distanceTo(g.position);
      if (this.time > this.ghostUntil || d < 9) g.visible = false;
      else this.ghost.eyes.opacity = 0.25;
    }
  }

  dispose(): void {
    this.fig.root.removeFromParent();
    this.ghost.root.removeFromParent();
    this.geos.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
    void this.scene;
  }
}

/** Used by tests / debug overlays. */
export const WATCHER_HEIGHT = WATCHER.height;
