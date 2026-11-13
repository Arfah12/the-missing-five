import * as THREE from 'three';
import {
  CHAMBER,
  CHIEF_HOUSE,
  GIANT_TREE,
  HALL,
  HUT,
  LOW_WALL,
  SCHOOL,
  STOR,
  TUNNEL,
  WELL,
  mulberry32,
  type PropPlacement,
} from '@tmf/shared';
import type { WorldMaterials } from './buildings';
import type { Disposer } from './props';

/**
 * Phase 4 buildings: school, balai raya, chief's house, storeroom, forest
 * hut, wells, the giant fig tree, forest trees and the tunnel complex.
 * Sizes come from the shared specs so they match the collision boxes.
 */

export interface KampungMaterials extends WorldMaterials {
  schoolWall: THREE.MeshStandardMaterial;
  schoolInside: THREE.MeshStandardMaterial;
  board2: THREE.MeshStandardMaterial;
  board3: THREE.MeshStandardMaterial;
  boardOffice: THREE.MeshStandardMaterial;
  schoolSign: THREE.MeshStandardMaterial;
  warningSign: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  tunnelWall: THREE.MeshStandardMaterial;
  tunnelFloor: THREE.MeshStandardMaterial;
  drawing: THREE.MeshStandardMaterial;
  cloth: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
}

