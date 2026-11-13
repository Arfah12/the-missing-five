import * as THREE from 'three';
import type { ItemType, WorldItem } from '@tmf/shared';

/**
 * Draws the items lying around the village (pages, batteries, keys…) with
 * a faint glint so they can be found in the dark without a big glowing
 * marker.
 */

interface Entry {
  group: THREE.Group;
  glint: THREE.Sprite;
  phase: number;
}

function glintTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,248,230,1)');
    g.addColorStop(0.25, 'rgba(255,240,210,0.45)');
    g.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}

export class ItemsView {
  private readonly group = new THREE.Group();
  private readonly entries = new Map<string, Entry>();
  private readonly geos: Record<string, THREE.BufferGeometry>;
  private readonly mats: Record<string, THREE.Material>;
  private readonly glintTex = glintTexture();
  private readonly glintMat: THREE.SpriteMaterial;
  private highlighted: string | null = null;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.geos = {
      battery: new THREE.CylinderGeometry(0.022, 0.022, 0.1, 10),
      key: new THREE.BoxGeometry(0.11, 0.01, 0.025),
      keyRing: new THREE.TorusGeometry(0.022, 0.006, 6, 12),
      crowbar: new THREE.BoxGeometry(0.75, 0.022, 0.03),
      paper: new THREE.BoxGeometry(0.2, 0.004, 0.27),
      photo: new THREE.BoxGeometry(0.13, 0.003, 0.09),
      cassette: new THREE.BoxGeometry(0.1, 0.017, 0.064),
      clip: new THREE.BoxGeometry(0.06, 0.012, 0.02),
      sandal: new THREE.BoxGeometry(0.09, 0.02, 0.22),
      doll: new THREE.CapsuleGeometry(0.05, 0.14, 4, 8),
      car: new THREE.BoxGeometry(0.12, 0.05, 0.06),
      ribbon: new THREE.TorusGeometry(0.05, 0.012, 6, 16),
    };
    const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
    this.mats = {
      battery: std(0x2a2a2a, { metalness: 0.5 }),
      key: std(0x8a7444, { metalness: 0.8, roughness: 0.35 }),
      crowbar: std(0x3a2a20, { metalness: 0.7, roughness: 0.5 }),
      paper: std(0xd8d0b8, { roughness: 1 }),
      photo: std(0xbdb6a2, { roughness: 0.6 }),
      cassette: std(0x16161a, { roughness: 0.4 }),
      clip: std(0xd27fa0),
      sandal: std(0x2f5f86),
      doll: std(0xb88a5c, { roughness: 1 }),
      car: std(0x9a1f1a, { metalness: 0.6, roughness: 0.4 }),
      ribbon: std(0xc42020),
    };
    this.glintMat = new THREE.SpriteMaterial({ map: this.glintTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 });
  }

  private build(it: WorldItem): THREE.Group {
    const g = new THREE.Group();
    const add = (geo: string, mat: string, rot?: [number, number, number], pos?: [number, number, number]) => {
      const m = new THREE.Mesh(this.geos[geo], this.mats[mat]);
      if (rot) m.rotation.set(...rot);
      if (pos) m.position.set(...pos);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    const kind: ItemType = it.type;
    switch (kind) {
      case 'battery':
        add('battery', 'battery', [0, 0, Math.PI / 2], [0, 0.022, 0]);
        break;
      case 'key':
        add('key', 'key', undefined, [0, 0.006, 0]);
        add('keyRing', 'key', [Math.PI / 2, 0, 0], [-0.07, 0.006, 0]);
        break;
      case 'crowbar':
        add('crowbar', 'crowbar', [0, 0.4, 0], [0, 0.012, 0]);
        break;
      case 'diary':
      case 'document':
        add('paper', 'paper', [0, Math.random(), 0], [0, 0.003, 0]);
        break;
      case 'photo':
        add('photo', 'photo', [0, Math.random(), 0], [0, 0.002, 0]);
        break;
      case 'cassette':
        add('cassette', 'cassette', [0, Math.random(), 0], [0, 0.009, 0]);
        break;
      case 'belonging': {
        const which = it.id.replace('belonging-', '');
        if (which === 'alya') add('clip', 'clip', undefined, [0, 0.006, 0]);
        else if (which === 'danish') add('sandal', 'sandal', [0, 0.5, 0], [0, 0.01, 0]);
        else if (which === 'mira') add('doll', 'doll', [Math.PI / 2, 0, 0.3], [0, 0.05, 0]);
        else if (which === 'adam') add('car', 'car', [0, 0.8, 0], [0, 0.025, 0]);
        else add('ribbon', 'ribbon', [Math.PI / 2, 0, 0], [0, 0.012, 0]);
        break;
      }
    }
    return g;
  }

  /** Make the meshes match the server's item list. */
  sync(items: WorldItem[]): void {
    const seen = new Set<string>();
    for (const it of items) {
      seen.add(it.id);
      let e = this.entries.get(it.id);
      if (!e) {
        const group = this.build(it);
        const glint = new THREE.Sprite(this.glintMat);
        glint.scale.set(0.18, 0.18, 1);
        glint.position.y = 0.06;
        group.add(glint);
        this.group.add(group);
        e = { group, glint, phase: Math.random() * 10 };
        this.entries.set(it.id, e);
      }
      e.group.position.set(it.x, it.y, it.z);
    }
    for (const [id, e] of this.entries) {
      if (seen.has(id)) continue;
      e.group.removeFromParent();
      this.entries.delete(id);
    }
  }

  /** The item the player is looking at gets a stronger glint. */
  highlight(id: string | null): void {
    this.highlighted = id;
  }

  update(t: number, camera: THREE.Camera): void {
    for (const [id, e] of this.entries) {
      const d = e.group.position.distanceTo(camera.position);
      const near = d < 9;
      e.glint.visible = near;
      if (!near) continue;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + e.phase);
      const s = id === this.highlighted ? 0.32 : 0.12 + pulse * 0.08;
      e.glint.scale.set(s, s, 1);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    Object.values(this.geos).forEach((g) => g.dispose());
    Object.values(this.mats).forEach((m) => m.dispose());
    this.glintMat.dispose();
    this.glintTex.dispose();
  }
}
