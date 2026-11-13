import { CollisionWorld, placeBox, type BoxCollider } from '../collision';
import { smoothstep } from '../math';
import { propColliders, type PropKind } from '../props';

/**
 * Area 1 — Village Entrance (Pintu Masuk Kampung).
 *
 * Pure layout data: the client turns it into meshes and lights, and both
 * sides turn it into the same collision world. North is −Z; players arrive
 * from the south (+Z) where their car broke down and a fallen tree now
 * blocks the way back.
 */

/** Centre line of the muddy road (bends gently into the fog). */
export const roadX = (z: number) => 1.4 * Math.sin(z * 0.055) - 0.4;
export const ROAD_HALF_WIDTH = 2.2;

export const ENTRANCE_BOUNDS = { minX: -22, maxX: 22, minZ: -50, maxZ: 46 } as const;

export interface PropPlacement {
  kind: PropKind;
  x: number;
  z: number;
  yaw: number;
  seed?: number;
  /** Prop-specific extras (e.g. a lit window, palm height). */
  lit?: boolean;
  height?: number;
  /** Street lamp facing: +1 arm towards +X, −1 towards −X. */
  arm?: 1 | -1;
  working?: boolean;
  /** Walls / tunnel pieces: length in metres. */
  length?: number;
  /** Switchable colliders (gates). */
  id?: string;
  /** Visual variant (e.g. a shop's sign). */
  variant?: string;
}

const L = Math.PI / 2; // face +X (towards the road from the west side)
const R = -Math.PI / 2; // face −X (towards the road from the east side)

const poleZs = [30, 17, 4, -9, -22, -35, -48];

export const ENTRANCE_PROPS: PropPlacement[] = [
  // arrival: the car that died, the tree that fell behind it
  { kind: 'car', x: roadX(36) + 2.75, z: 36, yaw: 0.06 },
  { kind: 'log', x: roadX(44.5), z: 44.5, yaw: 0.1 },

  // welcome sign and the village gate
  { kind: 'sign', x: roadX(28) - 3.4, z: 28, yaw: 0.35 },
  { kind: 'gate', x: roadX(18), z: 18, yaw: 0 },

  // utility poles along the west verge; one street lamp still works
  ...poleZs.map(
    (z): PropPlacement =>
      z === 17
        ? { kind: 'lampPole', x: roadX(z) - 3.2, z, yaw: 0, arm: 1, working: true }
        : z === -9
          ? { kind: 'lampPole', x: roadX(z) - 3.2, z, yaw: 0, arm: 1, working: false }
          : { kind: 'pole', x: roadX(z) - 3.2, z, yaw: 0 },
  ),

  // bus stop (perhentian bas) on the east verge
  { kind: 'busStop', x: roadX(8) + 4.7, z: 8, yaw: R },
  { kind: 'drum', x: roadX(8) + 7.4, z: 10.4, yaw: 0 },

  // Kedai Runcit on the west side – the one building you can walk into
  { kind: 'shop', x: roadX(-4) - 8.6, z: -4, yaw: L },
  { kind: 'drum', x: roadX(-4) - 4.6, z: 0.6, yaw: 0 },
  { kind: 'drum', x: roadX(-4) - 4.3, z: 1.3, yaw: 0 },
  { kind: 'crate', x: roadX(-4) - 4.9, z: -8.6, yaw: 0.3 },
  { kind: 'crate', x: roadX(-4) - 5.1, z: -9.4, yaw: 0.9 },

  // stilt houses
  { kind: 'stiltHouse', x: roadX(-17) + 8.6, z: -17, yaw: R + 0.18, lit: true, seed: 3 },
  { kind: 'stiltHouse', x: roadX(-37) - 9.4, z: -37, yaw: L - 0.22, lit: false, seed: 8 },

  // broken fences
  { kind: 'fence', x: roadX(25) + 3.7, z: 25, yaw: L + 0.04 },
  { kind: 'fence', x: roadX(21.8) + 3.75, z: 21.8, yaw: L - 0.12 },
  { kind: 'fence', x: roadX(-28) - 4.2, z: -28, yaw: L },
  { kind: 'fence', x: roadX(-31) - 4.1, z: -31, yaw: L + 0.25 },

  // road closed further in (Central Village comes in a later build)
  { kind: 'barrier', x: roadX(-46) - 0.9, z: -46, yaw: 0.08 },
  { kind: 'barrier', x: roadX(-46.6) + 1.6, z: -46.6, yaw: -0.2 },

  // coconut palms
  ...(
    [
      [6.4, 31, 7.4],
      [-6.3, 22, 8.1],
      [9.8, 14, 7],
      [-7.5, 9, 6.6],
      [10.6, -6, 8],
      [-13.5, -14, 7.6],
      [5.2, -27, 7],
      [11.5, -40, 8.4],
      [-12, 36, 7.2],
    ] as const
  ).map(([x, z, h], i): PropPlacement => ({ kind: 'palm', x, z, yaw: 0, seed: 31 + i * 17, height: h })),
];