function box(d: Disposer, w: number, h: number, depth: number, mat: THREE.Material | THREE.Material[], shadows = true): THREE.Mesh {
  const m = new THREE.Mesh(d.track(new THREE.BoxGeometry(w, h, depth)), mat);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

/** Box spanning [x±hx, y0…y1, z±hz]. */
function span(d: Disposer, mat: THREE.Material | THREE.Material[], x: number, z: number, hx: number, hz: number, y0: number, y1: number, shadows = true) {
  const m = box(d, hx * 2, y1 - y0, hz * 2, mat, shadows);
  m.position.set(x, (y0 + y1) / 2, z);
  return m;
}

function plane(d: Disposer, mat: THREE.Material, w: number, h: number): THREE.Mesh {
  const m = new THREE.Mesh(d.track(new THREE.PlaneGeometry(w, h)), mat);
  m.receiveShadow = true;
  return m;
}

/** Corrugated zinc roof sloping down towards +z. */
function roof(d: Disposer, m: KampungMaterials, w: number, depth: number, y: number, tilt = 0.12): THREE.Mesh {
  const r = box(d, w, 0.05, depth, m.zinc);
  r.position.y = y;
  r.rotation.x = tilt;
  return r;
}

/* ───────────────────────── School ───────────────────────── */

export interface SchoolRefs {
  group: THREE.Group;
  /** Ceiling lamp positions (lit when the power comes back in Phase 5). */
  lamps: THREE.Vector3[];
  lampMaterial: THREE.MeshStandardMaterial;
}

export function buildSchool(d: Disposer, m: KampungMaterials): SchoolRefs {
  const S = SCHOOL;
  const g = new THREE.Group();
  const hw = S.width / 2;
  const back = -S.classDepth / 2;
  const front = S.classDepth / 2;
  const t = S.wallT / 2;
  // slab
  g.add(span(d, m.concrete, 0, (back + front + S.corridor) / 2, hw + 0.2, (S.classDepth + S.corridor) / 2 + 0.2, -0.4, S.slabTop, false));
  // floors
  const floor = plane(d, m.tiles, S.width, S.classDepth);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, S.slabTop + 0.005, 0);
  g.add(floor);

  // walls: outside face painted, inside face pale
  const faces = (outside: string) =>
    (['+x', '-x', '+y', '-y', '+z', '-z'] as const).map((f) => (f === outside ? m.schoolWall : f === '+y' || f === '-y' ? m.concrete : m.schoolInside));
  const wall = (x: number, z: number, hx: number, hz: number, y0: number, y1: number, outside: string) => {
    const w = box(d, hx * 2, y1 - y0, hz * 2, faces(outside));
    w.position.set(x, (y0 + y1) / 2, z);
    g.add(w);
  };
  wall(0, back + t, hw, t, S.slabTop, S.wallTop, '-z');
  wall(-hw + t, 0, t, S.classDepth / 2, S.slabTop, S.wallTop, '-x');
  wall(hw - t, 0, t, S.classDepth / 2, S.slabTop, S.wallTop, '+x');
  wall(-4, 0, t, S.classDepth / 2 - S.wallT, S.slabTop, S.wallTop, 'none');
  wall(4, 0, t, S.classDepth / 2 - S.wallT, S.slabTop, S.wallTop, 'none');
  for (const c of S.classes) {
    const d0 = c + S.doorOffset - S.doorHalf;
    const d1 = c + S.doorOffset + S.doorHalf;
    wall((c - 4 + d0) / 2, front - t, (d0 - c + 4) / 2, t, S.slabTop, S.wallTop, '+z');
    wall((d1 + c + 4) / 2, front - t, (c + 4 - d1) / 2, t, S.slabTop, S.wallTop, '+z');
    wall(c + S.doorOffset, front - t, S.doorHalf, t, S.doorTop, S.wallTop, '+z');
    // louvred windows (nako) on the front wall
    for (const wx of [c - 2.6, c - 0.4]) {
      const win = box(d, 1.6, 1.2, 0.06, m.glass, false);
      win.position.set(wx, 1.9, front + 0.01);
      g.add(win);
      for (let i = 0; i < 6; i++) {
        const slat = box(d, 1.55, 0.03, 0.12, m.glass, false);
        slat.position.set(wx, 1.38 + i * 0.2, front + 0.06);
        slat.rotation.x = 0.6 + (i === 2 ? 0.8 : 0);
        g.add(slat);
      }
    }
  }
  // ceiling inside
  const ceiling = plane(d, m.schoolInside, S.width, S.classDepth);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, S.wallTop - 0.02, 0);
  g.add(ceiling);
  // corridor roof and posts
  g.add(roof(d, m, S.width + 1.2, S.classDepth + S.corridor + 1.2, S.wallTop + 0.35, 0.1));
  for (const x of S.postXs) g.add(span(d, m.concrete, x, front + S.corridor - 0.15, 0.1, 0.1, S.slabTop, S.wallTop + 0.3));
  // corridor railing (low wall) between posts, leaving a gap in front of each door
  for (let i = 0; i < S.postXs.length - 1; i++) {
    const a = S.postXs[i];
    const b = S.postXs[i + 1];
    const mid = (a + b) / 2;
    if (S.classes.some((c) => Math.abs(c + S.doorOffset - mid) < 2.1)) continue;
    g.add(span(d, m.schoolWall, mid, front + S.corridor - 0.15, (b - a) / 2 - 0.1, 0.06, S.slabTop, S.slabTop + 0.75));
  }

  // furniture
  const deskTop = new THREE.BoxGeometry(S.desk.hx * 2, 0.04, S.desk.hz * 2);
  d.track(deskTop);
  const legGeo = d.track(new THREE.BoxGeometry(0.04, S.desk.top - S.slabTop - 0.04, 0.04));
  const chairGeo = d.track(new THREE.BoxGeometry(0.38, 0.04, 0.36));
  const rand = mulberry32(17);
  for (const [ci, c] of S.classes.slice(1).entries()) {
    for (const dx of S.deskCols)
      for (const dz of S.deskRows) {
        const top = new THREE.Mesh(deskTop, m.planks);
        top.position.set(c + dx, S.desk.top - 0.02, dz);
        top.castShadow = top.receiveShadow = true;
        g.add(top);
        for (const lx of [-1, 1])
          for (const lz of [-1, 1]) {
            const leg = new THREE.Mesh(legGeo, m.metal);
            leg.position.set(c + dx + lx * (S.desk.hx - 0.04), (S.slabTop + S.desk.top) / 2 - 0.02, dz + lz * (S.desk.hz - 0.04));
            g.add(leg);
          }
        // chair (some knocked over)
        const chair = new THREE.Mesh(chairGeo, m.planks);
        const fallen = rand() < 0.2;
        chair.position.set(c + dx + (rand() - 0.5) * 0.1, fallen ? S.slabTop + 0.18 : S.slabTop + 0.44, dz + 0.42);
        if (fallen) chair.rotation.set(Math.PI / 2, rand() * 3, 0);
        g.add(chair);
      }
    const td = S.teacherDesk;
    g.add(span(d, m.planksDark, c, td.z, td.hx, td.hz, S.slabTop, td.top));
    // blackboard on the back wall
    const board = plane(d, ci === 0 ? m.board2 : m.board3, 3.2, 1.2);
    board.position.set(c, 2.1, back + S.wallT + 0.01);
    g.add(board);
  }
  // Bilik Guru
  const o = S.classes[0];
  g.add(span(d, m.planksDark, o - 1.5, -1.4, 0.75, 0.45, S.slabTop, 1.05));
  g.add(span(d, m.planksDark, o + 1.4, 0.4, 0.75, 0.45, S.slabTop, 1.05));
  g.add(span(d, m.iron, o - 3.4, -2.6, 0.4, 0.3, S.slabTop, 2.2));
  const office = plane(d, m.boardOffice, 2.2, 0.85);
  office.position.set(o + 1, 2.0, back + S.wallT + 0.01);
  g.add(office);
  const poster = plane(d, m.poster, 0.5, 0.67);
  poster.position.set(o - 1, 1.7, back + S.wallT + 0.01);
  g.add(poster);

  // ceiling lamps (fluorescent tubes), dark until the power is restored
  const lampMaterial = d.track(new THREE.MeshStandardMaterial({ color: 0x8a8d84, emissive: 0xdff0ff, emissiveIntensity: 0, roughness: 0.4 }));
  const tubeGeo = d.track(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8));
  tubeGeo.rotateZ(Math.PI / 2);
  const lamps: THREE.Vector3[] = [];
  for (const c of S.classes) {
    const p = new THREE.Vector3(c, S.wallTop - 0.1, 0);
    const tube = new THREE.Mesh(tubeGeo, lampMaterial);
    tube.position.copy(p);
    g.add(tube);
    lamps.push(p);
  }
  // fuse box on the corridor wall (used by the electricity puzzle)
  g.add(span(d, m.iron, hw - 0.9, front + 0.1, 0.25, 0.08, 1.3, 1.9));
  return { group: g, lamps, lampMaterial };
}

