import * as THREE from 'three';
import { STILT_HOUSE } from '@tmf/shared';
import { makeNoise, mulberry32 } from './textures';

/**
 * Procedural kampung props. Everything is built from primitives so the
 * world exists without external assets; GLB models can replace these
 * builders later without touching the scene code.
 */

/** Keeps track of GPU resources so a scene can be disposed completely. */
export class Disposer {
  private items = new Set<{ dispose(): void }>();
  track<T extends { dispose(): void }>(item: T): T {
    this.items.add(item);
    return item;
  }
  dispose(): void {
    this.items.forEach((i) => i.dispose());
    this.items.clear();
  }
}

export interface PropMaterials {
  planks: THREE.MeshStandardMaterial;
  planksDark: THREE.MeshStandardMaterial;
  zinc: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  void: THREE.MeshStandardMaterial;
  frond: THREE.MeshStandardMaterial;
  trunk: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  wire: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], shadows = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
}

/* ───────────────────────── Rumah kayu (stilt house) ───────────────────────── */

export interface HouseRefs {
  group: THREE.Group;
  /** Emissive window pane that can flicker (null if the house is dark). */
  windowGlow: THREE.MeshStandardMaterial | null;
  /** World-space position of the lit window (for a point light). */
  windowPos: THREE.Vector3 | null;
}

