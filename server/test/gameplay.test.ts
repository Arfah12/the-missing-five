import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BLEEDOUT_S,
  CHAMBER_POS,
  DOCS,
  DOOR_KELAS3,
  DOOR_STOR,
  FORBIDDEN_GATE_ID,
  HATCH_STOR,
  INTERACTABLES,
  ITEM_SPAWNS,
  KAMPUNG_SPAWNS,
  MAX_HEALTH,
  PLAYER,
  REVIVE_HEALTH,
  REVIVE_S,
  WELL_PLANKS,
  buildGameWorld,
  computeObjectives,
  parseAction,
  type InteractAction,
} from '@tmf/shared';
import { GameSession } from '../src/game/GameSession';

let now = 1_000_000;
const clock = () => now;
function session(mode: 'solo' | 'coop' = 'coop') {
  now = 1_000_000;
  return new GameSession({ world: buildGameWorld(), spawns: KAMPUNG_SPAWNS, mode, now: clock });
}

const world = buildGameWorld();

/** A free spot to stand from which (x, y, z) is within reach. */
function standingSpot(x: number, y: number, z: number, maxR = 2.0) {
  for (let r = 0.5; r <= maxR; r += 0.25) {
    for (let a = 0; a < 24; a++) {
      const sx = x + Math.cos((a / 24) * Math.PI * 2) * r;
      const sz = z + Math.sin((a / 24) * Math.PI * 2) * r;
      // try standing on whatever floor is around (ground, slab, house floor)
      for (const probe of [y + 0.4, y - 0.3, 0.5, 2.0]) {
        const g = world.groundAt(sx, sz, probe);
        if (Math.abs(g.height + 1.2 - y) > 2.0) continue;
        if (world.overlaps(sx, sz, PLAYER.radius, g.height + PLAYER.stepHeight, g.height + PLAYER.standHeight)) continue;
        return { x: sx, y: g.height, z: sz };
      }
    }
  }
  return null;
}

/** Puts a player right next to something, like they walked there. */
function goTo(g: GameSession, id: string, x: number, y: number, z: number) {
  const spot = standingSpot(x, y, z);
  assert.ok(spot, `nowhere to stand near ${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}`);
  g.teleport(id, spot.x, spot.z);
}

const act = (type: InteractAction['type'], extra: Record<string, unknown> = {}) => parseAction({ type, ...extra })!;
const item = (id: string) => ITEM_SPAWNS.find((i) => i.id === id)!;
const thing = (id: string) => INTERACTABLES.find((i) => i.id === id)!;

function pick(g: GameSession, pid: string, id: string) {
  const it = item(id);
  goTo(g, pid, it.x, it.y, it.z);
  return g.interact(pid, id, act('pickup'));
}

describe('gameplay data', () => {
  it('every item and document exists and every item can be reached', () => {
    for (const it of ITEM_SPAWNS) {
      if (it.doc) assert.ok(DOCS[it.doc], `missing doc ${it.doc}`);
      assert.ok(standingSpot(it.x, it.y, it.z), `${it.id} cannot be reached`);
    }
    for (const it of INTERACTABLES) {
      if (it.doc) assert.ok(DOCS[it.doc]);
      assert.ok(standingSpot(it.x, it.y, it.z, 2.4), `${it.id} cannot be reached`);
    }
  });

  it('rejects malformed actions', () => {
    assert.equal(parseAction({ type: 'code', code: '12a4' }), null);
    assert.equal(parseAction({ type: 'tune', freq: 1e9 }), null);
    assert.equal(parseAction('pickup'), null);
    assert.deepEqual(parseAction({ type: 'toggle', index: 7 }), { type: 'toggle', index: undefined });
  });
});