/* ───────────────────────── Balai raya ───────────────────────── */

export function buildHall(d: Disposer, m: KampungMaterials): THREE.Group {
  const H = HALL;
  const g = new THREE.Group();
  g.add(span(d, m.concrete, 0, 0, H.hx + 0.3, H.hz + 0.3, -0.3, H.slabTop, false));
  for (const x of H.pillarXs) for (const z of [-H.hz, H.hz]) g.add(span(d, m.concrete, x, z, 0.18, 0.18, H.slabTop, H.roofY));
  g.add(span(d, m.planksDark, 0, (H.stage.z0 + H.stage.z1) / 2, H.hx - 0.4, (H.stage.z1 - H.stage.z0) / 2, H.slabTop, H.stage.top));
  g.add(span(d, m.planksDark, 0, H.stageStep.z, H.stageStep.hx, H.stageStep.hz, H.slabTop, H.stageStep.top));
  // gable roof along x
  for (const s of [1, -1]) {
    const panel = box(d, H.hx * 2 + 1.4, 0.05, H.hz + 1.3, m.zinc);
    panel.position.set(0, H.roofY + 0.75, (s * (H.hz + 1.3)) / 2);
    panel.rotation.x = s * 0.32;
    g.add(panel);
  }
  // rows of folding chairs, some fallen
  const rand = mulberry32(3);
  const seat = d.track(new THREE.BoxGeometry(0.4, 0.04, 0.4));
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 6; c++) {
      if (rand() < 0.2) continue;
      const ch = new THREE.Mesh(seat, m.metal);
      const fallen = rand() < 0.25;
      ch.position.set(-3.5 + c * 1.4, fallen ? H.slabTop + 0.2 : H.slabTop + 0.45, -0.6 + r * 1.1);
      if (fallen) ch.rotation.set(rand() * 1.5, rand() * 3, 1.5);
      g.add(ch);
    }
  // a banner sagging over the stage
  const banner = plane(d, m.cloth, 5, 0.6);
  banner.position.set(0, 3.1, H.stage.z0 + 0.3);
  banner.rotation.x = 0.1;
  g.add(banner);
  return g;
}

/* ───────────────────────── Wells ───────────────────────── */

export function buildWell(d: Disposer, m: KampungMaterials, old: boolean): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(d.track(new THREE.CylinderGeometry(WELL.r, WELL.r + 0.05, WELL.top, 18, 1, true)), m.stone);
  ring.position.y = WELL.top / 2;
  ring.castShadow = ring.receiveShadow = true;
  (ring.material as THREE.Material).side = THREE.DoubleSide;
  g.add(ring);
  const lip = new THREE.Mesh(d.track(new THREE.TorusGeometry(WELL.r, 0.08, 6, 20)), m.stone);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = WELL.top;
  g.add(lip);
  const water = new THREE.Mesh(d.track(new THREE.CircleGeometry(WELL.r - 0.05, 18)), old ? m.void : m.water);
  water.rotation.x = -Math.PI / 2;
  water.position.y = old ? -2 : 0.3;
  g.add(water);
  if (!old) {
    for (const s of [-1, 1]) g.add(span(d, m.wood, s * (WELL.r + 0.05), 0, 0.05, 0.05, 0, 2));
    g.add(span(d, m.wood, 0, 0, WELL.r + 0.15, 0.04, 1.95, 2.03));
    const bucket = new THREE.Mesh(d.track(new THREE.CylinderGeometry(0.13, 0.1, 0.22, 10)), m.rust);
    bucket.position.set(0.15, 1.3, 0);
    g.add(bucket);
  } else {
    // a rusty ladder disappears into the dark; planks that once covered it
    for (const s of [-0.18, 0.18]) g.add(span(d, m.rust, s, -WELL.r + 0.12, 0.02, 0.02, -2, WELL.top + 0.3));
    for (let i = 0; i < 6; i++) g.add(span(d, m.rust, 0, -WELL.r + 0.12, 0.18, 0.015, -1.8 + i * 0.45, -1.78 + i * 0.45));
    const plank = box(d, 1.8, 0.05, 0.3, m.planksDark);
    plank.position.set(0.9, 0.1, 1.2);
    plank.rotation.y = 0.7;
    g.add(plank);
  }
  return g;
}

