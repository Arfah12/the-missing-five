import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import {
  ENTRANCE_SPAWNS,
  PLAYER,
  buildEntranceWorld,
  roadX,
  type AckResult,
  type Correction,
  type GameSync,
  type JoinedPayload,
  type PlayerNetInput,
  type PlayersFrame,
  type RoomSnapshot,
} from '@tmf/shared';
import { GameSession } from '../src/game/GameSession';
import { createGame } from '../src/game/createGame';
import { registerSocketHandlers, type GameServer } from '../src/net/registerSocketHandlers';
import { RoomManager } from '../src/rooms/RoomManager';
import { silentLogger } from '../src/util/logger';
import { FakeIo, type FakeSocket } from './fakeIo';

const stops: (() => void)[] = [];
after(() => stops.forEach((s) => s()));

function setup() {
  const io = new FakeIo();
  const rooms = new RoomManager({ graceMs: 200, gameFactory: createGame });
  const handlers = registerSocketHandlers(io as unknown as GameServer, rooms, { log: silentLogger, sweepIntervalMs: 20, tickHz: 0 });
  stops.push(handlers.stop);
  return { io, rooms, handlers };
}

async function lobbyOf(io: FakeIo, names: string[]) {
  const sockets: FakeSocket[] = [];
  let code = '';
  for (const [i, name] of names.entries()) {
    const s = await io.connect();
    const res =
      i === 0
        ? await s.request<AckResult<JoinedPayload>>('room:create', { name })
        : await s.request<AckResult<JoinedPayload>>('room:join', { code, name });
    assert.ok(res.ok, `${name} entered`);
    if (i === 0 && res.ok) code = res.data.room.code;
    sockets.push(s);
  }
  return { sockets, code };
}

const input = (over: Partial<PlayerNetInput>): PlayerNetInput => ({
  seq: 1,
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  pitch: 0,
  crouch: 0,
  flashlight: false,
  sprinting: false,
  ...over,
});

describe('lobby → game start', () => {
  it('host cannot start alone, and not before everyone is ready', async () => {
    const { io } = setup();
    const { sockets } = await lobbyOf(io, ['Aiman']);
    const solo = await sockets[0].request<AckResult<null>>('room:start');
    assert.equal(solo.ok ? null : solo.error, 'NOT_ENOUGH_PLAYERS');

    const b = await io.connect();
    const code = (sockets[0].last('room:state')?.[0] as RoomSnapshot).code;
    await b.request('room:join', { code, name: 'Balqis' });
    const notReady = await sockets[0].request<AckResult<null>>('room:start');
    assert.equal(notReady.ok ? null : notReady.error, 'PLAYERS_NOT_READY');

    const notHost = await b.request<AckResult<null>>('room:start');
    assert.equal(notHost.ok ? null : notHost.error, 'NOT_HOST');

    assert.ok((await b.request<AckResult<null>>('room:ready', true)).ok);
    const state = sockets[0].last('room:state')?.[0] as RoomSnapshot;
    assert.equal(state.players.find((p) => p.name === 'Balqis')?.ready, true);

    const started = await sockets[0].request<AckResult<null>>('room:start');
    assert.ok(started.ok);
    const playing = b.last('room:state')?.[0] as RoomSnapshot;
    assert.equal(playing.phase, 'playing');
  });

  it('nobody can join a game that already started', async () => {
    const { io } = setup();
    const { sockets, code } = await lobbyOf(io, ['Aiman', 'Balqis']);
    await sockets[1].request('room:ready', true);
    await sockets[0].request('room:start');
    const late = await io.connect();
    const res = await late.request<AckResult<JoinedPayload>>('room:join', { code, name: 'Chong' });
    assert.equal(res.ok ? null : res.error, 'GAME_IN_PROGRESS');
  });

  it('"Explore Alone" creates a private solo room that starts with one player', async () => {
    const { io } = setup();
    const a = await io.connect();
    const res = await a.request<AckResult<JoinedPayload>>('room:create', { name: 'Aiman', solo: true });
    assert.ok(res.ok && res.data.room.solo);
    if (!res.ok) return;
    const other = await io.connect();
    const join = await other.request<AckResult<JoinedPayload>>('room:join', { code: res.data.room.code, name: 'Balqis' });
    assert.equal(join.ok ? null : join.error, 'GAME_IN_PROGRESS');
    assert.ok((await a.request<AckResult<null>>('room:start')).ok);
    const sync = await a.request<AckResult<GameSync>>('game:sync');
    assert.ok(sync.ok && sync.data.mode === 'solo' && sync.data.players.length === 1);
  });
});