export function buildStiltHouse(d: Disposer, m: PropMaterials, opts: { litWindow: boolean; seed: number }): HouseRefs {
  const g = new THREE.Group();
  // Dimensions come from the shared spec so the collision shapes match.
  const H = STILT_HOUSE;
  const W = H.width;
  const D = H.depth;
  const STILT = H.stilt;
  const WALL = H.wall;
  const rand = mulberry32(opts.seed);

  // Stilts (tiang)
  const stiltGeo = d.track(new THREE.CylinderGeometry(0.11, 0.13, STILT, 7));
  for (const p of H.stilts) {
    const s = mesh(stiltGeo, m.wood);
    s.position.set(p.x, STILT / 2, p.z);
    s.rotation.z = (rand() - 0.5) * 0.04;
    g.add(s);
  }

  // Floor platform and walls
  const floor = mesh(d.track(new THREE.BoxGeometry(W + 0.3, 0.22, D + 0.3)), m.planksDark);
  floor.position.y = STILT;
  g.add(floor);
  const body = mesh(d.track(new THREE.BoxGeometry(W, WALL, D)), m.planks);
  body.position.y = STILT + WALL / 2 + 0.11;
  g.add(body);

  // Front (+z) openings: door + two windows (one may glow)
  const front = D / 2 + 0.02;
  const door = mesh(d.track(new THREE.PlaneGeometry(1.0, 2.0)), m.void, false);
  door.position.set(-0.4, STILT + 1.12, front);
  g.add(door);
  const doorFrame = mesh(d.track(new THREE.BoxGeometry(1.2, 2.15, 0.08)), m.wood);
  doorFrame.position.set(-0.4, STILT + 1.15, front - 0.03);
  g.add(doorFrame);

  let windowGlow: THREE.MeshStandardMaterial | null = null;
  let windowPos: THREE.Vector3 | null = null;
  const winGeo = d.track(new THREE.PlaneGeometry(1.0, 0.9));
  const frameGeo = d.track(new THREE.BoxGeometry(1.2, 1.1, 0.08));
  const shutterGeo = d.track(new THREE.BoxGeometry(0.5, 0.95, 0.05));
  for (const [i, x] of [-2.4, 1.6].entries()) {
    const lit = opts.litWindow && i === 1;
    let paneMat: THREE.Material = m.void;
    if (lit) {
      windowGlow = d.track(
        new THREE.MeshStandardMaterial({ color: 0x1a0d06, emissive: 0xff8a3c, emissiveIntensity: 0.6, roughness: 1 }),
      );
      paneMat = windowGlow;
    }
    const pane = mesh(winGeo, paneMat, false);
    pane.position.set(x, STILT + 1.45, front);
    g.add(pane);
    const frame = mesh(frameGeo, m.wood);
    frame.position.set(x, STILT + 1.45, front - 0.03);
    g.add(frame);
    if (lit) windowPos = new THREE.Vector3(x, STILT + 1.45, front + 0.4);
    // shutters: one hangs crooked
    const left = mesh(shutterGeo, m.planksDark);
    left.position.set(x - 0.78, STILT + 1.45, front + 0.05);
    left.rotation.y = 0.25;
    g.add(left);
    const right = mesh(shutterGeo, m.planksDark);
    right.position.set(x + 0.8, STILT + 1.3, front + 0.12);
    right.rotation.set(0.05, -0.6, i === 0 ? 0.35 : -0.05);
    g.add(right);
  }

  // Gable roof (zinc) along x
  const rise = 1.6;
  const half = D / 2 + 0.55;
  const slope = Math.atan2(rise, half);
  const panelLen = Math.hypot(rise, half);
  const roofGeo = d.track(new THREE.BoxGeometry(W + 1.0, 0.05, panelLen));
  const top = STILT + WALL + 0.22;
  for (const side of [1, -1]) {
    const panel = mesh(roofGeo, m.zinc);
    panel.position.set(0, top + rise / 2, (side * half) / 2);
    panel.rotation.x = side * slope;
    g.add(panel);
  }
  const ridge = mesh(d.track(new THREE.BoxGeometry(W + 1.05, 0.08, 0.25)), m.zinc);
  ridge.position.y = top + rise + 0.02;
  g.add(ridge);
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-D / 2, 0);
  gableShape.lineTo(D / 2, 0);
  gableShape.lineTo(0, rise - 0.05);
  gableShape.closePath();
  const gableGeo = d.track(new THREE.ShapeGeometry(gableShape));
  for (const side of [1, -1]) {
    const gable = mesh(gableGeo, m.planks);
    gable.position.set((side * W) / 2, top, 0);
    gable.rotation.y = side * (Math.PI / 2);
    g.add(gable);
  }

  // Front verandah (serambi) with railings and stairs
  const v = H.verandah;
  const ver = mesh(d.track(new THREE.BoxGeometry(v.hx * 2, 0.18, v.hz * 2)), m.planksDark);
  ver.position.set(v.x, STILT, v.z);
  g.add(ver);
  const railTop = STILT + 1.0;
  const postGeo = d.track(new THREE.BoxGeometry(0.1, 1.0, 0.1));
  const posts: [number, number][] = [
    ...H.railPosts.map((x): [number, number] => [x, H.railZ]),
    [v.x - v.hx + 0.05, v.z - v.hz + 0.05],
    [v.x + v.hx - 0.05, v.z - v.hz + 0.05],
  ];
  for (const [x, z] of posts) {
    const p = mesh(postGeo, m.wood);
    p.position.set(x, STILT + 0.55, z);
    g.add(p);
  }
  const railGeo = d.track(new THREE.BoxGeometry(1, 0.07, 0.07));
  const addRail = (x0: number, z0: number, x1: number, z1: number, sag: number) => {
    const r = mesh(railGeo, m.wood);
    const len = Math.hypot(x1 - x0, z1 - z0);
    r.scale.x = len;
    r.position.set((x0 + x1) / 2, railTop - sag, (z0 + z1) / 2);
    r.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    r.rotation.z = sag * 0.6;
    g.add(r);
  };
  const [ra, rb, rc, rd] = H.railPosts;
  addRail(ra, H.railZ, rb, H.railZ, 0.03);
  addRail(rc, H.railZ, rd, H.railZ, 0.0);
  addRail(v.x - v.hx + 0.05, H.railZ, v.x - v.hx + 0.05, v.z - v.hz + 0.05, 0.05);
  addRail(v.x + v.hx - 0.05, H.railZ, v.x + v.hx - 0.05, v.z - v.hz + 0.05, 0.0);
  // Stairs: visible treads plus side stringers down to the ground
  const stepGeo = d.track(new THREE.BoxGeometry(H.stepSize.hx * 2, 0.07, H.stepSize.hz * 2 + 0.02));
  for (const st of H.steps) {
    const step = mesh(stepGeo, m.planksDark);
    step.position.set(st.x, st.top - 0.035, st.z);
    g.add(step);
  }
  const first = H.steps[0];
  const last = H.steps[H.steps.length - 1];
  const run = Math.hypot(last.z - first.z + 0.5, first.top);
  const stringerGeo = d.track(new THREE.BoxGeometry(0.06, 0.2, run));
  for (const sx of [-1, 1]) {
    const sg = mesh(stringerGeo, m.wood);
    sg.position.set(first.x + sx * (H.stepSize.hx + 0.03), first.top / 2, (first.z + last.z) / 2 + 0.1);
    sg.rotation.x = Math.atan2(first.top, last.z - first.z + 0.5);
    g.add(sg);
  }

  // Junk under the house
  const crateGeo = d.track(new THREE.BoxGeometry(0.6, 0.45, 0.6));
  for (const cr of H.crates) {
    const c = mesh(crateGeo, m.planksDark);
    c.position.set(cr.x, 0.225, cr.z);
    c.rotation.y = cr.yaw;
    g.add(c);
  }
  const tin = mesh(d.track(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 12)), m.metal);
  tin.position.set(H.tin.x, 0.3, H.tin.z);
  g.add(tin);

  return { group: g, windowGlow, windowPos };
}