/* ───────────────────────── Village Chief's house ───────────────────────── */

export interface ChiefRefs {
  group: THREE.Group;
  /** Local position of the oil lamp on the table (it still burns…). */
  lampPos: THREE.Vector3;
}

export function buildChiefHouse(d: Disposer, m: KampungMaterials): ChiefRefs {
  const C = CHIEF_HOUSE;
  const g = new THREE.Group();
  const hw = C.width / 2;
  const hd = C.depth / 2;
  const t = C.wallT / 2;
  const stiltGeo = d.track(new THREE.CylinderGeometry(0.13, 0.15, C.floorBottom, 8));
  for (const p of C.stilts) {
    const s = new THREE.Mesh(stiltGeo, m.wood);
    s.position.set(p.x, C.floorBottom / 2, p.z);
    s.castShadow = true;
    g.add(s);
  }
  g.add(span(d, m.planksDark, 0, 0, hw + 0.15, hd + 0.15, C.floorBottom, C.floorTop));
  const faces = (outside: string) =>
    (['+x', '-x', '+y', '-y', '+z', '-z'] as const).map((f) => (f === outside ? m.planks : f === '+y' || f === '-y' ? m.wood : m.planksDark));
  const wall = (x: number, z: number, hx: number, hz: number, y0: number, y1: number, outside: string) => {
    const w = box(d, hx * 2, y1 - y0, hz * 2, faces(outside));
    w.position.set(x, (y0 + y1) / 2, z);
    g.add(w);
  };
  wall(0, -hd + t, hw, t, C.floorTop, C.wallTop, '-z');
  wall(-hw + t, 0, t, hd, C.floorTop, C.wallTop, '-x');
  wall(hw - t, 0, t, hd, C.floorTop, C.wallTop, '+x');
  const d0 = C.door.x - C.door.half;
  const d1 = C.door.x + C.door.half;
  wall((-hw + d0) / 2, hd - t, (d0 + hw) / 2, t, C.floorTop, C.wallTop, '+z');
  wall((d1 + hw) / 2, hd - t, (hw - d1) / 2, t, C.floorTop, C.wallTop, '+z');
  wall(C.door.x, hd - t, C.door.half, t, C.floorTop + 2.1, C.wallTop, '+z');
  const g0 = C.partitionGap.z - C.partitionGap.half;
  const g1 = C.partitionGap.z + C.partitionGap.half;
  wall(C.partitionX, (-hd + g0) / 2, t, (g0 + hd) / 2 - t * 2, C.floorTop, C.wallTop, 'none');
  wall(C.partitionX, (g1 + hd) / 2, t, (hd - g1) / 2 - t * 2, C.floorTop, C.wallTop, 'none');
  // ceiling + big gable roof
  const ceiling = plane(d, m.planksDark, C.width, C.depth);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = C.wallTop - 0.02;
  g.add(ceiling);
  const rise = 2.2;
  const half = hd + 0.8;
  const slope = Math.atan2(rise, half);
  for (const s of [1, -1]) {
    const panel = box(d, C.width + 1.4, 0.05, Math.hypot(rise, half), m.zinc);
    panel.position.set(0, C.wallTop + rise / 2 + 0.05, (s * half) / 2);
    panel.rotation.x = s * slope;
    g.add(panel);
  }
  const gable = new THREE.Shape();
  gable.moveTo(-hd, 0);
  gable.lineTo(hd, 0);
  gable.lineTo(0, rise - 0.05);
  gable.closePath();
  const gableGeo = d.track(new THREE.ShapeGeometry(gable));
  for (const s of [1, -1]) {
    const gm = new THREE.Mesh(gableGeo, m.planks);
    gm.position.set((s * C.width) / 2, C.wallTop, 0);
    gm.rotation.y = s * (Math.PI / 2);
    g.add(gm);
  }
  // verandah, railings, stairs
  const v = C.verandah;
  g.add(span(d, m.planksDark, v.x, v.z, v.hx, v.hz, C.floorBottom, C.floorTop));
  const railTop = C.floorTop + 1.0;
  for (const x of [v.x - v.hx + 0.05, v.x + v.hx - 0.05]) g.add(span(d, m.wood, x, v.z, 0.04, v.hz, railTop - 0.06, railTop));
  for (const [x0, x1] of [
    [v.x - v.hx, v.x - 0.6],
    [v.x + 0.6, v.x + v.hx],
  ])
    g.add(span(d, m.wood, (x0 + x1) / 2, v.z + v.hz - 0.05, (x1 - x0) / 2, 0.04, railTop - 0.06, railTop));
  for (const [x, z] of [
    [v.x - v.hx + 0.05, v.z + v.hz - 0.05],
    [v.x - 0.6, v.z + v.hz - 0.05],
    [v.x + 0.6, v.z + v.hz - 0.05],
    [v.x + v.hx - 0.05, v.z + v.hz - 0.05],
  ])
    g.add(span(d, m.wood, x, z, 0.05, 0.05, C.floorTop, railTop));
  for (const st of C.steps) g.add(span(d, m.planksDark, st.x, st.z, C.stepSize.hx, C.stepSize.hz + 0.01, st.top - 0.07, st.top));
  // the front door, hanging open
  const leaf = box(d, C.door.half * 2 - 0.05, 2.05, 0.05, m.planksDark);
  leaf.geometry.translate(-(C.door.half - 0.03), 0, 0);
  leaf.position.set(d1 - 0.02, C.floorTop + 1.03, hd - 0.12);
  leaf.rotation.y = -1.25;
  g.add(leaf);
  // furniture
  const T = C.table;
  g.add(span(d, m.planksDark, T.x, T.z, T.hx, T.hz, T.top - 0.05, T.top));
  for (const lx of [-1, 1]) for (const lz of [-1, 1]) g.add(span(d, m.wood, T.x + lx * (T.hx - 0.05), T.z + lz * (T.hz - 0.05), 0.03, 0.03, C.floorTop, T.top - 0.05));
  // old radio on the table (radio puzzle in Phase 5)
  g.add(span(d, m.planksDark, T.x + 0.2, T.z - 0.1, 0.22, 0.1, T.top, T.top + 0.22));
  const lampPos = new THREE.Vector3(T.x - 0.3, T.top + 0.2, T.z + 0.1);
  const lampGlass = new THREE.Mesh(d.track(new THREE.SphereGeometry(0.08, 10, 8)), m.glass);
  lampGlass.position.copy(lampPos);
  g.add(lampGlass);
  const K = C.cupboard;
  g.add(span(d, m.planksDark, K.x, K.z, K.hx, K.hz, C.floorTop, K.top));
  const B = C.bed;
  g.add(span(d, m.wood, B.x, B.z, B.hx, B.hz, C.floorTop, B.top - 0.15));
  g.add(span(d, m.cloth, B.x, B.z, B.hx - 0.05, B.hz - 0.05, B.top - 0.15, B.top));
  // mosquito net (kelambu) hanging over the bed
  const net = new THREE.Mesh(
    d.track(new THREE.BoxGeometry(B.hx * 2 + 0.1, 1.5, B.hz * 2 + 0.1, 1, 1, 1)),
    d.track(new THREE.MeshStandardMaterial({ color: 0xd8d4c6, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })),
  );
  net.position.set(B.x, B.top + 0.75, B.z);
  net.userData.dynamic = true; // transparent: keep out of static batches
  g.add(net);
  const H = C.chest;
  g.add(span(d, m.planksDark, H.x, H.z, H.hx, H.hz, C.floorTop, H.top));
  // family photos on the wall
  const photo = plane(d, m.poster, 0.35, 0.47);
  photo.position.set(-4.92, C.floorTop + 1.7, 0.6);
  photo.rotation.y = Math.PI / 2;
  g.add(photo);
  return { group: g, lampPos };
}

