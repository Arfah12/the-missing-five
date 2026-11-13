import { CollisionWorld, placeBox, type BoxCollider } from '../collision';
import { mulberry32, smoothstep } from '../math';
import { HUT, STOR, TUNNEL, propColliders } from '../props';
import { ENTRANCE_PROPS, ENTRANCE_SPAWNS, roadX, type PropPlacement } from './villageEntrance';

/**
 * Kampung Hujan – the whole connected map (Phase 4).
 *
 * North is −Z. From the arrival point the road runs north through the
 * Village Entrance into the Central Village. At the crossroads a lane leads
 * west to the abandoned school and east to the Village Chief's house; the
 * road narrows into a footpath through the Forbidden Forest. The
 * Underground Tunnel is a separate enclosed space (far east) reached
 * through the chief's storeroom hatch or the old well in the forest.
 */

export const KAMPUNG_BOUNDS = { minX: -86, maxX: 175, minZ: -212, maxZ: 46 } as const;

/** The overground map stops at this x; beyond it lies the tunnel complex. */
export const OVERGROUND_MAX_X = 70;

/* ───────────────────────── roads ───────────────────────── */

export interface Road {
  id: string;
  halfWidth: number;
  points: { x: number; z: number }[];
  /** Muddy track (road) or narrow forest footpath. */
  kind: 'road' | 'path';
}

export const CROSSROADS = { x: roadX(-86), z: -86 };

const mainRoad: { x: number; z: number }[] = [];
for (let z = 70; z >= -128; z -= 3) mainRoad.push({ x: roadX(z), z });

export const ROADS: Road[] = [
  { id: 'main', halfWidth: 2.2, kind: 'road', points: mainRoad },
  {
    id: 'school-lane',
    halfWidth: 1.8,
    kind: 'road',
    points: [CROSSROADS, { x: -14, z: -86.6 }, { x: -30, z: -87.6 }, { x: -46, z: -88 }, { x: -58, z: -88 }],
  },
  {
    id: 'chief-lane',
    halfWidth: 1.8,
    kind: 'road',
    points: [CROSSROADS, { x: 14, z: -85.4 }, { x: 26, z: -84.6 }, { x: 38, z: -84 }],
  },
  {
    id: 'forest-path',
    halfWidth: 1.2,
    kind: 'path',
    points: [
      { x: roadX(-128), z: -128 },
      { x: -5, z: -140 },
      { x: -6, z: -150 },
      { x: 2, z: -160 },
      { x: 1, z: -170 },
      { x: -4, z: -178 },
      { x: -10, z: -186 },
    ],
  },
  { id: 'hut-path', halfWidth: 0.9, kind: 'path', points: [{ x: 2, z: -160 }, { x: 10, z: -166 }, { x: 15.5, z: -170 }] },
  { id: 'well-path', halfWidth: 0.9, kind: 'path', points: [{ x: -16, z: -196 }, { x: -24, z: -200 }, { x: -28.2, z: -200.4 }] },
];

/** Distance to the nearest road edge (negative = on the road) and the road kind. */
export function roadDistance(x: number, z: number): { d: number; kind: Road['kind'] | null } {
  let best = Number.POSITIVE_INFINITY;
  let kind: Road['kind'] | null = null;
  for (const r of ROADS) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i];
      const b = r.points[i + 1];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
      const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t)) - r.halfWidth;
      if (d < best) {
        best = d;
        kind = r.kind;
      }
    }
  }
  return { d: best, kind };
}

/* ───────────────────────── areas ───────────────────────── */

export type AreaId = 'entrance' | 'central' | 'school' | 'chief' | 'forest' | 'tunnel' | 'forbidden';

export interface Area {
  id: AreaId;
  name: string;
  /** Axis-aligned extent (first match wins, so order matters). */
  rect: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Underground: no sky light, no rain. */
  underground?: boolean;
}

export const AREAS: Area[] = [
  { id: 'forbidden', name: 'Forbidden Area', rect: { minX: 146, maxX: 175, minZ: -110, maxZ: -90 }, underground: true },
  { id: 'tunnel', name: 'Underground Tunnel', rect: { minX: 100, maxX: 175, minZ: -130, maxZ: -20 }, underground: true },
  { id: 'school', name: 'Abandoned School', rect: { minX: -86, maxX: -44, minZ: -106, maxZ: -68 } },
  { id: 'chief', name: "Village Chief's House", rect: { minX: 34, maxX: 70, minZ: -108, maxZ: -68 } },
  { id: 'forest', name: 'Forbidden Forest', rect: { minX: -86, maxX: 70, minZ: -212, maxZ: -126 } },
  { id: 'central', name: 'Central Village', rect: { minX: -86, maxX: 70, minZ: -126, maxZ: -50 } },
  { id: 'entrance', name: 'Village Entrance', rect: { minX: -86, maxX: 70, minZ: -50, maxZ: 46 } },
];