describe('items, inventory and journal', () => {
  it('picking up needs you to be close; journal items are shared, tools go to your slots', () => {
    const g = session();
    g.addPlayer('a', 'Aiman');
    g.addPlayer('b', 'Balqis');
    assert.deepEqual(g.interact('a', 'crowbar', act('pickup')), { ok: false, error: 'TOO_FAR', message: undefined });
    const r = pick(g, 'a', 'crowbar');
    assert.ok(r.ok);
    assert.equal(g.privateState('a')!.inventory[0]?.type, 'crowbar');
    assert.ok(!g.worldSnapshot().items.some((i) => i.id === 'crowbar'), 'gone from the world for everyone');
    const d = pick(g, 'b', 'diary-2');
    assert.ok(d.ok && d.value.kind === 'read' && d.value.doc === 'diary-2');
    assert.deepEqual(g.worldSnapshot().journal, [{ doc: 'diary-2', by: 'Balqis' }]);
    assert.equal(g.privateState('b')!.inventory.every((s) => s === null), true, 'pages do not take a slot');
  });

  it('five slots: the sixth tool does not fit; dropping frees a slot and leaves it in the world', () => {
    const g = session();
    g.addPlayer('a', 'A');
    for (const id of ['battery-car', 'battery-shop', 'battery-warung', 'battery-school', 'battery-chief']) assert.ok(pick(g, 'a', id).ok, id);
    const full = pick(g, 'a', 'battery-hut');
    assert.ok(!full.ok && /full/.test(full.message ?? ''));
    assert.ok(g.dropItem('a', 2).ok);
    assert.equal(g.privateState('a')!.inventory[2], null);
    assert.ok(g.worldSnapshot().items.some((i) => i.id === 'battery-warung'));
    assert.ok(pick(g, 'a', 'battery-hut').ok);
  });

  it('using a battery recharges your torch (private event)', () => {
    const g = session();
    g.addPlayer('a', 'A');
    pick(g, 'a', 'battery-car');
    g.drain();
    assert.ok(g.useItem('a', 0).ok);
    const { events, privates } = g.drain();
    assert.ok(events.some((e) => e.to === 'a' && e.event.type === 'recharge'));
    assert.equal(privates.find((p) => p.id === 'a')?.state.inventory[0], null);
  });
});

describe('doors, locks and puzzles', () => {
  it('Kelas 3 door: locked without the key, opens with it, blocks movement when closed', () => {
    const g = session();
    g.addPlayer('a', 'A');
    const door = thing(DOOR_KELAS3);
    goTo(g, 'a', door.x, door.y, door.z);
    const locked = g.interact('a', DOOR_KELAS3, act('toggle'));
    assert.ok(!locked.ok && locked.error === 'LOCKED');
    pick(g, 'a', 'key-kelas3');
    goTo(g, 'a', door.x, door.y, door.z);
    assert.ok(g.interact('a', DOOR_KELAS3, act('toggle')).ok);
    assert.ok(g.worldSnapshot().open.includes(DOOR_KELAS3));
    assert.ok(g.interact('a', DOOR_KELAS3, act('toggle')).ok, 'close again');
    assert.ok(!g.worldSnapshot().open.includes(DOOR_KELAS3));
  });

  it('storeroom padlock: wrong code refused, 1308 opens; the hatch needs the crowbar; then the tunnel', () => {
    const g = session();
    g.addPlayer('a', 'A');
    const lock = thing(DOOR_STOR);
    goTo(g, 'a', lock.x, lock.y, lock.z);
    const ui = g.interact('a', DOOR_STOR, act('toggle'));
    assert.ok(ui.ok && ui.value.kind === 'ui' && ui.value.ui === 'padlock');
    assert.ok(!g.interact('a', DOOR_STOR, act('code', { code: '1998' })).ok);
    assert.ok(g.interact('a', DOOR_STOR, act('code', { code: '1308' })).ok);
    assert.ok(g.worldSnapshot().open.includes(DOOR_STOR));
    const hatch = thing(HATCH_STOR);
    goTo(g, 'a', hatch.x, hatch.y, hatch.z);
    assert.ok(!g.interact('a', HATCH_STOR, act('toggle')).ok, 'needs a crowbar');
    pick(g, 'a', 'crowbar');
    goTo(g, 'a', hatch.x, hatch.y, hatch.z);
    assert.ok(g.interact('a', HATCH_STOR, act('toggle')).ok);
    g.teleport('a', hatch.x, hatch.z);
    assert.ok(g.usePortal('a', 'stor-down').ok, 'down the hatch');
  });

  it('the old well can also be pried open', () => {
    const g = session();
    g.addPlayer('a', 'A');
    pick(g, 'a', 'crowbar');
    const w = thing(WELL_PLANKS);
    goTo(g, 'a', w.x, w.y, w.z);
    assert.ok(g.interact('a', WELL_PLANKS, act('toggle')).ok);
    assert.ok(g.usePortal('a', 'well-down').ok);
  });

  it('fuse box: wrong order trips everything; 3-1-4-2 restores power and plays the PA', () => {
    const g = session();
    g.addPlayer('a', 'A');
    const f = thing('fusebox');
    goTo(g, 'a', f.x, f.y, f.z);
    g.interact('a', 'fusebox', act('toggle', { index: 0 }));
    assert.deepEqual(g.worldSnapshot().fuse, [false, false, false, false], 'switch 1 first → trip');
    for (const i of [2, 0, 3, 1]) assert.ok(g.interact('a', 'fusebox', act('toggle', { index: i })).ok);
    const w = g.worldSnapshot();
    assert.equal(w.power, true);
    assert.ok(w.journal.some((j) => j.doc === 'pa-announcement'));
    assert.equal(w.objectives.find((o) => o.id === 'side-power')?.done, true);
  });

  it('radio: only 98.5 brings voices', () => {
    const g = session();
    g.addPlayer('a', 'A');
    const r = thing('radio');
    goTo(g, 'a', r.x, r.y, r.z);
    const s = g.interact('a', 'radio', act('tune', { freq: 101 }));
    assert.ok(s.ok && s.value.kind === 'ok');
    const v = g.interact('a', 'radio', act('tune', { freq: 98.5 }));
    assert.ok(v.ok && v.value.kind === 'read');
    assert.equal(g.worldSnapshot().radioSolved, true);
  });

  it('co-op levers: one person cannot hold both; two people together open the gate', () => {
    const g = session('coop');
    g.addPlayer('a', 'A');
    g.addPlayer('b', 'B');
    const la = thing('lever-a');
    const lb = thing('lever-b');
    goTo(g, 'a', la.x, la.y, la.z);
    g.interact('a', 'lever-a', act('toggle'));
    now += 4000; // the time it takes one person to run to the other lever
    g.tick();
    goTo(g, 'a', lb.x, lb.y, lb.z);
    g.interact('a', 'lever-b', act('toggle'));
    assert.ok(!g.worldSnapshot().open.includes(FORBIDDEN_GATE_ID), 'solo attempt fails');
    goTo(g, 'b', la.x, la.y, la.z);
    now += 500;
    g.interact('b', 'lever-a', act('toggle'));
    assert.ok(g.worldSnapshot().open.includes(FORBIDDEN_GATE_ID), 'together it opens');
  });

  it('solo mode: the levers stay down long enough to run between them', () => {
    const g = session('solo');
    g.addPlayer('a', 'A');
    const la = thing('lever-a');
    const lb = thing('lever-b');
    goTo(g, 'a', la.x, la.y, la.z);
    g.interact('a', 'lever-a', act('toggle'));
    now += 5000;
    goTo(g, 'a', lb.x, lb.y, lb.z);
    g.interact('a', 'lever-b', act('toggle'));
    assert.ok(g.worldSnapshot().open.includes(FORBIDDEN_GATE_ID));
  });
});