/* ───────────────────────── Storeroom (stor) ───────────────────────── */

export function buildStor(d: Disposer, m: KampungMaterials): THREE.Group {
  const S = STOR;
  const g = new THREE.Group();
  g.add(span(d, m.planksDark, 0, 0, S.hx + 0.1, S.hz + 0.1, -0.2, S.floorTop, false));
  const t = 0.08;
  const side = (S.hx - S.doorHalf) / 2;
  g.add(span(d, m.planks, 0, -S.hz + t, S.hx, t, S.floorTop, S.wallTop));
  g.add(span(d, m.planks, -S.hx + t, 0, t, S.hz, S.floorTop, S.wallTop));
  g.add(span(d, m.planks, S.hx - t, 0, t, S.hz, S.floorTop, S.wallTop));
  g.add(span(d, m.planks, -(S.doorHalf + side), S.hz - t, side, t, S.floorTop, S.wallTop));
  g.add(span(d, m.planks, S.doorHalf + side, S.hz - t, side, t, S.floorTop, S.wallTop));
  g.add(span(d, m.planks, 0, S.hz - t, S.doorHalf, t, 2.1, S.wallTop));
  g.add(roof(d, m, S.hx * 2 + 0.6, S.hz * 2 + 0.6, S.wallTop + 0.2, -0.15));
  // the hatch: a dark square with a ladder going down
  const hole = plane(d, m.void, 0.9, 0.9);
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(S.hatch.x, S.floorTop + 0.006, S.hatch.z);
  g.add(hole);
  const lid = box(d, 0.9, 0.04, 0.9, m.planksDark);
  lid.position.set(S.hatch.x + 0.75, S.floorTop + 0.35, S.hatch.z);
  lid.rotation.z = 1.2;
  g.add(lid);
  // junk: tools, sacks
  g.add(span(d, m.cloth, -1.0, -1.1, 0.3, 0.25, S.floorTop, 0.7));
  g.add(span(d, m.cloth, -0.9, -0.5, 0.25, 0.25, S.floorTop, 0.6));
  return g;
}

