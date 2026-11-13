import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHIEF_HOUSE,
  CHIEF_POS,
  CROSSROADS,
  FORBIDDEN_GATE_ID,
  GATE_X,
  CHAMBER_POS,
  KAMPUNG_BOUNDS,
  KAMPUNG_PROPS,
  KAMPUNG_SPAWNS,
  OLD_WELL_POS,
  PLAYER,
  PORTALS,
  ROADS,
  SCHOOL,
  SCHOOL_POS,
  STOR,
  STOR_POS,
  TUNNEL_END_Z,
  TUNNEL_JUNCTION_Z,
  TUNNEL_START_Z,
  TUNNEL_X,
  areaAt,
  buildKampungWorld,
  createPlayerState,
  localToWorld,
  roadX,
  stepPlayer,
  type CollisionWorld,
  type PlayerState,
} from '@tmf/shared';
import { GameSession } from '../src/game/GameSession';

const DT = 1 / 60;
const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));

function walkTo(s: PlayerState, w: CollisionWorld, tx: number, tz: number, max = 40, crouch = false): boolean {
  for (let t = 0; t < max; t += DT) {
    if (Math.hypot(tx - s.x, tz - s.z) < 0.3) return true;
    stepPlayer(s, { forward: 1, right: 0, sprint: false, crouch, yaw: yawTo(s.x, s.z, tx, tz), pitch: 0 }, DT, w);
  }
  return false;
}

function route(s: PlayerState, w: CollisionWorld, points: { x: number; z: number }[], label: string) {
  for (const [i, p] of points.entries()) {
    assert.ok(walkTo(s, w, p.x, p.z), `${label}: stuck before waypoint ${i} (${p.x.toFixed(1)},${p.z.toFixed(1)}) at ${s.x.toFixed(2)},${s.z.toFixed(2)} y=${s.y.toFixed(2)}`);
  }
}

const spawnPlayer = (w: CollisionWorld) => createPlayerState(KAMPUNG_SPAWNS[0].x, KAMPUNG_SPAWNS[0].z, 0, w);
const mainRoadTo = (z: number) => {
  const pts: { x: number; z: number }[] = [];
  for (let zz = 36; zz >= z; zz -= 6) pts.push({ x: roadX(zz), z: zz });
  pts.push({ x: roadX(z), z });
  return pts;
};
const school = (lx: number, lz: number) => localToWorld(SCHOOL_POS, lx, lz);
const chief = (lx: number, lz: number) => localToWorld(CHIEF_POS, lx, lz);
const stor = (lx: number, lz: number) => localToWorld(STOR_POS, lx, lz);

