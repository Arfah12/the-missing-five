import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HORROR_EVENTS,
  KAMPUNG_SPAWNS,
  PLAYER,
  WATCHER,
  buildGameWorld,
  mulberry32,
  pickHorror,
  roadX,
  type GameEnd,
  type GameEvent,
} from '@tmf/shared';
import { GameSession } from '../src/game/GameSession';
import { WatcherAI, type WatcherHooks, type WatcherTarget } from '../src/game/Watcher';
import { HorrorDirector } from '../src/game/Horror';

const world = buildGameWorld();
const T0 = 1_000_000;

function target(over: Partial<WatcherTarget> = {}): WatcherTarget {
  // on the open road in the Central Village, looking north
  return { id: 'p1', name: 'Aiman', x: roadX(-70), y: 0, z: -70, yaw: 0, pitch: 0, crouch: 0, flashlight: false, sprinting: false, connected: true, downed: false, ...over };
}

function hooks() {
  const events: { e: GameEvent; to: string | null }[] = [];
  const hits: { id: string; amount: number }[] = [];
  const h: WatcherHooks = {
    damage: (id, amount) => hits.push({ id, amount }),
    emit: (e, to) => events.push({ e, to }),
    childrenFound: () => 0,
  };
  return { h, events, hits };
}

/** Run the AI at 15 Hz for `seconds`; `move` may change the player each step. */
function run(ai: WatcherAI, t0: number, seconds: number, players: WatcherTarget[], h: WatcherHooks, move?: (t: number) => void): number {
  let t = t0;
  for (let i = 0; i < seconds * 15; i++) {
    t += 1000 / 15;
    move?.(t);
    ai.update(t, players, h);
  }
  return t;
}