/* ───────────────────────── Forest hut (pondok) ───────────────────────── */

export function buildHut(d: Disposer, m: KampungMaterials): THREE.Group {
  const H = HUT;
  const g = new THREE.Group();
  g.add(span(d, m.planksDark, 0, 0, H.hx, H.hz, H.floorTop - 0.08, H.floorTop));
  for (const [x, z] of [
    [-H.hx + 0.1, -H.hz + 0.1],
    [H.hx - 0.1, -H.hz + 0.1],
    [-H.hx + 0.1, H.hz - 0.1],
    [H.hx - 0.1, H.hz - 0.1],
  ])
    g.add(span(d, m.wood, x, z, 0.07, 0.07, 0, H.roofY));
  g.add(span(d, m.planksDark, 0, H.step.z, H.step.hx, H.step.hz, H.step.top - 0.06, H.step.top));
  g.add(span(d, m.planks, 0, -H.hz + 0.05, H.hx, 0.05, H.floorTop, 2.1));
  g.add(span(d, m.planks, -H.hx + 0.05, 0, 0.05, H.hz, H.floorTop, 2.1));
  g.add(span(d, m.planks, H.hx - 0.05, 0, 0.05, H.hz, H.floorTop, 2.1));
  // atap (thatch-like) roof: dark frond-coloured slab
  const thatch = box(d, H.hx * 2 + 0.9, 0.18, H.hz * 2 + 1.0, m.bark);
  thatch.position.y = H.roofY + 0.1;
  thatch.rotation.x = 0.18;
  g.add(thatch);
  return g;
}

/* ───────────────────────── Giant fig tree ───────────────────────── */

export function buildGiantTree(d: Disposer, m: KampungMaterials): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(d.track(new THREE.CylinderGeometry(1.0, GIANT_TREE.trunk + 0.3, 14, 14, 6)), m.bark);
  // twist the trunk a little
  const p = trunk.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const a = y * 0.08;
    const x = p.getX(i);
    const z = p.getZ(i);
    p.setX(i, x * Math.cos(a) - z * Math.sin(a) + Math.sin(y * 0.6) * 0.15);
    p.setZ(i, x * Math.sin(a) + z * Math.cos(a));
  }
  trunk.geometry.computeVertexNormals();
  trunk.position.y = 7;
  trunk.castShadow = trunk.receiveShadow = true;
  g.add(trunk);
  for (let i = 0; i < 5; i++) {
    const root = box(d, 2.4, 0.7, 0.35, m.bark);
    root.position.set(Math.cos(i * 1.26) * 2, 0.25, Math.sin(i * 1.26) * 2);
    root.rotation.set(0, -i * 1.26, 0.18);
    g.add(root);
  }
  // hanging aerial roots and faded cloth ribbons tied around the trunk
  const rand = mulberry32(8);
  const rootGeo = d.track(new THREE.CylinderGeometry(0.03, 0.05, 1, 4));
  for (let i = 0; i < 26; i++) {
    const r = new THREE.Mesh(rootGeo, m.bark);
    const len = 3 + rand() * 7;
    const a = rand() * Math.PI * 2;
    const dist = 2 + rand() * 4;
    r.scale.y = len;
    r.position.set(Math.cos(a) * dist, 13 - len / 2, Math.sin(a) * dist);
    g.add(r);
  }
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(d.track(new THREE.TorusGeometry(GIANT_TREE.trunk + 0.18 - i * 0.04, 0.05, 6, 24)), m.cloth);
    band.rotation.x = Math.PI / 2;
    band.position.y = 1.2 + i * 0.35;
    g.add(band);
  }
  const canopy = new THREE.Mesh(d.track(new THREE.IcosahedronGeometry(9, 1)), m.foliage);
  canopy.scale.set(1, 0.45, 1);
  canopy.position.y = 15;
  g.add(canopy);
  return g;
}

