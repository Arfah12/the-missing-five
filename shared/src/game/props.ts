import type { LocalBox } from './collision';

/**
 * Dimensions and collision shapes of every prop type. The client builds
 * meshes from the same numbers, so what you see is what you bump into.
 * Local space: +Z is the front of the prop, Y is up, origin on the ground.
 */

export type PropKind =
  | 'stiltHouse'
  | 'shop'
  | 'busStop'
  | 'gate'
  | 'sign'
  | 'car'
  | 'log'
  | 'barrier'
  | 'fence'
  | 'pole'
  | 'lampPole'
  | 'palm'
  | 'drum'
  | 'crate'
  // Phase 4
  | 'school'
  | 'hall'
  | 'well'
  | 'oldWell'
  | 'chiefHouse'
  | 'stor'
  | 'hut'
  | 'tree'
  | 'giantTree'
  | 'lowWall'
  | 'goal'
  | 'warningSign'
  | 'tunnel'
  | 'tunnelCap'
  | 'chamber'
  | 'ironGate';

/** Per-placement options that change a prop's shape. */
export interface PropShape {
  /** Length (m) for walls and tunnel pieces. */
  length?: number;
  /** Id for switchable colliders (gates, doors). */
  id?: string;
}

export const STILT_HOUSE = {
  width: 7,
  depth: 5.4,
  stilt: 1.35,
  wall: 2.5,
  stilts: [-3.2, 0, 3.2].flatMap((x) => [-2.4, 0, 2.4].map((z) => ({ x, z }))),
  /** Verandah (serambi) and its stairs, in front of the door. */
  verandah: { x: -0.4, z: 3.55, hx: 1.3, hz: 0.75 },
  steps: [0, 1, 2, 3].map((s) => ({ x: -0.4, z: 4.45 + s * 0.33, top: 1.085 - s * 0.33 })),
  stepSize: { hx: 0.55, hz: 0.18 },
  /** Railing posts; the gap between the middle two is the top of the stairs. */
  railPosts: [-1.6, -1.0, 0.2, 0.8],
  railZ: 4.2,
  crates: [
    { x: -1.8, z: -0.3, yaw: 0.4 },
    { x: 0.1, z: 0.25, yaw: 1.1 },
    { x: 1.7, z: -0.5, yaw: 0.7 },
  ],
  tin: { x: 2.2, z: 1.2 },
} as const;

export const SHOP = {
  width: 7,
  depth: 5.5,
  slabTop: 0.2,
  wallTop: 3.2,
  wallT: 0.16,
  porchDepth: 1.6,
  doorHalf: 0.7,
  doorTop: 2.3,
  counter: { x: 2.0, z: -1.0, hx: 1.1, hz: 0.3, top: 1.15 },
  sideShelf: { x: -3.0, z: -0.3, hx: 0.25, hz: 1.6, top: 2.2 },
  backShelf: { x: 0, z: -2.42, hx: 1.6, hz: 0.2, top: 2.0 },
  fallenShelf: { x: -0.7, z: 0.7, hx: 1.0, hz: 0.22, yaw: 0.6, top: 0.68 },
  freezer: { x: 2.65, z: 1.6, hx: 0.36, hz: 0.7, top: 1.1 },
} as const;

export const BUS_STOP = {
  halfWidth: 2,
  halfDepth: 0.95,
  slabTop: 0.15,
  wallTop: 2.3,
  roofY: 2.45,
  bench: { z: -0.5, hx: 1.5, hz: 0.2, top: 0.6 },
} as const;

export const GATE = { pillarX: 3.4, pillarHalf: 0.32, pillarTop: 4.6, beamY0: 3.9, beamY1: 4.5 } as const;
export const CAR = { hx: 0.84, hz: 2.1, top: 1.42 } as const;
export const LOG = { hx: 7, radius: 0.45 } as const;
export const FENCE = { hx: 1.5, top: 1.1 } as const;

