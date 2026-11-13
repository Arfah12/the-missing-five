/**
 * Static world collision for first-person characters.
 *
 * The world is a heightfield (the muddy ground) plus solid boxes that may be
 * rotated around the Y axis. That is enough for buildings, walls, stairs,
 * fences, cars and props, and it is cheap and fully deterministic, so the
 * server can run exactly the same code to validate movement.
 *
 * A box blocks a character only if it overlaps the character's body above
 * the step height; a box whose top is within the step height is walkable
 * (stairs, kerbs, floors, verandahs).
 */

export type Surface = 'mud' | 'wood' | 'concrete' | 'metal';

export interface BoxCollider {
  /** Centre on the ground plane (world space). */
  x: number;
  z: number;
  /** Half extents along the box's local X and Z axes. */
  hx: number;
  hz: number;
  /** Rotation around +Y, radians (same convention as three.js `rotation.y`). */
  yaw: number;
  /** Bottom and top heights (world space). */
  y0: number;
  y1: number;
  surface?: Surface;
  /** Optional label, handy in tests and debugging. */
  tag?: string;
  /** Doors and gates: colliders that can be switched off (opened) at runtime. */
  id?: string;
}

/** A box described in a prop's local space (before placement). */
export type LocalBox = Omit<BoxCollider, 'yaw'> & { yaw?: number };

export interface Placement {
  x: number;
  z: number;
  yaw: number;
  /** Vertical offset (e.g. a prop standing on a slab). */
  y?: number;
}

/** Transform a prop-local box into world space. */
export function placeBox(b: LocalBox, p: Placement): BoxCollider {
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  // three.js rotation.y: x' = x·cos + z·sin, z' = −x·sin + z·cos
  return {
    ...b,
    x: p.x + b.x * c + b.z * s,
    z: p.z - b.x * s + b.z * c,
    yaw: p.yaw + (b.yaw ?? 0),
    y0: b.y0 + (p.y ?? 0),
    y1: b.y1 + (p.y ?? 0),
  };
}

export interface GroundSample {
  height: number;
  surface: Surface;
}

export type TerrainFn = (x: number, z: number) => number;

const CELL = 4;
const EPS = 1e-6;

interface Indexed extends BoxCollider {
  cos: number;
  sin: number;
}

export class CollisionWorld {
  readonly boxes: readonly BoxCollider[];
  private readonly items: Indexed[];
  private readonly grid = new Map<string, number[]>();
  private readonly stamp: Uint32Array;
  private query = 0;
  /** Ids of dynamic colliders that are currently open (not solid). */
  private readonly open = new Set<string>();