export function areaAt(x: number, z: number): Area {
  for (const a of AREAS) {
    const r = a.rect;
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return a;
  }
  return AREAS[AREAS.length - 1];
}

/* ───────────────────────── props ───────────────────────── */

const L = Math.PI / 2; // front faces +X
const R = -Math.PI / 2; // front faces −X
const N = Math.PI; // front faces −Z (north)

export const SCHOOL_POS = { x: -62, z: -94, yaw: 0 };
export const CHIEF_POS = { x: 50, z: -90, yaw: R };
export const STOR_POS = { x: 50.5, z: -100.5, yaw: R };
export const HUT_POS = { x: 18, z: -170.5, yaw: R };
export const GIANT_TREE_POS = { x: -14, z: -193 };
export const OLD_WELL_POS = { x: -30, z: -201 };

/** Tunnel complex (all at ground level, far east, enclosed). */
export const TUNNEL_X = 130;
export const TUNNEL_START_Z = -38;
export const TUNNEL_JUNCTION_Z = -100;
export const TUNNEL_END_Z = -118;
export const GATE_X = 146;
export const CHAMBER_POS = { x: 152.2, z: -100 };
export const FORBIDDEN_GATE_ID = 'gate:forbidden';

function schoolWalls(): PropPlacement[] {
  // a low perimeter wall with a gate opening on the east side (z −90…−86)
  const x0 = -78;
  const x1 = -47;
  const z0 = -103;
  const z1 = -71;
  return [
    { kind: 'lowWall', x: (x0 + x1) / 2, z: z0, yaw: 0, length: x1 - x0 },
    { kind: 'lowWall', x: (x0 + x1) / 2, z: z1, yaw: 0, length: x1 - x0 },
    { kind: 'lowWall', x: x0, z: (z0 + z1) / 2, yaw: L, length: z1 - z0 },
    { kind: 'lowWall', x: x1, z: (z0 - 90) / 2, yaw: L, length: -90 - z0 },
    { kind: 'lowWall', x: x1, z: (-86 + z1) / 2, yaw: L, length: z1 + 86 },
  ];
}

function chiefFence(): PropPlacement[] {
  const out: PropPlacement[] = [];
  for (let z = -73; z >= -107; z -= 3.05) {
    if (z < -81 && z > -88) continue; // entrance from the lane
    out.push({ kind: 'fence', x: 41, z, yaw: L + (Math.sin(z) * 0.06) });
  }
  for (let x = 43; x <= 66; x += 3.05) {
    out.push({ kind: 'fence', x, z: -72, yaw: Math.sin(x) * 0.05 });
    out.push({ kind: 'fence', x, z: -108, yaw: Math.sin(x * 3) * 0.05 });
  }
  return out;
}

function tunnelPieces(): PropPlacement[] {
  const out: PropPlacement[] = [];
  // main corridor A → junction
  const mainLen = TUNNEL_START_Z - TUNNEL_JUNCTION_Z - TUNNEL.halfWidth;
  out.push({ kind: 'tunnel', x: TUNNEL_X, z: TUNNEL_START_Z - mainLen / 2, yaw: 0, length: mainLen });
  // past the junction towards exit B (west wall continues, east wall has the side passage)
  const northLen = TUNNEL_JUNCTION_Z - TUNNEL.halfWidth - TUNNEL_END_Z;
  out.push({ kind: 'tunnel', x: TUNNEL_X, z: TUNNEL_JUNCTION_Z - TUNNEL.halfWidth - northLen / 2, yaw: 0, length: northLen });
  // west wall across the junction gap
  out.push({ kind: 'lowWall', x: TUNNEL_X - TUNNEL.halfWidth - 0.15, z: TUNNEL_JUNCTION_Z, yaw: L, length: TUNNEL.halfWidth * 2 + 0.2, height: 3 });
  // side passage east to the iron gate and the chamber
  const sideLen = CHAMBER_POS.x - 5.15 - (TUNNEL_X + TUNNEL.halfWidth);
  out.push({ kind: 'tunnel', x: TUNNEL_X + TUNNEL.halfWidth + sideLen / 2, z: TUNNEL_JUNCTION_Z, yaw: L, length: sideLen });
  out.push({ kind: 'tunnelCap', x: TUNNEL_X, z: TUNNEL_START_Z + 0.15, yaw: 0 });
  out.push({ kind: 'tunnelCap', x: TUNNEL_X, z: TUNNEL_END_Z - 0.15, yaw: 0 });
  out.push({ kind: 'ironGate', x: GATE_X, z: TUNNEL_JUNCTION_Z, yaw: 0, id: FORBIDDEN_GATE_ID });
  out.push({ kind: 'chamber', x: CHAMBER_POS.x, z: CHAMBER_POS.z, yaw: 0 });
  return out;
}