describe('in-game networking', () => {
  async function running(names: string[]) {
    const env = setup();
    const { sockets, code } = await lobbyOf(env.io, names);
    for (const s of sockets.slice(1)) await s.request('room:ready', true);
    assert.ok((await sockets[0].request<AckResult<null>>('room:start')).ok);
    return { ...env, sockets, code };
  }

  it('every player gets a distinct spawn and sees everyone', async () => {
    const { sockets } = await running(['A1', 'B2', 'C3', 'D4', 'E5']);
    const syncs = await Promise.all(sockets.map((s) => s.request<AckResult<GameSync>>('game:sync')));
    const yous = syncs.map((r) => (r.ok ? r.data.you : null));
    assert.ok(yous.every(Boolean));
    const spots = new Set(yous.map((y) => `${y!.x.toFixed(2)},${y!.z.toFixed(2)}`));
    assert.equal(spots.size, 5, 'five different spawn points');
    assert.ok(syncs.every((r) => r.ok && r.data.players.length === 5));
  });

  it('valid movement is accepted and broadcast to the others', async () => {
    const { sockets, handlers } = await running(['Aiman', 'Balqis']);
    const sync = await sockets[0].request<AckResult<GameSync>>('game:sync');
    assert.ok(sync.ok);
    if (!sync.ok) return;
    const me = sync.data.you;
    await new Promise((r) => setTimeout(r, 200));
    sockets[0].send('player:state', input({ seq: 1, x: me.x, y: me.y, z: me.z - 0.5, yaw: 1, flashlight: true }));
    assert.equal(sockets[0].last('player:correct'), undefined, 'no correction');
    handlers.broadcastFrames();
    const frame = sockets[1].last('game:players')?.[0] as PlayersFrame;
    const seen = frame.players.find((p) => p.id === me.id)!;
    assert.ok(Math.abs(seen.z - (me.z - 0.5)) < 1e-9 && seen.yaw === 1 && seen.flashlight === true);
  });

  it('teleport-hacks, wall clipping and flying are rejected with a correction', async () => {
    const { sockets } = await running(['Aiman', 'Balqis']);
    const sync = await sockets[0].request<AckResult<GameSync>>('game:sync');
    if (!sync.ok) return assert.fail();
    const me = sync.data.you;
    // 30 m in an instant
    sockets[0].send('player:state', input({ seq: 2, x: me.x, y: me.y, z: me.z - 30 }));
    let c = sockets[0].last('player:correct')?.[0] as Correction;
    assert.ok(c && Math.abs(c.z - me.z) < 1e-9, 'speed hack corrected');
    // inside the car (right next to spawn)
    sockets[0].received.length = 0;
    const car = { x: roadX(36) + 2.75, z: 36 };
    await new Promise((r) => setTimeout(r, 1200));
    sockets[0].send('player:state', input({ seq: 3, x: car.x, y: 0, z: car.z }));
    c = sockets[0].last('player:correct')?.[0] as Correction;
    assert.ok(c, 'standing inside the car corrected');
    // flying
    sockets[0].received.length = 0;
    sockets[0].send('player:state', input({ seq: 4, x: me.x, y: me.y + 6, z: me.z }));
    assert.ok(sockets[0].last('player:correct'), 'flying corrected');
    // garbage and stale packets are ignored silently
    sockets[0].received.length = 0;
    sockets[0].send('player:state', { seq: 5, x: 'nope' });
    sockets[0].send('player:state', input({ seq: 1, x: me.x, y: me.y, z: me.z - 30 }));
    assert.equal(sockets[0].last('player:correct'), undefined);
  });

  it('a dropped player stays in the game, shown as disconnected', async () => {
    const { sockets, handlers } = await running(['Aiman', 'Balqis']);
    sockets[1].disconnect();
    handlers.broadcastFrames();
    const frame = sockets[0].last('game:players')?.[0] as PlayersFrame;
    assert.equal(frame.players.find((p) => p.name === 'Balqis')?.connected, false);
    const evt = sockets[0].received.filter((r) => r.event === 'game:event').map((r) => r.args[0]);
    assert.ok(evt.some((e) => JSON.stringify(e) === JSON.stringify({ type: 'disconnected', name: 'Balqis' })), JSON.stringify(evt));
  });

  it('resume with the session token puts you back where you were', async () => {
    const { io } = setup();
    const a = await io.connect();
    const b = await io.connect();
    const ra = await a.request<AckResult<JoinedPayload>>('room:create', { name: 'Aiman' });
    if (!ra.ok) return assert.fail();
    const rb = await b.request<AckResult<JoinedPayload>>('room:join', { code: ra.data.room.code, name: 'Balqis' });
    if (!rb.ok) return assert.fail();
    await b.request('room:ready', true);
    await a.request('room:start');
    const sync = await b.request<AckResult<GameSync>>('game:sync');
    if (!sync.ok) return assert.fail();
    await new Promise((r) => setTimeout(r, 300));
    const moved = { x: sync.data.you.x, y: sync.data.you.y, z: sync.data.you.z - 1 };
    b.send('player:state', input({ seq: 1, ...moved }));
    b.disconnect();
    const b2 = await io.connect();
    const resumed = await b2.request<AckResult<JoinedPayload>>('room:resume', { code: ra.data.room.code, sessionToken: rb.data.sessionToken });
    assert.ok(resumed.ok && resumed.data.room.phase === 'playing');
    const again = await b2.request<AckResult<GameSync>>('game:sync');
    assert.ok(again.ok && Math.abs(again.data.you.z - moved.z) < 1e-9, 'same position after resume');
    assert.equal(again.ok && again.data.you.connected, true);
    // after a reconnect a far-but-legit report isn't rejected by the speed check
    b2.send('player:state', input({ seq: 1, x: moved.x, y: moved.y, z: moved.z - 0.3 }));
    assert.equal(b2.last('player:correct'), undefined);
  });

  it('leaving mid-game removes you for everyone; last one out closes the room', async () => {
    const { sockets, rooms, code, handlers } = await running(['Aiman', 'Balqis']);
    assert.ok((await sockets[1].request<AckResult<null>>('room:leave')).ok);
    handlers.broadcastFrames();
    const frame = sockets[0].last('game:players')?.[0] as PlayersFrame;
    assert.deepEqual(frame.players.map((p) => p.name), ['Aiman']);
    const evt = sockets[0].received.filter((r) => r.event === 'game:event').map((r) => r.args[0]);
    assert.ok(evt.some((e) => JSON.stringify(e) === JSON.stringify({ type: 'left', name: 'Balqis' })), JSON.stringify(evt));
    await sockets[0].request('room:leave');
    assert.equal(rooms.getRoom(code), undefined);
  });
});

describe('GameSession movement validation (unit)', () => {
  const world = buildEntranceWorld();
  let now = 0;
  const game = () => {
    now = 1000;
    return new GameSession({ world, spawns: ENTRANCE_SPAWNS, mode: 'coop', now: () => now });
  };

  it('accepts a full sprint, rejects anything faster', () => {
    const g = game();
    const p = g.addPlayer('p', 'P');
    now += 1000; // one second later
    assert.equal(g.applyInput('p', input({ seq: 1, x: p.x, y: p.y, z: p.z - PLAYER.sprintSpeed })), null);
    now += 100;
    assert.ok(g.applyInput('p', input({ seq: 2, x: p.x, y: p.y, z: p.z - PLAYER.sprintSpeed - 3 })));
  });

  it('teleport moves the player and resets the speed check', () => {
    const g = game();
    g.addPlayer('p', 'P');
    const c = g.teleport('p', roadX(0), 0, 1.2)!;
    assert.equal(c.teleport, true);
    assert.equal(g.applyInput('p', input({ seq: 1, x: roadX(0), y: c.y, z: 0.2 })), null);
  });
});
