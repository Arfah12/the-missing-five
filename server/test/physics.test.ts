import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CollisionWorld,
  ENTRANCE_BOUNDS,
  ENTRANCE_PROPS,
  ENTRANCE_SPAWNS,
  PLAYER,
  SHOP,
  STILT_HOUSE,
  buildEntranceWorld,
  createPlayerState,
  placeBox,
  roadX,
  stepPlayer,
  type MoveInput,
  type PlayerState,
} from '@tmf/shared';

const DT = 1 / 60;
const flat = () => 0;
const BIG = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };

const idle = (yaw = 0): MoveInput => ({ forward: 0, right: 0, sprint: false, crouch: false, yaw, pitch: 0 });

function run(s: PlayerState, world: CollisionWorld, input: MoveInput, seconds: number) {
  for (let t = 0; t < seconds; t += DT) stepPlayer(s, input, DT, world);
  return s;
}

/** Yaw that faces from (x,z) towards (tx,tz). Forward is (−sin yaw, −cos yaw). */
const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));

/** Walk to a point (simple steering), return true if reached. */
function walkTo(s: PlayerState, world: CollisionWorld, tx: number, tz: number, opts: { crouch?: boolean; maxSeconds?: number } = {}) {
  const max = opts.maxSeconds ?? 30;
  for (let t = 0; t < max; t += DT) {
    const d = Math.hypot(tx - s.x, tz - s.z);
    if (d < 0.25) return true;
    stepPlayer(s, { forward: 1, right: 0, sprint: false, crouch: !!opts.crouch, yaw: yawTo(s.x, s.z, tx, tz), pitch: 0 }, DT, world);
  }
  return false;
}

describe('movement basics', () => {
  const world = new CollisionWorld([], flat, BIG);

  it('walks forward (−Z) at walking speed', () => {
    const s = createPlayerState(0, 0, 0, world);
    run(s, world, { ...idle(), forward: 1 }, 2);
    const speed = Math.hypot(s.vx, s.vz);
    assert.ok(Math.abs(speed - PLAYER.walkSpeed) < 0.05, `speed ${speed}`);
    assert.ok(s.z < -4 && Math.abs(s.x) < 1e-6, `pos ${s.x},${s.z}`);
  });

  it('strafes right relative to yaw', () => {
    const s = createPlayerState(0, 0, Math.PI / 2, world); // facing −X
    run(s, world, { ...idle(Math.PI / 2), right: 1 }, 1);
    assert.ok(s.z < -1, `right of −X is −Z, got z=${s.z}`);
  });

  it('diagonal movement is not faster', () => {
    const s = createPlayerState(0, 0, 0, world);
    run(s, world, { ...idle(), forward: 1, right: 1 }, 2);
    assert.ok(Math.hypot(s.vx, s.vz) <= PLAYER.walkSpeed + 1e-6);
  });

  it('sprint drains stamina, exhaustion blocks sprint, rest regenerates', () => {
    const s = createPlayerState(0, 0, 0, world);
    run(s, world, { ...idle(), forward: 1, sprint: true }, 1);
    assert.ok(Math.abs(Math.hypot(s.vx, s.vz) - PLAYER.sprintSpeed) < 0.05);
    run(s, world, { ...idle(), forward: 1, sprint: true }, 7);
    assert.equal(s.exhausted, true);
    assert.ok(Math.hypot(s.vx, s.vz) <= PLAYER.walkSpeed + 0.01, 'walks when exhausted');
    run(s, world, idle(), 3);
    assert.equal(s.exhausted, false);
    run(s, world, idle(), 6);
    assert.equal(s.stamina, 1);
  });

  it('crouching is slow and lowers the body', () => {
    const s = createPlayerState(0, 0, 0, world);
    run(s, world, { ...idle(), forward: 1, crouch: true }, 2);
    assert.equal(s.crouch, 1);
    assert.ok(Math.abs(Math.hypot(s.vx, s.vz) - PLAYER.crouchSpeed) < 0.05);
  });

  it('stops when input is released', () => {
    const s = createPlayerState(0, 0, 0, world);
    run(s, world, { ...idle(), forward: 1 }, 1);
    run(s, world, idle(), 1);
    assert.equal(Math.hypot(s.vx, s.vz), 0);
  });
});