/** Trees of the Forbidden Forest: seeded, so client and server agree. */
function forestTrees(): PropPlacement[] {
  const rand = mulberry32(2026);
  const out: PropPlacement[] = [];
  const keepClear = [
    { x: GIANT_TREE_POS.x, z: GIANT_TREE_POS.z, r: 7.5 },
    { x: HUT_POS.x, z: HUT_POS.z, r: 4.5 },
    { x: OLD_WELL_POS.x, z: OLD_WELL_POS.z, r: 4 },
  ];
  let tries = 0;
  while (out.length < 230 && tries++ < 6000) {
    const x = -60 + rand() * 120;
    const z = -129 - rand() * 80;
    if (roadDistance(x, z).d < 1.6) continue;
    if (keepClear.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
    if (out.some((t) => Math.hypot(t.x - x, t.z - z) < 2.4)) continue;
    out.push({ kind: 'tree', x, z, yaw: rand() * 6.28, seed: Math.floor(rand() * 1e6), height: 9 + rand() * 9 });
  }
  return out;
}

const poleZs = [-61, -74, -100, -113];

export const KAMPUNG_PROPS: PropPlacement[] = [
  // the entrance area, minus its old "road closed" barriers
  ...ENTRANCE_PROPS.filter((p) => p.kind !== 'barrier'),

  // ── Central Village ──
  ...poleZs.map((z): PropPlacement => ({ kind: 'pole', x: roadX(z) - 3.2, z, yaw: 0 })),
  { kind: 'lampPole', x: roadX(-87) - 3.4, z: -82.5, yaw: 0, arm: 1, working: false },
  { kind: 'stiltHouse', x: roadX(-58) + 9, z: -58, yaw: R + 0.2, seed: 21 },
  { kind: 'stiltHouse', x: roadX(-66) - 10, z: -66, yaw: L - 0.1, seed: 22, lit: true },
  { kind: 'stiltHouse', x: roadX(-75) + 8.5, z: -75, yaw: R, seed: 23 },
  { kind: 'stiltHouse', x: -21, z: -99, yaw: 0.05, seed: 24 },
  { kind: 'stiltHouse', x: 18, z: -96.5, yaw: -0.08, seed: 25 },
  { kind: 'stiltHouse', x: -22, z: -75, yaw: N + 0.1, seed: 26 },
  { kind: 'shop', x: roadX(-104) + 9.2, z: -104, yaw: R, variant: 'warung' },
  { kind: 'hall', x: roadX(-112) - 11.5, z: -112, yaw: L },
  { kind: 'well', x: 10, z: -81.5, yaw: 0 },
  { kind: 'drum', x: roadX(-104) + 5.1, z: -99.6, yaw: 0 },
  { kind: 'crate', x: roadX(-104) + 5.4, z: -108.6, yaw: 0.5 },
  { kind: 'fence', x: -27.5, z: -92.6, yaw: 0.04 },
  { kind: 'fence', x: -15.5, z: -93, yaw: -0.1 },
  ...(
    [
      [-9, -63, 7.5],
      [12, -70, 8],
      [-31, -84, 7],
      [24, -106, 7.6],
      [-6, -118, 8.2],
      [30, -78, 6.8],
    ] as const
  ).map(([x, z, h], i): PropPlacement => ({ kind: 'palm', x, z, yaw: 0, seed: 211 + i * 13, height: h })),
  { kind: 'warningSign', x: roadX(-124) + 3.4, z: -124, yaw: -0.4 },

  // ── Abandoned School ──
  { kind: 'school', x: SCHOOL_POS.x, z: SCHOOL_POS.z, yaw: SCHOOL_POS.yaw },
  ...schoolWalls(),
  { kind: 'goal', x: -62, z: -74.5, yaw: N },
  { kind: 'sign', x: -45, z: -84.2, yaw: L + 0.3, variant: 'school' },

  // ── Village Chief's House ──
  { kind: 'chiefHouse', x: CHIEF_POS.x, z: CHIEF_POS.z, yaw: CHIEF_POS.yaw },
  { kind: 'stor', x: STOR_POS.x, z: STOR_POS.z, yaw: STOR_POS.yaw },
  ...chiefFence(),
  { kind: 'drum', x: 47, z: -103.6, yaw: 0 },
  { kind: 'palm', x: 58, z: -78, yaw: 0, seed: 91, height: 8.6 },

  // ── Forbidden Forest ──
  ...forestTrees(),
  { kind: 'giantTree', x: GIANT_TREE_POS.x, z: GIANT_TREE_POS.z, yaw: 0.4 },
  { kind: 'hut', x: HUT_POS.x, z: HUT_POS.z, yaw: HUT_POS.yaw },
  { kind: 'oldWell', x: OLD_WELL_POS.x, z: OLD_WELL_POS.z, yaw: 0.3 },

  // ── Underground Tunnel + Forbidden Area ──
  ...tunnelPieces(),
];

/* ───────────────────────── terrain ───────────────────────── */

const FLATS = KAMPUNG_PROPS.filter((p) =>
  ['shop', 'stiltHouse', 'busStop', 'gate', 'school', 'hall', 'chiefHouse', 'stor', 'hut', 'well', 'oldWell'].includes(p.kind),
).map((p) => ({
  x: p.x,
  z: p.z,
  r: p.kind === 'school' ? 15 : p.kind === 'chiefHouse' ? 8 : p.kind === 'hall' ? 8 : p.kind === 'shop' ? 6 : p.kind === 'stiltHouse' ? 5.8 : 3.2,
}));

export function kampungTerrain(x: number, z: number): number {
  if (x > OVERGROUND_MAX_X + 20) return 0; // tunnel complex: flat floor
  const road = roadDistance(x, z);
  const roadT = smoothstep((road.d - 0.4) / 3);
  let flat = 1;
  for (const f of FLATS) {
    const dx = x - f.x;
    const dz = z - f.z;
    if (Math.abs(dx) > f.r + 4 || Math.abs(dz) > f.r + 4) continue;
    flat = Math.min(flat, smoothstep((Math.hypot(dx, dz) - f.r) / 4));
  }
  const forest = smoothstep((-z - 122) / 10); // bumpier ground in the forest
  const amp = 1 + forest * 0.9;
  const bump =
    (0.22 * Math.sin(x * 0.23 + 1.3) * Math.cos(z * 0.19 - 0.7) + 0.07 * Math.sin(x * 0.71 + z * 0.53) + 0.04) * amp;
  return bump * roadT * flat - (road.kind === 'path' ? 0.01 : 0.03) * (1 - roadT);
}

/* ───────────────────────── portals ───────────────────────── */

export interface Portal {
  id: string;
  /** Walk into this circle to use it. */
  from: { x: number; z: number; r: number };
  to: { x: number; z: number; yaw: number };
  label: string;
  /** The portal is only usable while this dynamic collider is open. */
  requiresOpen?: string;
}

const storLocal = (lx: number, lz: number) => {
  const c = Math.cos(STOR_POS.yaw);
  const s = Math.sin(STOR_POS.yaw);
  return { x: STOR_POS.x + lx * c + lz * s, z: STOR_POS.z - lx * s + lz * c };
};
const storHatch = storLocal(STOR.hatch.x, STOR.hatch.z);
const storOutside = storLocal(0, STOR.hz + 1.6);

export const PORTALS: Portal[] = [
  {
    id: 'stor-down',
    from: { ...storHatch, r: 0.55 },
    to: { x: TUNNEL_X, z: TUNNEL_START_Z - 2.5, yaw: 0 },
    label: 'Climb down the hatch',
    requiresOpen: 'hatch:stor',
  },
  {
    id: 'tunnel-up-a',
    from: { x: TUNNEL_X, z: TUNNEL_START_Z - 0.8, r: 0.7 },
    to: { x: storOutside.x, z: storOutside.z, yaw: STOR_POS.yaw },
    label: 'Climb up to the storeroom',
  },
  {
    id: 'tunnel-up-b',
    from: { x: TUNNEL_X, z: TUNNEL_END_Z + 0.8, r: 0.7 },
    to: { x: OLD_WELL_POS.x + 2.4, z: OLD_WELL_POS.z + 1.6, yaw: -2.2 },
    label: 'Climb the rusty ladder',
  },
  {
    id: 'well-down',
    from: { x: OLD_WELL_POS.x, z: OLD_WELL_POS.z, r: 1.45 },
    to: { x: TUNNEL_X, z: TUNNEL_END_Z + 2.6, yaw: Math.PI },
    label: 'Climb down into the well',
    requiresOpen: 'well:planks',
  },
];

/** Max distance (from the circle edge) the server accepts a portal request from. */
export const PORTAL_SLACK = 1.0;

/* ───────────────────────── spawns, landmarks, world ───────────────────────── */

export const KAMPUNG_SPAWNS = ENTRANCE_SPAWNS;

export const KAMPUNG_LANDMARKS = [
  { id: 'arrival', name: 'The Broken-Down Car', x: roadX(37), z: 37, r: 6 },
  { id: 'gate', name: 'Gerbang Kampung Hujan', x: roadX(18), z: 18, r: 4.5 },
  { id: 'busstop', name: 'Perhentian Bas', x: roadX(8) + 4.7, z: 8, r: 3.5 },
  { id: 'shop', name: 'Kedai Runcit Pak Leman', x: roadX(-4) - 8.6, z: -4, r: 5 },
  { id: 'house', name: 'Rumah Tok Senah', x: roadX(-17) + 8.6, z: -17, r: 6 },
  { id: 'crossroads', name: 'Simpang Kampung', x: CROSSROADS.x, z: CROSSROADS.z, r: 5 },
  { id: 'warung', name: 'Warung Mak Jah', x: roadX(-104) + 9.2, z: -104, r: 5 },
  { id: 'hall', name: 'Balai Raya', x: roadX(-112) - 11.5, z: -112, r: 7 },
  { id: 'school', name: 'SK Sungai Senyap', x: SCHOOL_POS.x, z: SCHOOL_POS.z + 3, r: 11 },
  { id: 'chief', name: 'Rumah Ketua Kampung', x: CHIEF_POS.x, z: CHIEF_POS.z, r: 8 },
  { id: 'stor', name: 'Stor Lama', x: STOR_POS.x, z: STOR_POS.z, r: 3 },
  { id: 'forest-edge', name: 'Hutan Larangan', x: roadX(-128), z: -129, r: 5 },
  { id: 'hut', name: 'Pondok Pak Dollah', x: HUT_POS.x, z: HUT_POS.z, r: 4 },
  { id: 'giant-tree', name: 'Pokok Ara Tua', x: GIANT_TREE_POS.x, z: GIANT_TREE_POS.z, r: 8 },
  { id: 'old-well', name: 'Perigi Lama', x: OLD_WELL_POS.x, z: OLD_WELL_POS.z, r: 4 },
  { id: 'tunnel', name: 'Terowong', x: TUNNEL_X, z: TUNNEL_START_Z - 4, r: 4 },
  { id: 'gate-iron', name: 'Pintu Besi', x: GATE_X - 2, z: TUNNEL_JUNCTION_Z, r: 3 },
] as const;

/** Sheltered rectangles (no rain): built from the placements on the client. */
export const UNDERGROUND_RECT = { minX: 100, maxX: 175, minZ: -130, maxZ: -20 };

export function kampungColliders(): BoxCollider[] {
  const boxes = KAMPUNG_PROPS.flatMap((p) => propColliders(p.kind, { length: p.length, id: p.id }).map((b) => placeBox(b, p)));
  // the east edge of the overground map (keeps the tunnel complex separate)
  boxes.push({ x: OVERGROUND_MAX_X + 0.5, z: (KAMPUNG_BOUNDS.minZ + KAMPUNG_BOUNDS.maxZ) / 2, hx: 0.5, hz: (KAMPUNG_BOUNDS.maxZ - KAMPUNG_BOUNDS.minZ) / 2, yaw: 0, y0: -5, y1: 20, tag: 'edge' });
  // the tunnel is enclosed: walls cover the rest of the unused space around it
  return boxes;
}

export function buildKampungWorld(): CollisionWorld {
  return new CollisionWorld(kampungColliders(), kampungTerrain, KAMPUNG_BOUNDS);
}

/** Handy for tests: world-space position of a point given in a prop's local space. */
export function localToWorld(p: { x: number; z: number; yaw: number }, lx: number, lz: number) {
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  return { x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c };
}

export const HUT_STEP_Z = HUT.step.z;