/* ───────────────────────── Coconut palm ───────────────────────── */

export function buildPalm(d: Disposer, m: PropMaterials, seed: number, height = 7): THREE.Group {
  const rand = mulberry32(seed);
  const g = new THREE.Group();
  const lean = new THREE.Vector3((rand() - 0.5) * 2.2, 0, (rand() - 0.5) * 1.6);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean.x * 0.25, height * 0.35, lean.z * 0.25),
    new THREE.Vector3(lean.x * 0.7, height * 0.7, lean.z * 0.7),
    new THREE.Vector3(lean.x, height, lean.z),
  ]);
  const trunkGeo = d.track(new THREE.TubeGeometry(curve, 24, 0.17, 7, false));
  g.add(mesh(trunkGeo, m.trunk));

  const crown = new THREE.Group();
  crown.position.copy(curve.getPoint(1));
  const frondGeo = d.track(new THREE.PlaneGeometry(0.9, 3.4, 1, 6));
  // bend the frond downwards along its length
  const pos = frondGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + 1.7; // 0..3.4 from the base
    pos.setZ(i, -0.12 * y * y);
  }
  frondGeo.computeVertexNormals();
  frondGeo.translate(0, 1.7, 0);
  const count = 9 + Math.floor(rand() * 4);
  for (let i = 0; i < count; i++) {
    const f = mesh(frondGeo, m.frond);
    const yaw = (i / count) * Math.PI * 2 + rand() * 0.4;
    f.rotation.set(0, yaw, 0, 'YXZ');
    f.rotateX(-(0.9 + rand() * 0.6));
    crown.add(f);
  }
  const nuts = mesh(d.track(new THREE.SphereGeometry(0.32, 8, 6)), m.trunk);
  nuts.scale.set(1, 0.7, 1);
  crown.add(nuts);
  g.add(crown);
  g.userData.crown = crown;
  return g;
}

/* ───────────────────────── Utility poles and sagging wires ───────────────────────── */