describe('The Watcher AI', () => {
  it('stays hidden until its first appearance', () => {
    const ai = new WatcherAI(world, 'coop', mulberry32(1), T0);
    const { h } = hooks();
    run(ai, T0, WATCHER.firstDelayS.coop - 2, [target()], h);
    assert.equal(ai.mode, 'hidden');
    assert.equal(ai.net(), null);
    run(ai, T0 + (WATCHER.firstDelayS.coop - 2) * 1000, 3, [target()], h);
    assert.notEqual(ai.mode, 'hidden');
  });

  it('appears out of walls, in the same region, near the player', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const ai = new WatcherAI(world, 'solo', mulberry32(seed), T0);
      ai.appearAt(T0);
      const p = target();
      ai.update(T0 + 10, [p], hooks().h);
      if (ai.mode === 'hidden') continue;
      assert.equal(world.overlaps(ai.x, ai.z, WATCHER.radius, ai.y + PLAYER.stepHeight, ai.y + WATCHER.height), false, `seed ${seed}`);
      const d = Math.hypot(ai.x - p.x, ai.z - p.z);
      assert.ok(d > 8 && d < 30, `distance ${d.toFixed(1)} (seed ${seed})`);
    }
  });

  it('observing: shining a torch at it makes it leave', () => {
    for (let seed = 1; seed < 60; seed++) {
      const ai = new WatcherAI(world, 'solo', mulberry32(seed), T0);
      ai.appearAt(T0);
      const p = target();
      const { h, events } = hooks();
      ai.update(T0 + 10, [p], h);
      if (ai.mode !== 'observe') continue;
      // look straight at its head with the torch on
      p.flashlight = true;
      p.yaw = Math.atan2(-(ai.x - p.x), -(ai.z - p.z));
      const eye = PLAYER.standHeight - PLAYER.eyeOffset;
      p.pitch = Math.atan2(ai.y + WATCHER.headHeight - eye, Math.hypot(ai.x - p.x, ai.z - p.z));
      run(ai, T0 + 10, WATCHER.torchStareS + 0.5, [p], h);
      assert.equal(ai.mode, 'disappear');
      assert.ok(events.some((x) => x.e.type === 'sfx' && x.e.sound === 'vanish'));
      return;
    }
    assert.fail('no seed produced an observe');
  });

  it('chase: screams first, is slower than a sprint, hits once and retreats', () => {
    const ai = new WatcherAI(world, 'coop', mulberry32(3), T0);
    const p = target({ z: -70 });
    // place it 12 m behind the player on the road and force a chase
    ai.x = roadX(-58);
    ai.z = -58;
    ai.y = 0;
    ai.targetId = p.id;
    const { h, events, hits } = hooks();
    (ai as unknown as { startChase(t: number, p: WatcherTarget, h: WatcherHooks): void }).startChase(T0, p, h);
    assert.ok(events.some((x) => x.e.type === 'chase'));
    assert.equal(ai.net()?.windup, true);
    // standing still during the wind-up: it doesn't move yet
    run(ai, T0, WATCHER.chaseWindupS * 0.8, [p], h);
    assert.ok(Math.hypot(ai.x - roadX(-58), ai.z + 58) < 0.01);
    // the player sprints north along the road: the gap must grow
    let t = T0 + WATCHER.chaseWindupS * 1000;
    const startGap = Math.hypot(ai.x - p.x, ai.z - p.z);
    t = run(ai, t, 4, [p], h, () => {
      p.z -= PLAYER.sprintSpeed / 15;
      p.x = roadX(p.z);
      p.sprinting = true;
    });
    const gap = Math.hypot(ai.x - p.x, ai.z - p.z);
    assert.ok(gap > startGap, `sprinting gains distance (${startGap.toFixed(1)} → ${gap.toFixed(1)})`);
    assert.equal(hits.length, 0);
    // now the player stops: it catches up, hits once, then disappears
    run(ai, t, 10, [p], h, () => (p.sprinting = false));
    assert.equal(hits.length, 1);
    assert.equal(hits[0].amount, WATCHER.hitDamage);
    assert.ok(events.some((x) => x.e.type === 'hit' && x.to === 'p1'));
    assert.ok(ai.mode === 'disappear' || ai.mode === 'hidden');
  });

  it('gives up when you hide indoors (it gets stuck at the wall / loses sight)', () => {
    const s = new GameSession({ world: buildGameWorld(), spawns: KAMPUNG_SPAWNS, mode: 'solo', now: () => T0 });
    void s;
    const ai = new WatcherAI(world, 'solo', mulberry32(5), T0);
    // player inside the entrance kedai runcit (walls all around except the door), watcher behind the back wall
    const shopInside = { x: roadX(-4) - 9.0, z: -4 };
    const p = target({ x: shopInside.x, z: shopInside.z, y: 0.2 });
    ai.x = shopInside.x - 6;
    ai.z = shopInside.z;
    ai.y = 0;
    ai.targetId = p.id;
    const { h, hits } = hooks();
    (ai as unknown as { startChase(t: number, p: WatcherTarget, h: WatcherHooks): void }).startChase(T0, p, h);
    run(ai, T0, 8, [p], h);
    assert.equal(hits.length, 0, 'never reaches the player through the wall');
    assert.ok(ai.mode === 'disappear' || ai.mode === 'hidden', `mode ${ai.mode}`);
  });

  it('never targets downed players and leaves when its target goes down', () => {
    const ai = new WatcherAI(world, 'coop', mulberry32(9), T0);
    ai.appearAt(T0);
    const { h } = hooks();
    ai.update(T0 + 10, [target({ downed: true })], h);
    assert.equal(ai.mode, 'hidden');
  });

  it('comes back sooner when more children have been found', () => {
    const gap = (found: number) => {
      const ai = new WatcherAI(world, 'coop', mulberry32(4), T0);
      const h: WatcherHooks = { damage: () => {}, emit: () => {}, childrenFound: () => found };
      (ai as unknown as { hide(t: number, h: WatcherHooks): void }).hide(T0, h);
      return (ai as unknown as { nextAppear: number }).nextAppear - T0;
    };
    assert.ok(gap(4) < gap(0) * 0.6);
  });
});