describe('Kampung map – the areas are connected', () => {
  it('road: car → crossroads (the old road block is gone)', () => {
    const w = buildKampungWorld();
    const s = spawnPlayer(w);
    route(s, w, mainRoadTo(-86), 'main road');
    assert.equal(areaAt(s.x, s.z).id, 'central');
  });

  it('crossroads → school lane → through the gate → into Kelas 2 and up to the teacher', () => {
    const w = buildKampungWorld();
    const s = createPlayerState(CROSSROADS.x, CROSSROADS.z, 0, w);
    const lane = ROADS.find((r) => r.id === 'school-lane')!.points;
    route(s, w, lane.slice(1, 4), 'school lane');
    const c = SCHOOL.classes[1];
    const door = c + SCHOOL.doorOffset;
    route(
      s,
      w,
      [school(door, SCHOOL.classDepth / 2 + 1.2), school(door, SCHOOL.classDepth / 2 - 0.2), school(door, 2.4), school(c + 0.7, 2.4), school(c + 0.7, -1.7)],
      'into class',
    );
    assert.equal(areaAt(s.x, s.z).id, 'school');
    assert.ok(Math.abs(s.y - SCHOOL.slabTop) < 1e-6 && s.surface === 'concrete');
  });

  it('school walls really are walls (no walking from the corridor through the classroom front)', () => {
    const w = buildKampungWorld();
    const s = createPlayerState(school(-6, SCHOOL.classDepth / 2 + 1.2).x, school(-6, SCHOOL.classDepth / 2 + 1.2).z, 0, w);
    const inside = school(-6, 0);
    assert.equal(walkTo(s, w, inside.x, inside.z, 5), false);
  });

  it("crossroads → chief's lane → stairs → verandah → house → bedroom", () => {
    const w = buildKampungWorld();
    const s = createPlayerState(CROSSROADS.x, CROSSROADS.z, 0, w);
    const lane = ROADS.find((r) => r.id === 'chief-lane')!.points;
    route(s, w, lane.slice(1), 'chief lane');
    const C = CHIEF_HOUSE;
    route(
      s,
      w,
      [{ x: 42.6, z: -84.5 }, chief(C.door.x, 7.4), chief(C.door.x, C.verandah.z), chief(C.door.x, C.depth / 2 - 0.5), chief(-0.5, 1.3), chief(3.0, 1.3), chief(3.0, 0)],
      'chief house',
    );
    assert.ok(Math.abs(s.y - C.floorTop) < 1e-6, `on the floor y=${s.y}`);
    assert.equal(areaAt(s.x, s.z).id, 'chief');
  });

  it('the storeroom hatch can be reached and leads to the tunnel; the tunnel leads back up', () => {
    const w = buildKampungWorld();
    const lanePts = ROADS.find((r) => r.id === 'chief-lane')!.points;
    const s = createPlayerState(lanePts[3].x, lanePts[3].z, 0, w);
    route(s, w, [{ x: 42.6, z: -84.5 }, { x: 42.6, z: -100.5 }, stor(0, STOR.hz + 1), stor(0, STOR.hz - 0.3), stor(STOR.hatch.x, STOR.hatch.z)], 'to hatch');
    const portal = PORTALS.find((p) => p.id === 'stor-down')!;
    assert.ok(Math.hypot(s.x - portal.from.x, s.z - portal.from.z) < portal.from.r, 'standing on the hatch');
  });

  it('forest path → giant tree clearing → old well', () => {
    const w = buildKampungWorld();
    const s = createPlayerState(roadX(-120), -120, 0, w);
    const path = ROADS.find((r) => r.id === 'forest-path')!.points;
    route(s, w, [{ x: roadX(-126), z: -126 }, ...path], 'forest path');
    route(s, w, [{ x: -9.5, z: -189 }, { x: -9.5, z: -197.5 }, { x: -18, z: -199 }, { x: -25.5, z: -200.6 }], 'to well');
    assert.equal(areaAt(s.x, s.z).id, 'forest');
    const well = PORTALS.find((p) => p.id === 'well-down')!;
    assert.ok(walkTo(s, w, OLD_WELL_POS.x, OLD_WELL_POS.z, 5) === false, 'the well itself is solid');
    assert.ok(Math.hypot(s.x - well.from.x, s.z - well.from.z) < well.from.r, 'close enough to climb down');
  });

  it('tunnel: walk from the hatch to the junction; the iron gate blocks until opened', () => {
    const w = buildKampungWorld();
    const s = createPlayerState(TUNNEL_X, TUNNEL_START_Z - 2.5, 0, w);
    assert.equal(areaAt(s.x, s.z).id, 'tunnel');
    route(s, w, [{ x: TUNNEL_X, z: TUNNEL_JUNCTION_Z }, { x: GATE_X - 3, z: TUNNEL_JUNCTION_Z }], 'tunnel');
    assert.equal(walkTo(s, w, CHAMBER_POS.x, CHAMBER_POS.z, 6), false, 'gate closed');
    assert.ok(s.x < GATE_X);
    w.setOpen(FORBIDDEN_GATE_ID, true);
    assert.ok(walkTo(s, w, CHAMBER_POS.x, CHAMBER_POS.z, 12), 'gate open → chamber');
    assert.equal(areaAt(s.x, s.z).id, 'forbidden');
    // and the north branch reaches exit B
    const s2 = createPlayerState(TUNNEL_X, TUNNEL_JUNCTION_Z + 3, 0, w);
    assert.ok(walkTo(s2, w, TUNNEL_X, TUNNEL_END_Z + 0.8, 20));
  });

  it('the tunnel complex cannot be reached by walking overground', () => {
    const w = buildKampungWorld();
    const s = createPlayerState(60, -90, -Math.PI / 2, w);
    for (let t = 0; t < 8; t += DT) stepPlayer(s, { forward: 1, right: 0, sprint: true, crouch: false, yaw: -Math.PI / 2, pitch: 0 }, DT, w);
    assert.ok(s.x < 70, `stopped at the edge x=${s.x}`);
  });

  it('every prop is inside the bounds; every portal lands somewhere free', () => {
    const w = buildKampungWorld();
    const B = KAMPUNG_BOUNDS;
    for (const p of KAMPUNG_PROPS) assert.ok(p.x > B.minX && p.x < B.maxX && p.z > B.minZ && p.z < B.maxZ, p.kind);
    for (const p of PORTALS) {
      assert.equal(w.overlaps(p.to.x, p.to.z, PLAYER.radius, 0.45, 1.7), false, `${p.id} lands inside something`);
      for (const q of PORTALS) assert.ok(Math.hypot(p.to.x - q.from.x, p.to.z - q.from.z) > q.from.r + 0.5, `${p.id} lands in ${q.id}`);
    }
  });

  it('random wandering in the forest never gets stuck inside geometry', () => {
    const w = buildKampungWorld();
    const s = createPlayerState(2, -160, 0, w);
    let seed = 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let yaw = 0;
    for (let i = 0; i < 60 * 120; i++) {
      if (i % 40 === 0) yaw = rnd() * 6.28;
      stepPlayer(s, { forward: 1, right: rnd() - 0.5, sprint: rnd() < 0.3, crouch: false, yaw, pitch: 0 }, DT, w);
      assert.equal(w.overlaps(s.x, s.z, PLAYER.radius * 0.9, s.y + PLAYER.stepHeight, s.y + PLAYER.standHeight), false, `inside at ${s.x},${s.z}`);
    }
  });
});

describe('portals on the server', () => {
  it('refuses portals you are not standing at; accepts the ones you are', () => {
    const g = new GameSession({ world: buildKampungWorld(), spawns: KAMPUNG_SPAWNS, mode: 'solo' });
    g.addPlayer('p', 'P');
    assert.deepEqual(g.usePortal('p', 'stor-down'), { ok: false, error: 'TOO_FAR' });
    assert.deepEqual(g.usePortal('p', 'nope'), { ok: false, error: 'TOO_FAR' });
    const hatch = PORTALS.find((q) => q.id === 'stor-down')!;
    g.teleport('p', hatch.from.x, hatch.from.z);
    assert.deepEqual(g.usePortal('p', 'stor-down'), { ok: false, error: 'LOCKED' }, 'hatch still nailed shut');
    g.setOpen('hatch:stor', true);
    const r = g.usePortal('p', 'stor-down');
    assert.ok(r.ok && r.correction.teleport && Math.abs(r.correction.x - TUNNEL_X) < 1e-9);
    const sync = g.syncFor('p')!;
    assert.equal(areaAt(sync.you.x, sync.you.z).id, 'tunnel');
  });
});