export function buildPoles(d: Disposer, m: PropMaterials, tops: THREE.Vector3[]): THREE.Group {
  const g = new THREE.Group();
  const poleGeo = d.track(new THREE.CylinderGeometry(0.1, 0.14, 7.6, 7));
  const armGeo = d.track(new THREE.BoxGeometry(1.5, 0.1, 0.1));
  for (const t of tops) {
    const p = mesh(poleGeo, m.wood);
    p.position.set(t.x, 3.8, t.z);
    g.add(p);
    const arm = mesh(armGeo, m.wood);
    arm.position.set(t.x, 7.2, t.z);
    g.add(arm);
  }
  // two sagging wires between consecutive poles
  for (let i = 0; i < tops.length - 1; i++) {
    for (const off of [-0.65, 0.65]) {
      const a = new THREE.Vector3(tops[i].x + off, 7.25, tops[i].z);
      const b = new THREE.Vector3(tops[i + 1].x + off, 7.25, tops[i + 1].z);
      const pts: THREE.Vector3[] = [];
      for (let s = 0; s <= 12; s++) {
        const t = s / 12;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * 0.7;
        pts.push(p);
      }
      const wire = mesh(d.track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.012, 3, false)), m.wire, false);
      g.add(wire);
    }
  }
  return g;
}

/* ───────────────────────── Street lamp ───────────────────────── */

export interface LampRefs {
  group: THREE.Group;
  bulb: THREE.MeshStandardMaterial;
  /** World-space bulb position (lights and glow are placed here). */
  bulbPos: THREE.Vector3;
}

export function buildStreetLamp(d: Disposer, m: PropMaterials, base: THREE.Vector3, towardsX: number): LampRefs {
  const g = new THREE.Group();
  const arm = mesh(d.track(new THREE.BoxGeometry(1.7, 0.08, 0.08)), m.metal);
  arm.position.set(base.x + (towardsX * 1.7) / 2, 6.3, base.z);
  g.add(arm);
  const head = mesh(d.track(new THREE.CylinderGeometry(0.12, 0.32, 0.22, 10, 1, true)), m.metal);
  const bulbPos = new THREE.Vector3(base.x + towardsX * 1.7, 6.14, base.z);
  head.position.copy(bulbPos).add(new THREE.Vector3(0, 0.08, 0));
  g.add(head);
  const bulb = d.track(new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffc27a, emissiveIntensity: 2.2 }));
  const bulbMesh = mesh(d.track(new THREE.SphereGeometry(0.09, 10, 8)), bulb, false);
  bulbMesh.position.copy(bulbPos);
  g.add(bulbMesh);
  return { group: g, bulb, bulbPos };
}

/* ───────────────────────── Welcome sign ───────────────────────── */

export function buildSign(d: Disposer, m: PropMaterials, face: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const postGeo = d.track(new THREE.BoxGeometry(0.13, 2.2, 0.13));
  for (const x of [-1.15, 1.15]) {
    const p = mesh(postGeo, m.wood);
    p.position.set(x, 1.1, 0);
    g.add(p);
  }
  const boardMat = d.track(new THREE.MeshStandardMaterial({ map: face, roughness: 0.95 }));
  // BoxGeometry face order: +x, -x, +y, -y, +z (front), -z
  const board = mesh(d.track(new THREE.BoxGeometry(2.6, 1.14, 0.07)), [m.wood, m.wood, m.wood, m.wood, boardMat, m.wood]);
  board.position.set(0, 1.62, 0.07);
  board.rotation.z = -0.045;
  g.add(board);
  return g;
}

/* ───────────────────────── Jungle backdrop (instanced) ───────────────────────── */