export const SCHOOL = {
  width: 24,
  classDepth: 6.4,
  corridor: 2.4,
  slabTop: 0.3,
  wallTop: 3.5,
  wallT: 0.2,
  /** Class centres along x: 0 = Bilik Guru, 1 = Kelas 2 Mawar, 2 = Kelas 3 Melati. */
  classes: [-8, 0, 8],
  doorOffset: 2.4,
  doorHalf: 0.6,
  doorTop: 2.6,
  deskCols: [-2.8, -1.4, 0, 1.4],
  deskRows: [-1.0, 0.3, 1.6],
  desk: { hx: 0.3, hz: 0.22, top: 1.05 },
  teacherDesk: { z: -2.3, hx: 0.6, hz: 0.3, top: 1.05 },
  postXs: [-12, -8, -4, 0, 4, 8, 12],
} as const;

export const HALL = {
  hx: 6,
  hz: 4,
  slabTop: 0.25,
  roofY: 4,
  pillarXs: [-6, -2, 2, 6],
  stage: { z0: -4, z1: -2.4, top: 0.85 },
  stageStep: { z: -2.2, hx: 1, hz: 0.2, top: 0.5 },
} as const;

export const WELL = { r: 0.75, top: 0.8 } as const;

export const CHIEF_HOUSE = {
  width: 10,
  depth: 7,
  floorTop: 1.6,
  floorBottom: 1.45,
  wallTop: 4.3,
  wallT: 0.15,
  door: { x: -2, half: 0.55 },
  partitionX: 1.5,
  partitionGap: { z: 1.3, half: 0.5 },
  stilts: [-4.7, -1.5, 1.5, 4.7].flatMap((x) => [-3.2, 0, 3.2].map((z) => ({ x, z }))),
  verandah: { x: -2, z: 4.3, hx: 1.8, hz: 0.8 },
  steps: [1.25, 0.9, 0.55, 0.2].map((top, i) => ({ x: -2, z: 5.3 + i * 0.35, top })),
  stepSize: { hx: 0.55, hz: 0.18 },
  table: { x: -2.6, z: -1.6, hx: 0.6, hz: 0.4, top: 2.35 },
  cupboard: { x: -4.4, z: -3.0, hx: 0.4, hz: 0.3, top: 3.6 },
  bed: { x: 3.7, z: -1.9, hx: 0.9, hz: 1.1, top: 2.1 },
  chest: { x: 4.4, z: 2.6, hx: 0.4, hz: 0.3, top: 2.15 },
} as const;

export const STOR = { hx: 1.6, hz: 1.6, floorTop: 0.15, wallTop: 2.5, doorHalf: 0.5, hatch: { x: 0, z: -0.6 } } as const;
export const HUT = { hx: 1.5, hz: 1.2, floorTop: 0.55, roofY: 2.4, step: { z: 1.45, hx: 0.5, hz: 0.22, top: 0.3 } } as const;
export const GIANT_TREE = { trunk: 1.3, roots: 3.2 } as const;
export const TUNNEL = { halfWidth: 1.3, height: 2.6, wallT: 0.3 } as const;
export const CHAMBER = { hx: 5, hz: 5, doorHalf: 1.3, stone: { x: 4.1, hx: 0.35, hz: 0.55, top: 1.15 } } as const;
export const LOW_WALL = { top: 1.25, halfThick: 0.12 } as const;