/* ───────────────────────── Forest trees (instanced) ───────────────────────── */

export function buildForestTrees(d: Disposer, m: KampungMaterials, trees: PropPlacement[]): THREE.Group {
  const g = new THREE.Group();
  const trunkGeo = d.track(new THREE.CylinderGeometry(0.2, 0.32, 1, 7));
  trunkGeo.translate(0, 0.5, 0);
  const canopyGeo = d.track(new THREE.IcosahedronGeometry(1, 1));
  const trunks = new THREE.InstancedMesh(trunkGeo, m.bark, trees.length);
  const canopies = new THREE.InstancedMesh(canopyGeo, m.foliage, trees.length * 2);
  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const color = new THREE.Color();
  trees.forEach((t, i) => {
    const rand = mulberry32(t.seed ?? i);
    const h = t.height ?? 12;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.yaw);
    mat.compose(new THREE.Vector3(t.x, -0.2, t.z), q, new THREE.Vector3(1 + rand() * 0.4, h, 1 + rand() * 0.4));
    trunks.setMatrixAt(i, mat);
    for (let j = 0; j < 2; j++) {
      const s = 2.4 + rand() * 2.6;
      mat.compose(
        new THREE.Vector3(t.x + (rand() - 0.5) * 2, h - 1 + j * s * 0.5, t.z + (rand() - 0.5) * 2),
        q,
        new THREE.Vector3(s, s * 0.7, s),
      );
      canopies.setMatrixAt(i * 2 + j, mat);
      color.setHSL(0.27 + rand() * 0.05, 0.3, 0.05 + rand() * 0.04);
      canopies.setColorAt(i * 2 + j, color);
    }
  });
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  trunks.castShadow = true;
  trunks.receiveShadow = true;
  canopies.receiveShadow = true;
  d.track(trunks);
  d.track(canopies);
  g.add(trunks, canopies);
  return g;
}

/* ───────────────────────── small props ───────────────────────── */

export function buildLowWall(d: Disposer, m: KampungMaterials, length: number, height: number = LOW_WALL.top): THREE.Mesh {
  const w = box(d, length, height, LOW_WALL.halfThick * 2, m.plaster);
  w.position.y = height / 2;
  return w;
}

export function buildGoal(d: Disposer, m: KampungMaterials): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-3.6, 3.6]) g.add(span(d, m.rust, x, 0, 0.05, 0.05, 0, 2.4));
  g.add(span(d, m.rust, 0, 0, 3.65, 0.05, 2.35, 2.45));
  return g;
}

export function buildWarningSign(d: Disposer, m: KampungMaterials): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-1.15, 1.15]) g.add(span(d, m.wood, x, 0, 0.065, 0.065, 0, 2.2));
  const board = new THREE.Mesh(d.track(new THREE.BoxGeometry(2.6, 1.14, 0.07)), [m.wood, m.wood, m.wood, m.wood, m.warningSign, m.wood]);
  board.position.set(0, 1.62, 0.07);
  board.rotation.z = 0.07;
  board.castShadow = true;
  g.add(board);
  return g;
}

export function buildSchoolSign(d: Disposer, m: KampungMaterials): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-1.15, 1.15]) g.add(span(d, m.iron, x, 0, 0.05, 0.05, 0, 2.6));
  const board = new THREE.Mesh(d.track(new THREE.BoxGeometry(2.6, 1.14, 0.06)), [m.iron, m.iron, m.iron, m.iron, m.schoolSign, m.iron]);
  board.position.set(0, 2.0, 0.06);
  board.castShadow = true;
  g.add(board);
  return g;
}

/* ───────────────────────── Tunnel complex ───────────────────────── */