export function buildJungle(
  d: Disposer,
  m: PropMaterials,
  count: number,
  spots: (rand: () => number) => { x: number; z: number },
  seed = 99,
): THREE.Group {
  const rand = mulberry32(seed);
  const g = new THREE.Group();
  const canopyGeo = d.track(new THREE.IcosahedronGeometry(1, 2));
  // Lumpy, organic canopy: displace the sphere once.
  const n = makeNoise(seed, 8);
  const p = canopyGeo.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + n(v.x * 2 + 4, v.z * 2 + v.y * 3 + 4) * 0.28;
    v.multiplyScalar(k);
    p.setXYZ(i, v.x, v.y * 0.8, v.z);
  }
  canopyGeo.computeVertexNormals();
  const trunkGeo = d.track(new THREE.CylinderGeometry(0.12, 0.22, 1, 6));
  trunkGeo.translate(0, 0.5, 0);

  const canopies = new THREE.InstancedMesh(canopyGeo, m.foliage, count * 2);
  const trunks = new THREE.InstancedMesh(trunkGeo, m.trunk, count);
  canopies.castShadow = false;
  trunks.castShadow = false;
  canopies.receiveShadow = true;
  const mat4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const { x, z } = spots(rand);
    const h = 5 + rand() * 9;
    mat4.compose(new THREE.Vector3(x, 0, z), q.identity(), new THREE.Vector3(1, h, 1));
    trunks.setMatrixAt(i, mat4);
    for (let j = 0; j < 2; j++) {
      const s = 2 + rand() * 3.2;
      e.set(rand() * 0.5, rand() * Math.PI * 2, rand() * 0.5);
      q.setFromEuler(e);
      mat4.compose(new THREE.Vector3(x + (rand() - 0.5) * 2, h + j * s * 0.6 - 0.5, z + (rand() - 0.5) * 2), q, new THREE.Vector3(s, s, s));
      canopies.setMatrixAt(i * 2 + j, mat4);
      color.setHSL(0.27 + rand() * 0.06, 0.35, 0.07 + rand() * 0.05);
      canopies.setColorAt(i * 2 + j, color);
    }
  }
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  trunks.instanceMatrix.needsUpdate = true;
  d.track(canopies);
  d.track(trunks);
  g.add(trunks, canopies);
  return g;
}

/** Thin grass blades scattered along the road edges (instanced). */
export function buildGrass(d: Disposer, count: number, spots: (rand: () => number) => { x: number; z: number }): THREE.InstancedMesh {
  const rand = mulberry32(4242);
  const geo = d.track(new THREE.ConeGeometry(0.04, 0.55, 3, 1, true));
  geo.translate(0, 0.27, 0);
  const mat = d.track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide }));
  const grass = new THREE.InstancedMesh(geo, mat, count);
  const mat4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const { x, z } = spots(rand);
    e.set((rand() - 0.5) * 0.6, rand() * Math.PI, (rand() - 0.5) * 0.6);
    q.setFromEuler(e);
    const s = 0.6 + rand() * 1.1;
    mat4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * (0.8 + rand() * 0.8), s));
    grass.setMatrixAt(i, mat4);
    color.setHSL(0.22 + rand() * 0.08, 0.35, 0.1 + rand() * 0.07);
    grass.setColorAt(i, color);
  }
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  grass.receiveShadow = true;
  return d.track(grass);
}

/* ───────────────────────── The Watcher (menu teaser) ───────────────────────── */

export function buildWatcher(d: Disposer): THREE.Group {
  const g = new THREE.Group();
  const mat = d.track(new THREE.MeshBasicMaterial({ color: 0x020203 }));
  const torso = new THREE.Mesh(d.track(new THREE.CapsuleGeometry(0.19, 1.05, 4, 10)), mat);
  torso.position.y = 1.62;
  torso.scale.z = 0.7;
  const head = new THREE.Mesh(d.track(new THREE.SphereGeometry(0.15, 12, 10)), mat);
  head.position.set(0.03, 2.42, 0);
  head.scale.set(0.9, 1.15, 0.9);
  head.name = 'head';
  const armGeo = d.track(new THREE.CapsuleGeometry(0.045, 1.25, 3, 6));
  const legGeo = d.track(new THREE.CapsuleGeometry(0.065, 0.95, 3, 6));
  const parts: THREE.Mesh[] = [torso, head];
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, mat);
    arm.position.set(side * 0.26, 1.35, 0);
    arm.rotation.z = side * 0.06;
    const leg = new THREE.Mesh(legGeo, mat);
    leg.position.set(side * 0.1, 0.55, 0);
    parts.push(arm, leg);
  }
  g.add(...parts);
  g.visible = false;
  return g;
}