  constructor(
    boxes: BoxCollider[],
    readonly terrain: TerrainFn,
    /** Hard world limits (fail-safe in case a wall is missing). */
    readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  ) {
    this.boxes = boxes;
    this.items = boxes.map((b) => ({ ...b, cos: Math.cos(b.yaw), sin: Math.sin(b.yaw) }));
    this.stamp = new Uint32Array(boxes.length);
    this.items.forEach((b, i) => {
      // conservative AABB of the rotated box
      const ex = Math.abs(b.hx * b.cos) + Math.abs(b.hz * b.sin);
      const ez = Math.abs(b.hx * b.sin) + Math.abs(b.hz * b.cos);
      const x0 = Math.floor((b.x - ex) / CELL);
      const x1 = Math.floor((b.x + ex) / CELL);
      const z0 = Math.floor((b.z - ez) / CELL);
      const z1 = Math.floor((b.z + ez) / CELL);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const key = `${cx},${cz}`;
          let list = this.grid.get(key);
          if (!list) this.grid.set(key, (list = []));
          list.push(i);
        }
      }
    });
  }

  /** Opens (removes) or closes (restores) every collider with this id. */
  setOpen(id: string, open: boolean): void {
    if (open) this.open.add(id);
    else this.open.delete(id);
  }

  isOpen(id: string): boolean {
    return this.open.has(id);
  }

  /** Boxes whose footprint may touch a circle at (x, z). */
  private near(x: number, z: number, r: number, out: Indexed[]): Indexed[] {
    out.length = 0;
    this.query = (this.query + 1) >>> 0 || 1;
    const x0 = Math.floor((x - r) / CELL);
    const x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL);
    const z1 = Math.floor((z + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.grid.get(`${cx},${cz}`);
        if (!list) continue;
        for (const i of list) {
          if (this.stamp[i] === this.query) continue;
          this.stamp[i] = this.query;
          const item = this.items[i];
          if (item.id !== undefined && this.open.has(item.id)) continue;
          out.push(item);
        }
      }
    }
    return out;
  }

  private scratch: Indexed[] = [];

  /** Box-local coordinates of a world point. */
  private static local(b: Indexed, x: number, z: number): [number, number] {
    const dx = x - b.x;
    const dz = z - b.z;
    // inverse of placeBox rotation
    return [dx * b.cos - dz * b.sin, dx * b.sin + dz * b.cos];
  }

  /**
   * Highest walkable surface under (x, z) that is no higher than
   * `maxY` (feet + step height). Falls back to the terrain.
   */
  groundAt(x: number, z: number, maxY: number): GroundSample {
    let height = this.terrain(x, z);
    let surface: Surface = 'mud';
    for (const b of this.near(x, z, 0, this.scratch)) {
      if (b.y1 > maxY || b.y1 <= height) continue;
      const [lx, lz] = CollisionWorld.local(b, x, z);
      if (Math.abs(lx) <= b.hx && Math.abs(lz) <= b.hz) {
        height = b.y1;
        surface = b.surface ?? 'concrete';
      }
    }
    return { height, surface };
  }

  /**
   * Push a vertical cylinder (centre x/z, radius r, spanning [yLow, yHigh])
   * out of every overlapping box. Returns the corrected position.
   */
  resolve(x: number, z: number, r: number, yLow: number, yHigh: number): { x: number; z: number; hit: boolean } {
    let hit = false;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const b of this.near(x, z, r + 0.05, this.scratch)) {
        if (b.y1 <= yLow || b.y0 >= yHigh) continue;
        const [lx, lz] = CollisionWorld.local(b, x, z);
        const cx = Math.max(-b.hx, Math.min(b.hx, lx));
        const cz = Math.max(-b.hz, Math.min(b.hz, lz));
        let px = lx - cx;
        let pz = lz - cz;
        const d2 = px * px + pz * pz;
        if (d2 >= r * r) continue;
        let pushX: number;
        let pushZ: number;
        if (d2 > EPS) {
          const d = Math.sqrt(d2);
          const k = (r - d) / d;
          pushX = px * k;
          pushZ = pz * k;
        } else {
          // centre is inside the box: leave through the nearest face
          const ox = b.hx - Math.abs(lx);
          const oz = b.hz - Math.abs(lz);
          if (ox < oz) {
            pushX = (lx >= 0 ? 1 : -1) * (ox + r);
            pushZ = 0;
          } else {
            pushX = 0;
            pushZ = (lz >= 0 ? 1 : -1) * (oz + r);
          }
        }
        // back to world space
        px = pushX * b.cos + pushZ * b.sin;
        pz = -pushX * b.sin + pushZ * b.cos;
        x += px;
        z += pz;
        moved = hit = true;
      }
      if (!moved) break;
    }
    const { minX, maxX, minZ, maxZ } = this.bounds;
    if (x < minX + r || x > maxX - r || z < minZ + r || z > maxZ - r) hit = true;
    x = Math.max(minX + r, Math.min(maxX - r, x));
    z = Math.max(minZ + r, Math.min(maxZ - r, z));
    return { x, z, hit };
  }

  /** True if any box overlaps the cylinder (used for "can I stand up?"). */
  overlaps(x: number, z: number, r: number, yLow: number, yHigh: number): boolean {
    for (const b of this.near(x, z, r, this.scratch)) {
      if (b.y1 <= yLow || b.y0 >= yHigh) continue;
      const [lx, lz] = CollisionWorld.local(b, x, z);
      const cx = Math.max(-b.hx, Math.min(b.hx, lx));
      const cz = Math.max(-b.hz, Math.min(b.hz, lz));
      if ((lx - cx) ** 2 + (lz - cz) ** 2 < r * r - EPS) return true;
    }
    return false;
  }
}