describe('collision', () => {
  const wall = { x: 0, z: -3, hx: 5, hz: 0.1, yaw: 0, y0: 0, y1: 3 };

  it('a wall stops the player at radius distance', () => {
    const world = new CollisionWorld([wall], flat, BIG);
    const s = createPlayerState(0, 0, 0, world);
    run(s, world, { ...idle(), forward: 1, sprint: true }, 3);
    assert.ok(Math.abs(s.z - (-3 + 0.1 + PLAYER.radius)) < 0.01, `z=${s.z}`);
    assert.equal(s.blocked, true);
  });

  it('cannot tunnel through a thin wall at high speed / low framerate', () => {
    const world = new CollisionWorld([wall], flat, BIG);
    const s = createPlayerState(0, 0, 0, world);
    for (let i = 0; i < 40; i++) stepPlayer(s, { ...idle(), forward: 1, sprint: true }, 0.1, world);
    assert.ok(s.z > -3, `z=${s.z}`);
  });

  it('slides along a wall when walking into it at an angle', () => {
    const world = new CollisionWorld([wall], flat, BIG);
    const s = createPlayerState(0, -2.5, 0, world);
    run(s, world, { ...idle(-0.6), forward: 1 }, 1.5);
    assert.ok(s.x > 0.8, `slid to x=${s.x}`);
  });

  it('rotated boxes collide correctly', () => {
    const world = new CollisionWorld([{ ...wall, yaw: Math.PI / 4 }], flat, BIG);
    const s = createPlayerState(0, 0, 0, world);
    run(s, world, { ...idle(), forward: 1 }, 3);
    // it slides along the diagonal but never crosses it (check in the wall's local frame)
    const lz = s.x * Math.sin(Math.PI / 4) + (s.z + 3) * Math.cos(Math.PI / 4);
    assert.ok(lz >= 0.1 + PLAYER.radius - 0.01, `stays on its side of the diagonal wall, local z=${lz}`);
  });

  it('steps up a kerb but not a waist-high box', () => {
    const kerb = { x: 0, z: -3, hx: 2, hz: 1, yaw: 0, y0: 0, y1: 0.3, surface: 'concrete' as const };
    const crate = { x: 0, z: -3, hx: 2, hz: 1, yaw: 0, y0: 0, y1: 0.7 };
    let world = new CollisionWorld([kerb], flat, BIG);
    let s = createPlayerState(0, 0, 0, world);
    run(s, world, { ...idle(), forward: 1 }, 1.2);
    assert.ok(Math.abs(s.y - 0.3) < 1e-6 && s.surface === 'concrete', `on kerb y=${s.y}`);
    world = new CollisionWorld([crate], flat, BIG);
    s = createPlayerState(0, 0, 0, world);
    run(s, world, { ...idle(), forward: 1 }, 2);
    assert.equal(s.y, 0);
    assert.ok(s.z > -2 + 0.01 - PLAYER.radius - 0.02);
  });

  it('falls off a ledge with gravity and lands', () => {
    const deck = { x: 0, z: 0, hx: 1, hz: 1, yaw: 0, y0: 0, y1: 1.4 };
    const world = new CollisionWorld([deck], flat, BIG);
    const s = createPlayerState(0, 0, 0, world);
    assert.equal(s.y, 1.4);
    let airborne = 0;
    for (let t = 0; t < 1.2; t += DT) {
      stepPlayer(s, { ...idle(), forward: 1 }, DT, world);
      if (!s.grounded) airborne += DT;
    }
    assert.ok(airborne > 0.2 && airborne < 0.6, `fell for ${airborne.toFixed(2)}s (free fall from 1.4 m ≈ 0.37 s)`);
    run(s, world, idle(), 1);
    assert.equal(s.y, 0);
    assert.equal(s.grounded, true);
  });

  it('crouch to pass under a low beam; cannot stand up under it', () => {
    const beam = { x: 0, z: -3, hx: 3, hz: 1, yaw: 0, y0: 1.3, y1: 2 };
    const world = new CollisionWorld([beam], flat, BIG);
    let s = createPlayerState(0, 0, 0, world);
    run(s, world, { ...idle(), forward: 1 }, 2);
    assert.ok(s.z > -2, 'standing: blocked by beam');
    s = createPlayerState(0, 0, 0, world);
    run(s, world, { ...idle(), forward: 1, crouch: true }, 2.2);
    assert.ok(s.z < -2.5, `crouched: under the beam, z=${s.z}`);
    run(s, world, idle(), 1);
    const head = s.y + PLAYER.standHeight + (PLAYER.crouchHeight - PLAYER.standHeight) * s.crouch;
    assert.ok(s.crouch > 0.5 && head <= 1.3 + 0.02, `can't stand up into the beam (head at ${head.toFixed(2)})`);
  });

  it('world bounds act as a wall', () => {
    const world = new CollisionWorld([], flat, { minX: -5, maxX: 5, minZ: -5, maxZ: 5 });
    const s = createPlayerState(0, 0, 0, world);
    run(s, world, { ...idle(), forward: 1, sprint: true }, 5);
    assert.ok(s.z >= -5 + PLAYER.radius - 1e-9);
  });
});