describe('health, downed and revive', () => {
  it('at 0 health you go down and cannot move; a teammate holding E for 3 s revives you', () => {
    const g = session();
    const a = g.addPlayer('a', 'A');
    g.addPlayer('b', 'B');
    g.damage('a', 60);
    assert.equal(g.privateState('a')!.health, MAX_HEALTH - 60);
    g.damage('a', 60);
    assert.equal(g.privateState('a')!.downed, true);
    const c = g.applyInput('a', { seq: 1, x: a.x, y: a.y, z: a.z - 1, yaw: 0, pitch: 0, crouch: 0, flashlight: false, sprinting: false });
    assert.ok(c, 'movement refused while down');
    g.teleport('b', a.x + 1, a.z);
    assert.ok(g.interact('b', 'a', act('revive')).ok);
    now += (REVIVE_S - 1) * 1000;
    g.tick();
    assert.equal(g.privateState('a')!.downed, true, 'not yet');
    now += 1100;
    g.tick();
    assert.equal(g.privateState('a')!.downed, false);
    assert.equal(g.privateState('a')!.health, REVIVE_HEALTH);
  });

  it('walking away cancels the revive; bleeding out wakes you at the car', () => {
    const g = session();
    const a = g.addPlayer('a', 'A');
    g.addPlayer('b', 'B');
    g.teleport('a', 0, -86);
    g.damage('a', 200);
    g.teleport('b', 1, -86);
    g.interact('b', 'a', act('revive'));
    now += 1000;
    g.teleport('b', 10, -86);
    g.tick();
    now += 3000;
    g.tick();
    assert.equal(g.privateState('a')!.downed, true, 'revive was cancelled');
    now += BLEEDOUT_S * 1000;
    g.tick();
    const me = g.syncFor('a')!.you;
    assert.equal(me.downed, false);
    assert.ok(Math.abs(me.x - a.x) < 1e-9 && Math.abs(me.z - a.z) < 1e-9, 'back at the spawn');
    assert.equal(g.pendingCorrections.length, 1);
  });
});