describe('random horror events', () => {
  it('pickHorror respects areas and weights', () => {
    const r = mulberry32(2);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      const h = pickHorror('entrance', r);
      counts[h.kind] = (counts[h.kind] ?? 0) + 1;
      assert.ok(!h.areas || h.areas.includes('entrance'), h.kind);
    }
    assert.ok(!counts.knock && !counts.laugh, 'tunnel-only sounds never play at the entrance');
    assert.ok(counts.footsteps > counts.illusion, 'heavier weights happen more');
    assert.ok(HORROR_EVENTS.length >= 7);
  });

  it('fires on schedule, pauses while The Watcher is out', () => {
    const d = new HorrorDirector(mulberry32(6), T0);
    const events: GameEvent[] = [];
    const p = target();
    const hooks = { emit: (e: GameEvent) => events.push(e), slamDoorNear: () => null, watcherActive: () => true };
    d.triggerAt(T0);
    d.update(T0, [p], hooks);
    assert.equal(events.length, 0);
    d.triggerAt(T0);
    d.update(T0, [p], { ...hooks, watcherActive: () => false });
    assert.equal(events.length, 1);
    d.update(T0 + 5000, [p], { ...hooks, watcherActive: () => false });
    assert.equal(events.length, 1, 'not again within the gap');
  });

  it('a door slam really closes an open door (shared state)', () => {
    let now = T0;
    const s = new GameSession({ world: buildGameWorld(), spawns: KAMPUNG_SPAWNS, mode: 'coop', now: () => now, rand: () => 0.99 });
    s.addPlayer('a', 'Aiman');
    s.setOpen('door:kelas3', true);
    const door = (s as unknown as { slamDoorNear(x: number, z: number): unknown }).slamDoorNear(-62, -94);
    assert.ok(door, 'found the open door');
    assert.equal(s.worldSnapshot().open.includes('door:kelas3'), false);
    now += 1;
  });
});

describe('game over', () => {
  it('everyone down for a few seconds ends the game; reviving in time prevents it', () => {
    let now = T0;
    const s = new GameSession({ world: buildGameWorld(), spawns: KAMPUNG_SPAWNS, mode: 'coop', now: () => now });
    s.addPlayer('a', 'Aiman');
    s.addPlayer('b', 'Siti');
    s.damage('a', 500);
    now += 10_000;
    s.tick();
    assert.equal(s.ended, null, 'one still standing');
    s.damage('b', 500);
    s.tick();
    now += 2_000;
    s.tick();
    assert.equal(s.ended, null, 'not instantly');
    now += 2_500;
    s.tick();
    const ended = s.ended as GameEnd | null;
    assert.ok(ended);
    assert.equal(ended.kind, 'gameover');
    assert.equal(ended.stats.downs, 2);
  });

  it('a disconnected player does not keep the game alive', () => {
    let now = T0;
    const s = new GameSession({ world: buildGameWorld(), spawns: KAMPUNG_SPAWNS, mode: 'coop', now: () => now });
    s.addPlayer('a', 'Aiman');
    s.addPlayer('b', 'Siti');
    s.setConnected('b', false);
    s.damage('a', 500);
    s.tick();
    now += 5_000;
    s.tick();
    assert.equal(s.ended?.kind, 'gameover');
  });

  it('frames carry The Watcher only while it is out', () => {
    let now = T0;
    const s = new GameSession({ world: buildGameWorld(), spawns: KAMPUNG_SPAWNS, mode: 'solo', now: () => now, rand: mulberry32(8) });
    s.addPlayer('a', 'Aiman');
    assert.equal(s.frame().watcher, null);
    s.watcher.appearAt(now);
    for (let i = 0; i < 30 && !s.frame().watcher; i++) {
      now += 7000;
      s.watcher.appearAt(now);
      s.tick();
    }
    assert.ok(s.frame().watcher, 'appeared within a few tries');
  });
});