describe('Village Entrance map', () => {
  const world = buildEntranceWorld();

  it('every spawn point is clear and on the ground', () => {
    for (const sp of ENTRANCE_SPAWNS) {
      assert.equal(world.overlaps(sp.x, sp.z, PLAYER.radius, 0.05, PLAYER.standHeight), false, `spawn ${sp.x},${sp.z}`);
    }
  });

  it('spawn points do not overlap each other', () => {
    for (let i = 0; i < ENTRANCE_SPAWNS.length; i++)
      for (let j = i + 1; j < ENTRANCE_SPAWNS.length; j++) {
        const a = ENTRANCE_SPAWNS[i];
        const b = ENTRANCE_SPAWNS[j];
        assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= PLAYER.radius * 2);
      }
  });

  it('all props are inside the map bounds', () => {
    for (const p of ENTRANCE_PROPS) {
      assert.ok(p.x > ENTRANCE_BOUNDS.minX && p.x < ENTRANCE_BOUNDS.maxX && p.z > ENTRANCE_BOUNDS.minZ && p.z < ENTRANCE_BOUNDS.maxZ, `${p.kind}`);
    }
  });

  it('the road is walkable from the car to the road block', () => {
    const sp = ENTRANCE_SPAWNS[0];
    const s = createPlayerState(sp.x, sp.z, sp.yaw, world);
    for (let z = 36; z >= -44; z -= 4) assert.ok(walkTo(s, world, roadX(z), z), `stuck near z=${z} at ${s.x.toFixed(2)},${s.z.toFixed(2)}`);
  });

  it('the fallen log blocks the way back', () => {
    const sp = ENTRANCE_SPAWNS[0];
    const s = createPlayerState(sp.x, sp.z, sp.yaw, world);
    assert.equal(walkTo(s, world, roadX(46), 45.8, { maxSeconds: 6 }), false);
    assert.ok(s.z < 44.5);
  });

  it('you can walk into the shop through its door, but not through its walls', () => {
    const shop = ENTRANCE_PROPS.find((p) => p.kind === 'shop')!;
    const toWorld = (lx: number, lz: number) => placeBox({ x: lx, z: lz, hx: 0, hz: 0, y0: 0, y1: 0 }, shop);
    const s = createPlayerState(roadX(-4), -4, 0, world);
    const porch = toWorld(0, SHOP.depth / 2 + 1.0);
    const doorway = toWorld(0, SHOP.depth / 2 - 0.1);
    const inside = toWorld(0.3, -0.6);
    assert.ok(walkTo(s, world, porch.x, porch.z), 'reach the porch');
    assert.ok(Math.abs(s.y - SHOP.slabTop) < 1e-6 && s.surface === 'concrete', `on the slab y=${s.y}`);
    assert.ok(walkTo(s, world, doorway.x, doorway.z), 'reach the doorway');
    assert.ok(walkTo(s, world, inside.x, inside.z), 'reach the interior');
    // try to leave through the back wall
    const behind = toWorld(0, -SHOP.depth / 2 - 2);
    assert.equal(walkTo(s, world, behind.x, behind.z, { maxSeconds: 4 }), false);
  });

  it('you can climb the stairs onto the stilt-house verandah', () => {
    const house = ENTRANCE_PROPS.find((p) => p.kind === 'stiltHouse' && p.lit)!;
    const toWorld = (lx: number, lz: number) => placeBox({ x: lx, z: lz, hx: 0, hz: 0, y0: 0, y1: 0 }, house);
    const s = createPlayerState(roadX(-17), -17, 0, world);
    const foot = toWorld(STILT_HOUSE.verandah.x, 6.4);
    const top = toWorld(STILT_HOUSE.verandah.x, STILT_HOUSE.verandah.z);
    assert.ok(walkTo(s, world, foot.x, foot.z), 'reach the foot of the stairs');
    assert.ok(walkTo(s, world, top.x, top.z), `climb the stairs (stuck at y=${s.y.toFixed(2)})`);
    assert.ok(Math.abs(s.y - (STILT_HOUSE.stilt + 0.09)) < 1e-6 && s.surface === 'wood', `on verandah y=${s.y}`);
    // and walk back down
    assert.ok(walkTo(s, world, foot.x, foot.z), 'walk down the stairs');
    assert.ok(s.y < 0.1);
  });

  it('the verandah cannot be climbed from the side (railings)', () => {
    const house = ENTRANCE_PROPS.find((p) => p.kind === 'stiltHouse' && p.lit)!;
    const toWorld = (lx: number, lz: number) => placeBox({ x: lx, z: lz, hx: 0, hz: 0, y0: 0, y1: 0 }, house);
    const s = createPlayerState(roadX(-17), -17, 0, world);
    const side = toWorld(-2.6, 3.6);
    walkTo(s, world, side.x, side.z, { maxSeconds: 8 });
    assert.ok(s.y < 0.2, 'stays on the ground');
  });

  it('crouching lets you crawl under a stilt house, standing does not', () => {
    const house = ENTRANCE_PROPS.find((p) => p.kind === 'stiltHouse' && !p.lit)!;
    const toWorld = (lx: number, lz: number) => placeBox({ x: lx, z: lz, hx: 0, hz: 0, y0: 0, y1: 0 }, house);
    const outside = toWorld(-1.6, -4.5);
    const under = toWorld(-1.6, -1.2);
    let s = createPlayerState(outside.x, outside.z, 0, world);
    assert.equal(walkTo(s, world, under.x, under.z, { maxSeconds: 4 }), false, 'standing is blocked');
    s = createPlayerState(outside.x, outside.z, 0, world);
    assert.ok(walkTo(s, world, under.x, under.z, { crouch: true, maxSeconds: 8 }), `crouched gets under (at ${s.x.toFixed(2)},${s.z.toFixed(2)})`);
  });

  it('long random walk never ends inside a collider or outside bounds', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const sp = ENTRANCE_SPAWNS[2];
    const s = createPlayerState(sp.x, sp.z, sp.yaw, world);
    let input: MoveInput = idle();
    for (let i = 0; i < 60 * 240; i++) {
      if (i % 50 === 0) input = { forward: rnd() * 2 - 0.6, right: rnd() * 2 - 1, sprint: rnd() < 0.4, crouch: rnd() < 0.15, yaw: rnd() * Math.PI * 2, pitch: 0 };
      stepPlayer(s, input, DT, world);
      const h = PLAYER.standHeight + (PLAYER.crouchHeight - PLAYER.standHeight) * s.crouch;
      assert.equal(world.overlaps(s.x, s.z, PLAYER.radius * 0.9, s.y + PLAYER.stepHeight, s.y + h), false, `stuck in geometry at ${s.x},${s.z},${s.y}`);
      assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z));
      assert.ok(s.y >= world.terrain(s.x, s.z) - 1e-6, 'never below ground');
    }
  });
});