/** Ground is flattened under buildings so floors and stilts sit properly. */
const FLATS = ENTRANCE_PROPS.filter((p) => p.kind === 'shop' || p.kind === 'stiltHouse' || p.kind === 'busStop' || p.kind === 'gate').map(
  (p) => ({ x: p.x, z: p.z, r: p.kind === 'shop' ? 6 : p.kind === 'stiltHouse' ? 5.8 : 3.2 }),
);

/** Terrain height (m). Flat, slightly sunken road; gentle bumps elsewhere. */
export function entranceTerrain(x: number, z: number): number {
  const fromRoad = Math.abs(x - roadX(z));
  const roadT = smoothstep((fromRoad - (ROAD_HALF_WIDTH + 0.4)) / 3);
  let flat = 1;
  for (const f of FLATS) {
    const d = Math.hypot(x - f.x, z - f.z);
    flat = Math.min(flat, smoothstep((d - f.r) / 4));
  }
  const bump = 0.22 * Math.sin(x * 0.23 + 1.3) * Math.cos(z * 0.19 - 0.7) + 0.07 * Math.sin(x * 0.71 + z * 0.53) + 0.04;
  return bump * roadT * flat - 0.03 * (1 - roadT);
}

/** Where players appear (up to five), facing north into the village. */
export const ENTRANCE_SPAWNS = [0, -1, 1, -2, 2].map((i) => ({ x: roadX(39) + i * 0.75, z: 39.5 + Math.abs(i) * 0.5, yaw: 0 }));

/** Named places – shown on screen when a player walks in. */
export const ENTRANCE_LANDMARKS = [
  { id: 'arrival', name: 'The Broken-Down Car', x: roadX(37), z: 37, r: 6 },
  { id: 'gate', name: 'Gerbang Kampung Hujan', x: roadX(18), z: 18, r: 4.5 },
  { id: 'busstop', name: 'Perhentian Bas', x: roadX(8) + 4.7, z: 8, r: 3.5 },
  { id: 'shop', name: 'Kedai Runcit Pak Leman', x: roadX(-4) - 8.6, z: -4, r: 5 },
  { id: 'house', name: 'Rumah Tok Senah', x: roadX(-17) + 8.6, z: -17, r: 6 },
  { id: 'closed', name: 'Jalan Ditutup', x: roadX(-46), z: -46, r: 5 },
] as const;

export const ENTRANCE_AREA_NAME = 'Village Entrance';

export function entranceColliders(): BoxCollider[] {
  return ENTRANCE_PROPS.flatMap((p) => propColliders(p.kind).map((b) => placeBox(b, p)));
}

export function buildEntranceWorld(): CollisionWorld {
  return new CollisionWorld(entranceColliders(), entranceTerrain, ENTRANCE_BOUNDS);
}