export function buildTunnel(d: Disposer, m: KampungMaterials, length: number, drawings: boolean): THREE.Group {
  const T = TUNNEL;
  const g = new THREE.Group();
  const floor = plane(d, m.tunnelFloor, T.halfWidth * 2, length);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  g.add(floor);
  for (const s of [-1, 1]) g.add(span(d, m.tunnelWall, s * (T.halfWidth + T.wallT / 2), 0, T.wallT / 2, length / 2, -0.2, T.height + 0.4));
  g.add(span(d, m.tunnelWall, 0, 0, T.halfWidth + T.wallT, length / 2, T.height, T.height + 0.4));
  // timber supports every 4 m
  for (let z = -length / 2 + 2; z < length / 2; z += 4) {
    for (const s of [-1, 1]) g.add(span(d, m.wood, s * (T.halfWidth - 0.08), z, 0.08, 0.08, 0, T.height));
    g.add(span(d, m.wood, 0, z, T.halfWidth, 0.08, T.height - 0.18, T.height));
  }
  if (drawings) {
    const art = plane(d, m.drawing, 2, 1);
    art.position.set(T.halfWidth - 0.01, 1.3, 0);
    art.rotation.y = -Math.PI / 2;
    g.add(art);
  }
  return g;
}

export function buildTunnelCap(d: Disposer, m: KampungMaterials): THREE.Group {
  const g = new THREE.Group();
  g.add(span(d, m.tunnelWall, 0, 0, TUNNEL.halfWidth + TUNNEL.wallT, TUNNEL.wallT / 2, -0.2, TUNNEL.height + 0.4));
  // ladder up
  for (const s of [-0.25, 0.25]) g.add(span(d, m.rust, s, 0.2, 0.025, 0.025, 0, TUNNEL.height + 0.3));
  for (let i = 0; i < 8; i++) g.add(span(d, m.rust, 0, 0.2, 0.25, 0.02, 0.3 + i * 0.32, 0.33 + i * 0.32));
  return g;
}

export function buildChamber(d: Disposer, m: KampungMaterials): THREE.Group {
  const C = CHAMBER;
  const g = new THREE.Group();
  const floor = plane(d, m.tunnelFloor, C.hx * 2, C.hz * 2);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  g.add(floor);
  const side = (C.hz - C.doorHalf) / 2;
  const wh = 3.6;
  g.add(span(d, m.tunnelWall, 0, -C.hz - 0.15, C.hx + 0.3, 0.15, -0.2, wh));
  g.add(span(d, m.tunnelWall, 0, C.hz + 0.15, C.hx + 0.3, 0.15, -0.2, wh));
  g.add(span(d, m.tunnelWall, C.hx + 0.15, 0, 0.15, C.hz, -0.2, wh));
  g.add(span(d, m.tunnelWall, -C.hx - 0.15, -(C.doorHalf + side), 0.15, side, -0.2, wh));
  g.add(span(d, m.tunnelWall, -C.hx - 0.15, C.doorHalf + side, 0.15, side, -0.2, wh));
  g.add(span(d, m.tunnelWall, -C.hx - 0.15, 0, 0.15, C.doorHalf, TUNNEL.height, wh));
  g.add(span(d, m.tunnelWall, 0, 0, C.hx + 0.3, C.hz + 0.3, wh, wh + 0.3));
  // five small beds of woven mats in a circle… and candles long burnt out
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const mat = span(d, m.cloth, Math.cos(a) * 2.6, Math.sin(a) * 2.6, 0.4, 0.8, 0, 0.05, false);
    mat.rotation.y = -a;
    g.add(mat);
    g.add(span(d, m.cloth, Math.cos(a) * 1.4, Math.sin(a) * 1.4, 0.04, 0.04, 0, 0.12, false));
  }
  // the Batu Penunggu: a black stone against the far wall
  const S = C.stone;
  const stone = span(d, m.iron, S.x, 0, S.hx, S.hz, 0, S.top);
  stone.rotation.z = 0.04;
  g.add(stone);
  const cap = span(d, m.iron, S.x, 0, S.hx * 0.8, S.hz * 0.85, S.top, S.top + 0.12);
  cap.rotation.y = 0.12;
  g.add(cap);
  const art = plane(d, m.drawing, 3, 1.5);
  art.position.set(C.hx - 0.01, 2.0, 0);
  art.rotation.y = -Math.PI / 2;
  g.add(art);
  return g;
}

/** Iron bars across the tunnel. Returned separately: it hides when opened. */
export function buildIronGate(d: Disposer, m: KampungMaterials): THREE.Group {
  const g = new THREE.Group();
  const T = TUNNEL;
  for (let z = -T.halfWidth + 0.1; z <= T.halfWidth; z += 0.18) g.add(span(d, m.iron, 0, z, 0.02, 0.02, 0, T.height));
  for (const y of [0.3, 1.3, 2.3]) g.add(span(d, m.iron, 0, 0, 0.04, T.halfWidth, y, y + 0.06));
  // big padlocked chain
  const lock = box(d, 0.08, 0.16, 0.12, m.rust);
  lock.position.set(-0.08, 1.2, 0.1);
  g.add(lock);
  g.userData.dynamic = true;
  return g;
}
