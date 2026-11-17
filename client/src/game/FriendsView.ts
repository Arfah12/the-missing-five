import * as THREE from 'three';
import { ITEM_SPAWNS, type WorldSnapshot } from '@tmf/shared';

type FriendId = 'alya' | 'danish' | 'mira' | 'adam' | 'sofia';

interface FriendSpec {
  id: FriendId;
  name: string;
  bag: number;
  skirt: boolean;
  hair: number;
}

const FRIENDS: FriendSpec[] = [
  { id: 'alya', name: 'Alya', bag: 0xc47b9a, skirt: true, hair: 0x171217 },
  { id: 'danish', name: 'Danish', bag: 0x344e38, skirt: false, hair: 0x171717 },
  { id: 'mira', name: 'Mira', bag: 0x4b3657, skirt: true, hair: 0x171217 },
  { id: 'adam', name: 'Adam', bag: 0x252326, skirt: false, hair: 0x171717 },
  { id: 'sofia', name: 'Sofia', bag: 0xb18a3d, skirt: true, hair: 0x171217 },
];

interface FriendEntry {
  spec: FriendSpec;
  root: THREE.Group;
  phase: number;
}

const cluePosition = new Map(
  ITEM_SPAWNS.filter((item) => item.id.startsWith('belonging-')).map((item) => [item.id.replace('belonging-', ''), item]),
);

/**
 * Procedural stand-ins for the five children. They are intentionally built
 * from primitives so the game can ship and be tested before GLB assets exist.
 * Each child appears after the matching belonging is recorded in the journal.
 */
export class FriendsView {
  private readonly entries = new Map<FriendId, FriendEntry>();
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];

  constructor(scene: THREE.Object3D) {
    for (const spec of FRIENDS) {
      const root = this.build(spec);
      root.visible = false;
      const pos = cluePosition.get(spec.id);
      if (pos) root.position.set(pos.x + 0.9, pos.y, pos.z + 0.8);
      scene.add(root);
      this.entries.set(spec.id, { spec, root, phase: Math.random() * Math.PI * 2 });
    }
  }

  private material(color: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...extra });
    this.mats.push(mat);
    return mat;
  }

  private geo<T extends THREE.BufferGeometry>(value: T): T {
    this.geos.push(value);
    return value;
  }

  private build(spec: FriendSpec): THREE.Group {
    const root = new THREE.Group();
    const skin = this.material(0xb77d63);
    const uniform = this.material(0xe4e1d7);
    const navy = this.material(0x17233d);
    const hair = this.material(spec.hair);
    const bag = this.material(spec.bag);
    const shoes = this.material(0x111217);
    const eye = this.material(0x080707, { emissive: 0x441d1d, emissiveIntensity: 0.8 });

    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], scale?: [number, number, number]) => {
      const mesh = new THREE.Mesh(this.geo(geometry), material);
      mesh.position.set(...position);
      if (scale) mesh.scale.set(...scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      return mesh;
    };

    add(new THREE.CapsuleGeometry(0.18, 0.42, 4, 8), uniform, [0, 1.18, 0]);
    add(new THREE.SphereGeometry(0.18, 12, 10), skin, [0, 1.62, 0]);
    add(new THREE.SphereGeometry(0.19, 12, 10), hair, [0, 1.73, 0], [1, 0.72, 0.95]);
    add(new THREE.BoxGeometry(0.11, 0.25, 0.08), navy, [-0.11, 1.03, 0]);
    add(new THREE.BoxGeometry(0.11, 0.25, 0.08), navy, [0.11, 1.03, 0]);

    if (spec.skirt) {
      add(new THREE.ConeGeometry(0.27, 0.35, 8), navy, [0, 0.83, 0]);
    } else {
      add(new THREE.BoxGeometry(0.3, 0.32, 0.22), navy, [0, 0.83, 0]);
    }
    add(new THREE.CapsuleGeometry(0.045, 0.34, 3, 6), skin, [-0.22, 1.18, 0]);
    add(new THREE.CapsuleGeometry(0.045, 0.34, 3, 6), skin, [0.22, 1.18, 0]);
    add(new THREE.CapsuleGeometry(0.055, 0.34, 3, 6), skin, [-0.1, 0.52, 0]);
    add(new THREE.CapsuleGeometry(0.055, 0.34, 3, 6), skin, [0.1, 0.52, 0]);
    add(new THREE.BoxGeometry(0.12, 0.06, 0.23), shoes, [-0.1, 0.3, -0.035]);
    add(new THREE.BoxGeometry(0.12, 0.06, 0.23), shoes, [0.1, 0.3, -0.035]);
    add(new THREE.BoxGeometry(0.34, 0.38, 0.12), bag, [0, 1.02, 0.16]);

    for (const x of [-0.065, 0.065]) add(new THREE.SphereGeometry(0.018, 6, 4), eye, [x, 1.64, -0.17]);
    return root;
  }

  sync(world: WorldSnapshot): void {
    const rescued = new Set(world.rescued);
    for (const entry of this.entries.values()) entry.root.visible = !rescued.has(entry.spec.id);
  }

  targets(): { id: string; name: string; x: number; y: number; z: number }[] {
    return [...this.entries.values()]
      .filter((entry) => entry.root.visible)
      .map((entry) => ({ id: `child:${entry.spec.id}`, name: entry.spec.name, x: entry.root.position.x, y: entry.root.position.y + 1, z: entry.root.position.z }));
  }

  update(time: number, camera: THREE.Camera): void {
    for (const entry of this.entries.values()) {
      if (!entry.root.visible) continue;
      entry.root.position.y = (cluePosition.get(entry.spec.id)?.y ?? 0) + Math.sin(time * 1.4 + entry.phase) * 0.025;
      entry.root.rotation.y = Math.atan2(camera.position.x - entry.root.position.x, camera.position.z - entry.root.position.z);
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) entry.root.removeFromParent();
    this.geos.forEach((geometry) => geometry.dispose());
    this.mats.forEach((material) => material.dispose());
  }
}