/** Collision boxes for one prop, in its local space. */
export function propColliders(kind: PropKind, shape: PropShape = {}): LocalBox[] {
  const len = shape.length ?? 4;
  switch (kind) {
    case 'stiltHouse': {
      const H = STILT_HOUSE;
      const boxes: LocalBox[] = H.stilts.map((p) => ({ x: p.x, z: p.z, hx: 0.13, hz: 0.13, y0: 0, y1: H.stilt - 0.05, surface: 'wood', tag: 'stilt' }));
      boxes.push({ x: 0, z: 0, hx: (H.width + 0.3) / 2, hz: (H.depth + 0.3) / 2, y0: H.stilt - 0.11, y1: H.stilt + H.wall + 0.15, surface: 'wood', tag: 'house' });
      const v = H.verandah;
      boxes.push({ x: v.x, z: v.z, hx: v.hx, hz: v.hz, y0: H.stilt - 0.09, y1: H.stilt + 0.09, surface: 'wood', tag: 'verandah' });
      for (const s of H.steps) boxes.push({ x: s.x, z: s.z, ...H.stepSize, y0: 0, y1: s.top, surface: 'wood', tag: 'step' });
      // railings either side of the stairs
      const [a, b, c, d] = H.railPosts;
      const railY0 = H.stilt + 0.09;
      boxes.push({ x: (a + b) / 2, z: H.railZ, hx: (b - a) / 2 + 0.05, hz: 0.05, y0: railY0, y1: railY0 + 1.0, surface: 'wood', tag: 'rail' });
      boxes.push({ x: (c + d) / 2, z: H.railZ, hx: (d - c) / 2 + 0.05, hz: 0.05, y0: railY0, y1: railY0 + 1.0, surface: 'wood', tag: 'rail' });
      // side rails of the verandah
      for (const x of [v.x - v.hx + 0.05, v.x + v.hx - 0.05]) {
        boxes.push({ x, z: v.z, hx: 0.05, hz: v.hz, y0: railY0, y1: railY0 + 1.0, surface: 'wood', tag: 'rail' });
      }
      for (const cr of H.crates) boxes.push({ x: cr.x, z: cr.z, yaw: cr.yaw, hx: 0.3, hz: 0.3, y0: 0, y1: 0.45, surface: 'wood', tag: 'crate' });
      boxes.push({ x: H.tin.x, z: H.tin.z, hx: 0.22, hz: 0.22, y0: 0, y1: 0.6, surface: 'metal', tag: 'tin' });
      return boxes;
    }
    case 'shop': {
      const S = SHOP;
      const hw = S.width / 2;
      const hd = S.depth / 2;
      const t = S.wallT / 2;
      const w = { y0: S.slabTop, y1: S.wallTop, surface: 'concrete' as const, tag: 'wall' };
      const front = (hw - S.doorHalf) / 2;
      const boxes: LocalBox[] = [
        // slab (floor + front porch / kaki lima)
        { x: 0, z: S.porchDepth / 2, hx: hw + 0.1, hz: hd + 0.1 + S.porchDepth / 2, y0: -0.4, y1: S.slabTop, surface: 'concrete', tag: 'slab' },
        { x: 0, z: -hd + t, hx: hw, hz: t, ...w },
        { x: -hw + t, z: 0, hx: t, hz: hd, ...w },
        { x: hw - t, z: 0, hx: t, hz: hd, ...w },
        { x: -(S.doorHalf + front), z: hd - t, hx: front, hz: t, ...w },
        { x: S.doorHalf + front, z: hd - t, hx: front, hz: t, ...w },
        { x: 0, z: hd - t, hx: S.doorHalf, hz: t, y0: S.doorTop, y1: S.wallTop, surface: 'concrete', tag: 'lintel' },
      ];
      for (const k of [S.counter, S.sideShelf, S.backShelf, S.freezer]) {
        boxes.push({ x: k.x, z: k.z, hx: k.hx, hz: k.hz, y0: S.slabTop, y1: k.top, surface: 'wood', tag: 'furniture' });
      }
      const fs = S.fallenShelf;
      boxes.push({ x: fs.x, z: fs.z, yaw: fs.yaw, hx: fs.hx, hz: fs.hz, y0: S.slabTop, y1: fs.top, surface: 'wood', tag: 'furniture' });
      for (const x of [-hw + 0.1, hw - 0.1]) {
        boxes.push({ x, z: hd + S.porchDepth - 0.1, hx: 0.07, hz: 0.07, y0: S.slabTop, y1: 2.8, surface: 'wood', tag: 'post' });
      }
      return boxes;
    }
    case 'busStop': {
      const B = BUS_STOP;
      return [
        { x: 0, z: 0, hx: B.halfWidth, hz: B.halfDepth, y0: -0.3, y1: B.slabTop, surface: 'concrete', tag: 'slab' },
        { x: 0, z: -B.halfDepth + 0.08, hx: B.halfWidth, hz: 0.06, y0: B.slabTop, y1: B.wallTop, surface: 'concrete', tag: 'wall' },
        { x: -B.halfWidth + 0.06, z: -0.35, hx: 0.05, hz: 0.55, y0: B.slabTop, y1: B.wallTop, surface: 'concrete', tag: 'wall' },
        { x: 0, z: B.bench.z, hx: B.bench.hx, hz: B.bench.hz, y0: B.slabTop, y1: B.bench.top, surface: 'wood', tag: 'bench' },
        { x: -B.halfWidth + 0.1, z: B.halfDepth - 0.1, hx: 0.05, hz: 0.05, y0: B.slabTop, y1: B.roofY, surface: 'metal', tag: 'post' },
        { x: B.halfWidth - 0.1, z: B.halfDepth - 0.1, hx: 0.05, hz: 0.05, y0: B.slabTop, y1: B.roofY, surface: 'metal', tag: 'post' },
      ];
    }
    case 'gate':
      return [-1, 1].map((s) => ({ x: s * GATE.pillarX, z: 0, hx: GATE.pillarHalf, hz: GATE.pillarHalf, y0: 0, y1: GATE.pillarTop, surface: 'concrete', tag: 'pillar' }));
    case 'sign':
      return [-1.15, 1.15].map((x) => ({ x, z: 0, hx: 0.07, hz: 0.07, y0: 0, y1: 2.2, surface: 'wood', tag: 'post' }));
    case 'car':
      return [{ x: 0, z: 0, hx: CAR.hx, hz: CAR.hz, y0: 0, y1: CAR.top, surface: 'metal', tag: 'car' }];
    case 'log':
      return [{ x: 0, z: 0, hx: LOG.hx, hz: LOG.radius, y0: 0, y1: LOG.radius * 2, surface: 'wood', tag: 'log' }];
    case 'barrier':
      return [{ x: 0, z: 0, hx: 1.4, hz: 0.18, y0: 0, y1: 1.15, surface: 'wood', tag: 'barrier' }];
    case 'fence':
      return [{ x: 0, z: 0, hx: FENCE.hx, hz: 0.05, y0: 0, y1: FENCE.top, surface: 'wood', tag: 'fence' }];
    case 'pole':
    case 'lampPole':
      return [{ x: 0, z: 0, hx: 0.14, hz: 0.14, y0: 0, y1: 7.6, surface: 'wood', tag: 'pole' }];
    case 'palm':
      return [{ x: 0, z: 0, hx: 0.19, hz: 0.19, y0: 0, y1: 3, surface: 'wood', tag: 'palm' }];
    case 'drum':
      return [{ x: 0, z: 0, hx: 0.28, hz: 0.28, y0: 0, y1: 0.9, surface: 'metal', tag: 'drum' }];
    case 'crate':
      return [{ x: 0, z: 0, hx: 0.3, hz: 0.3, y0: 0, y1: 0.6, surface: 'wood', tag: 'crate' }];

    case 'school': {
      const S = SCHOOL;
      const hw = S.width / 2;
      const back = -S.classDepth / 2;
      const front = S.classDepth / 2;
      const t = S.wallT / 2;
      const w = { y0: S.slabTop, y1: S.wallTop, surface: 'concrete' as const, tag: 'wall' };
      const boxes: LocalBox[] = [
        { x: 0, z: (back + front + S.corridor) / 2, hx: hw + 0.2, hz: (S.classDepth + S.corridor) / 2 + 0.2, y0: -0.4, y1: S.slabTop, surface: 'concrete', tag: 'slab' },
        { x: 0, z: back + t, hx: hw, hz: t, ...w },
        { x: -hw + t, z: 0, hx: t, hz: S.classDepth / 2, ...w },
        { x: hw - t, z: 0, hx: t, hz: S.classDepth / 2, ...w },
        { x: -4, z: 0, hx: t, hz: S.classDepth / 2, ...w },
        { x: 4, z: 0, hx: t, hz: S.classDepth / 2, ...w },
      ];
      for (const c of S.classes) {
        const d0 = c + S.doorOffset - S.doorHalf;
        const d1 = c + S.doorOffset + S.doorHalf;
        const left = c - 4;
        const right = c + 4;
        boxes.push({ x: (left + d0) / 2, z: front - t, hx: (d0 - left) / 2, hz: t, ...w });
        boxes.push({ x: (d1 + right) / 2, z: front - t, hx: (right - d1) / 2, hz: t, ...w });
        boxes.push({ x: c + S.doorOffset, z: front - t, hx: S.doorHalf, hz: t, y0: S.doorTop, y1: S.wallTop, surface: 'concrete', tag: 'lintel' });
      }
      for (const c of S.classes.slice(1)) {
        for (const dx of S.deskCols)
          for (const dz of S.deskRows)
            boxes.push({ x: c + dx, z: dz, hx: S.desk.hx, hz: S.desk.hz, y0: S.slabTop, y1: S.desk.top, surface: 'wood', tag: 'desk' });
        const td = S.teacherDesk;
        boxes.push({ x: c, z: td.z, hx: td.hx, hz: td.hz, y0: S.slabTop, y1: td.top, surface: 'wood', tag: 'desk' });
      }
      // Bilik Guru: two tables and a cabinet
      const g = S.classes[0];
      boxes.push({ x: g - 1.5, z: -1.4, hx: 0.75, hz: 0.45, y0: S.slabTop, y1: 1.05, surface: 'wood', tag: 'desk' });
      boxes.push({ x: g + 1.4, z: 0.4, hx: 0.75, hz: 0.45, y0: S.slabTop, y1: 1.05, surface: 'wood', tag: 'desk' });
      boxes.push({ x: g - 3.4, z: -2.6, hx: 0.4, hz: 0.3, y0: S.slabTop, y1: 2.2, surface: 'metal', tag: 'cabinet' });
      for (const x of S.postXs) boxes.push({ x, z: front + S.corridor - 0.15, hx: 0.1, hz: 0.1, y0: S.slabTop, y1: S.wallTop, surface: 'concrete', tag: 'post' });
      return boxes;
    }
    case 'hall': {
      const H = HALL;
      const boxes: LocalBox[] = [{ x: 0, z: 0, hx: H.hx + 0.3, hz: H.hz + 0.3, y0: -0.3, y1: H.slabTop, surface: 'concrete', tag: 'slab' }];
      for (const x of H.pillarXs)
        for (const z of [-H.hz, H.hz]) boxes.push({ x, z, hx: 0.18, hz: 0.18, y0: H.slabTop, y1: H.roofY, surface: 'concrete', tag: 'pillar' });
      boxes.push({ x: 0, z: (H.stage.z0 + H.stage.z1) / 2, hx: H.hx - 0.4, hz: (H.stage.z1 - H.stage.z0) / 2, y0: H.slabTop, y1: H.stage.top, surface: 'wood', tag: 'stage' });
      const st = H.stageStep;
      boxes.push({ x: 0, z: st.z, hx: st.hx, hz: st.hz, y0: H.slabTop, y1: st.top, surface: 'wood', tag: 'step' });
      return boxes;
    }
    case 'well':
    case 'oldWell':
      return [{ x: 0, z: 0, hx: WELL.r, hz: WELL.r, y0: 0, y1: WELL.top, surface: 'concrete', tag: 'well' }];
    case 'chiefHouse': {
      const C = CHIEF_HOUSE;
      const hw = C.width / 2;
      const hd = C.depth / 2;
      const t = C.wallT / 2;
      const w = { y0: C.floorTop, y1: C.wallTop, surface: 'wood' as const, tag: 'wall' };
      const boxes: LocalBox[] = C.stilts.map((p) => ({ x: p.x, z: p.z, hx: 0.14, hz: 0.14, y0: 0, y1: C.floorBottom, surface: 'wood', tag: 'stilt' }));
      boxes.push({ x: 0, z: 0, hx: hw + 0.15, hz: hd + 0.15, y0: C.floorBottom, y1: C.floorTop, surface: 'wood', tag: 'floor' });
      boxes.push({ x: 0, z: -hd + t, hx: hw, hz: t, ...w });
      boxes.push({ x: -hw + t, z: 0, hx: t, hz: hd, ...w });
      boxes.push({ x: hw - t, z: 0, hx: t, hz: hd, ...w });
      const d0 = C.door.x - C.door.half;
      const d1 = C.door.x + C.door.half;
      boxes.push({ x: (-hw + d0) / 2, z: hd - t, hx: (d0 + hw) / 2, hz: t, ...w });
      boxes.push({ x: (d1 + hw) / 2, z: hd - t, hx: (hw - d1) / 2, hz: t, ...w });
      boxes.push({ x: C.door.x, z: hd - t, hx: C.door.half, hz: t, y0: C.floorTop + 2.1, y1: C.wallTop, surface: 'wood', tag: 'lintel' });
      const g0 = C.partitionGap.z - C.partitionGap.half;
      const g1 = C.partitionGap.z + C.partitionGap.half;
      boxes.push({ x: C.partitionX, z: (-hd + g0) / 2, hx: t, hz: (g0 + hd) / 2, ...w });
      boxes.push({ x: C.partitionX, z: (g1 + hd) / 2, hx: t, hz: (hd - g1) / 2, ...w });
      const v = C.verandah;
      boxes.push({ x: v.x, z: v.z, hx: v.hx, hz: v.hz, y0: C.floorBottom, y1: C.floorTop, surface: 'wood', tag: 'verandah' });
      const railY = { y0: C.floorTop, y1: C.floorTop + 1.0, surface: 'wood' as const, tag: 'rail' };
      boxes.push({ x: v.x - v.hx + 0.05, z: v.z, hx: 0.05, hz: v.hz, ...railY });
      boxes.push({ x: v.x + v.hx - 0.05, z: v.z, hx: 0.05, hz: v.hz, ...railY });
      const fz = v.z + v.hz - 0.05;
      boxes.push({ x: (v.x - v.hx + v.x - 0.6) / 2, z: fz, hx: (v.hx - 0.6) / 2, hz: 0.05, ...railY });
      boxes.push({ x: (v.x + 0.6 + v.x + v.hx) / 2, z: fz, hx: (v.hx - 0.6) / 2, hz: 0.05, ...railY });
      for (const st of C.steps) boxes.push({ x: st.x, z: st.z, ...C.stepSize, y0: 0, y1: st.top, surface: 'wood', tag: 'step' });
      for (const k of [C.table, C.cupboard, C.bed, C.chest]) boxes.push({ x: k.x, z: k.z, hx: k.hx, hz: k.hz, y0: C.floorTop, y1: k.top, surface: 'wood', tag: 'furniture' });
      return boxes;
    }
    case 'stor': {
      const S = STOR;
      const t = 0.08;
      const w = { y0: S.floorTop, y1: S.wallTop, surface: 'wood' as const, tag: 'wall' };
      const side = (S.hx - S.doorHalf) / 2;
      return [
        { x: 0, z: 0, hx: S.hx + 0.1, hz: S.hz + 0.1, y0: -0.2, y1: S.floorTop, surface: 'wood', tag: 'floor' },
        { x: 0, z: -S.hz + t, hx: S.hx, hz: t, ...w },
        { x: -S.hx + t, z: 0, hx: t, hz: S.hz, ...w },
        { x: S.hx - t, z: 0, hx: t, hz: S.hz, ...w },
        { x: -(S.doorHalf + side), z: S.hz - t, hx: side, hz: t, ...w },
        { x: S.doorHalf + side, z: S.hz - t, hx: side, hz: t, ...w },
        { x: 0, z: S.hz - t, hx: S.doorHalf, hz: t, y0: 2.1, y1: S.wallTop, surface: 'wood', tag: 'lintel' },
      ];
    }
    case 'hut': {
      const H = HUT;
      const w = { y0: H.floorTop, y1: 2.1, surface: 'wood' as const, tag: 'wall' };
      return [
        { x: 0, z: 0, hx: H.hx, hz: H.hz, y0: 0, y1: H.floorTop, surface: 'wood', tag: 'floor' },
        { x: 0, z: H.step.z, hx: H.step.hx, hz: H.step.hz, y0: 0, y1: H.step.top, surface: 'wood', tag: 'step' },
        { x: 0, z: -H.hz + 0.05, hx: H.hx, hz: 0.05, ...w },
        { x: -H.hx + 0.05, z: 0, hx: 0.05, hz: H.hz, ...w },
        { x: H.hx - 0.05, z: 0, hx: 0.05, hz: H.hz, ...w },
        { x: -H.hx + 0.1, z: H.hz - 0.1, hx: 0.07, hz: 0.07, y0: 0, y1: H.roofY, surface: 'wood', tag: 'post' },
        { x: H.hx - 0.1, z: H.hz - 0.1, hx: 0.07, hz: 0.07, y0: 0, y1: H.roofY, surface: 'wood', tag: 'post' },
      ];
    }
    case 'tree':
      return [{ x: 0, z: 0, hx: 0.28, hz: 0.28, y0: 0, y1: 6, surface: 'wood', tag: 'tree' }];
    case 'giantTree':
      return [
        { x: 0, z: 0, hx: GIANT_TREE.trunk, hz: GIANT_TREE.trunk, y0: 0, y1: 12, surface: 'wood', tag: 'trunk' },
        // buttress roots you can step over
        ...[0, 1, 2, 3, 4].map((i): LocalBox => ({ x: Math.cos(i * 1.26) * 2, z: Math.sin(i * 1.26) * 2, yaw: i * 1.26, hx: 1.1, hz: 0.2, y0: 0, y1: 0.35, surface: 'wood', tag: 'root' })),
      ];
    case 'lowWall':
      return [{ x: 0, z: 0, hx: len / 2, hz: LOW_WALL.halfThick, y0: 0, y1: LOW_WALL.top, surface: 'concrete', tag: 'wall' }];
    case 'goal':
      return [-3.6, 3.6].map((x) => ({ x, z: 0, hx: 0.06, hz: 0.06, y0: 0, y1: 2.4, surface: 'metal', tag: 'post' }));
    case 'warningSign':
      return [-1.15, 1.15].map((x) => ({ x, z: 0, hx: 0.07, hz: 0.07, y0: 0, y1: 2.2, surface: 'wood', tag: 'post' }));
    case 'tunnel': {
      const T = TUNNEL;
      const off = T.halfWidth + T.wallT / 2;
      return [-1, 1].map((sd) => ({ x: sd * off, z: 0, hx: T.wallT / 2, hz: len / 2, y0: -1, y1: T.height + 0.4, surface: 'concrete', tag: 'tunnelWall' }));
    }
    case 'tunnelCap':
      return [{ x: 0, z: 0, hx: TUNNEL.halfWidth + TUNNEL.wallT, hz: TUNNEL.wallT / 2, y0: -1, y1: TUNNEL.height + 0.4, surface: 'concrete', tag: 'tunnelWall' }];
    case 'chamber': {
      const C = CHAMBER;
      const t = 0.15;
      const w = { y0: -1, y1: 3.6, surface: 'concrete' as const, tag: 'chamberWall' };
      const side = (C.hz - C.doorHalf) / 2;
      // entrance on the −x side (the gate sits in the gap)
      return [
        { x: 0, z: -C.hz - t, hx: C.hx + 0.3, hz: t, ...w },
        { x: 0, z: C.hz + t, hx: C.hx + 0.3, hz: t, ...w },
        { x: C.hx + t, z: 0, hx: t, hz: C.hz, ...w },
        { x: -C.hx - t, z: -(C.doorHalf + side), hx: t, hz: side, ...w },
        { x: -C.hx - t, z: C.doorHalf + side, hx: t, hz: side, ...w },
        // the Batu Penunggu
        { x: C.stone.x, z: 0, hx: C.stone.hx, hz: C.stone.hz, y0: 0, y1: C.stone.top, surface: 'concrete', tag: 'stone' },
      ];
    }
    case 'ironGate':
      return [{ x: 0, z: 0, hx: 0.08, hz: TUNNEL.halfWidth, y0: -1, y1: TUNNEL.height, surface: 'metal', tag: 'gate', id: shape.id ?? 'gate' }];
  }
}