describe('a complete run: every objective can be finished', () => {
  it('two players solve everything', () => {
    const g = session('coop');
    g.addPlayer('a', 'Aiman');
    g.addPlayer('b', 'Balqis');
    // tools
    assert.ok(pick(g, 'a', 'key-kelas3').ok);
    assert.ok(pick(g, 'a', 'crowbar').ok);
    // school: power + Kelas 3
    const f = thing('fusebox');
    goTo(g, 'a', f.x, f.y, f.z);
    for (const i of [2, 0, 3, 1]) g.interact('a', 'fusebox', act('toggle', { index: i }));
    const door = thing(DOOR_KELAS3);
    goTo(g, 'a', door.x, door.y, door.z);
    assert.ok(g.interact('a', DOOR_KELAS3, act('toggle')).ok);
    // every journal item
    for (const it of ITEM_SPAWNS.filter((i) => i.doc && i.id !== 'belonging-sofia')) assert.ok(pick(g, 'b', it.id).ok, it.id);
    let obj = g.worldSnapshot().objectives;
    assert.equal(obj.find((o) => o.id === 'find-sofia')?.hidden, false, 'Sofia revealed after the other four');
    // storeroom → tunnel → levers → chamber
    const lock = thing(DOOR_STOR);
    goTo(g, 'a', lock.x, lock.y, lock.z);
    g.interact('a', DOOR_STOR, act('code', { code: '1308' }));
    const hatch = thing(HATCH_STOR);
    goTo(g, 'a', hatch.x, hatch.y, hatch.z);
    g.interact('a', HATCH_STOR, act('toggle'));
    const la = thing('lever-a');
    const lb = thing('lever-b');
    goTo(g, 'a', la.x, la.y, la.z);
    goTo(g, 'b', lb.x, lb.y, lb.z);
    g.interact('a', 'lever-a', act('toggle'));
    g.interact('b', 'lever-b', act('toggle'));
    assert.ok(g.worldSnapshot().open.includes(FORBIDDEN_GATE_ID));
    // walk into the chamber (reported movement)
    const spot = g.syncFor('a')!.you;
    void spot;
    g.teleport('a', CHAMBER_POS.x - 2, CHAMBER_POS.z);
    now += 1000;
    g.applyInput('a', { seq: 99, x: CHAMBER_POS.x - 1, y: 0, z: CHAMBER_POS.z + 1, yaw: 0, pitch: 0, crouch: 0, flashlight: true, sprinting: false });
    assert.ok(pick(g, 'a', 'belonging-sofia').ok);
    obj = g.worldSnapshot().objectives;
    // the final choice and the escape are Phase 7's endgame (story.test.ts)
    for (const o of obj.filter((x) => x.id !== 'decide' && x.id !== 'escape')) assert.equal(o.done, true, `${o.id} ${o.progress ?? ''}`);
    assert.ok(obj.some((o) => o.id === 'decide' && !o.done), 'the final choice is now open');

    // …and on to the end: the confession in the chamber, the stone, the car → THE TRUTH
    if (g.worldSnapshot().items.some((i) => i.id === 'pengakuan')) assert.ok(pick(g, 'a', 'pengakuan').ok, 'read the confession');
    assert.ok(g.worldSnapshot().journal.some((j) => j.doc === 'pengakuan'), 'the confession is in the journal');
    const altar = thing('altar');
    goTo(g, 'a', altar.x, altar.y, altar.z);
    const ask = g.interact('a', 'altar', act('toggle'));
    assert.ok(ask.ok && ask.value.kind === 'choice', 'the stone offers the choice');
    assert.ok(g.interact('a', 'altar', act('choose', { option: 'free' })).ok);
    const car = thing('car');
    goTo(g, 'b', car.x, car.y, car.z);
    assert.ok(g.interact('b', 'car', act('choose', { option: 'leave' })).ok);
    const end = g.ended as { kind: string; ending: string | null } | null;
    assert.equal(end?.kind, 'ending');
    assert.equal(end?.ending, 'truth');
  });

  it('objective maths', () => {
    const none = computeObjectives({ found: new Set(), power: false, secretRoom: false });
    assert.equal(none.filter((o) => o.done).length, 0);
    assert.equal(none.find((o) => o.id === 'find-sofia')?.title, '???');
  });
});
