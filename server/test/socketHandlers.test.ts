import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { PROTOCOL_VERSION, type AckResult, type JoinedPayload, type RoomSnapshot } from '@tmf/shared';
import { registerSocketHandlers, roomChannel, type GameServer } from '../src/net/registerSocketHandlers';
import { RoomManager } from '../src/rooms/RoomManager';
import { silentLogger } from '../src/util/logger';
import { FakeIo } from './fakeIo';

function setup() {
  const io = new FakeIo();
  const rooms = new RoomManager({ graceMs: 50 });
  const handlers = registerSocketHandlers(io as unknown as GameServer, rooms, { log: silentLogger, sweepIntervalMs: 20 });
  return { io, rooms, handlers };
}

const stops: (() => void)[] = [];
after(() => stops.forEach((s) => s()));

describe('socket handlers', () => {
  it('rejects clients with the wrong protocol version', async () => {
    const { io, handlers } = setup();
    stops.push(handlers.stop);
    await assert.rejects(io.connect({ protocol: PROTOCOL_VERSION + 1 }), /OUTDATED_CLIENT/);
    await assert.rejects(io.connect({}), /OUTDATED_CLIENT/);
    assert.ok(await io.connect({ protocol: PROTOCOL_VERSION }));
  });

  it('create → join → everyone receives the authoritative room state', async () => {
    const { io, handlers } = setup();
    stops.push(handlers.stop);
    const a = await io.connect();
    const b = await io.connect();

    const created = await a.request<AckResult<JoinedPayload>>('room:create', { name: 'Aiman' });
    assert.ok(created.ok);
    const code = created.data.room.code;
    assert.match(code, /^HJ-\d{4}$/);
    assert.ok(a.rooms.has(roomChannel(code)));
    assert.equal(a.data.playerId, created.data.playerId);

    const joined = await b.request<AckResult<JoinedPayload>>('room:join', { code: code.slice(3), name: 'Balqis' });
    assert.ok(joined.ok, 'joining with digits only works');
    const stateA = a.last('room:state')?.[0] as RoomSnapshot;
    const stateB = b.last('room:state')?.[0] as RoomSnapshot;
    assert.deepEqual(stateA, stateB);
    assert.deepEqual(stateA.players.map((p) => p.name), ['Aiman', 'Balqis']);
    assert.equal(stateA.players.find((p) => p.isHost)?.name, 'Aiman');
  });

  it('returns readable errors and ignores malformed payloads', async () => {
    const { io, handlers } = setup();
    stops.push(handlers.stop);
    const a = await io.connect();
    const bad = await a.request<AckResult<JoinedPayload>>('room:join', { code: 'HJ-0000', name: 'Ali' });
    assert.deepEqual(bad.ok ? null : bad.error, 'ROOM_NOT_FOUND');
    if (!bad.ok) assert.ok(bad.message.length > 5);
    const junk = await a.request<AckResult<JoinedPayload>>('room:create', 'not-an-object');
    assert.equal(junk.ok ? null : junk.error, 'INVALID_NAME');
    // no ack function → silently ignored, must not throw
    a.send('room:create', { name: 'Ali' });
    a.send('room:create', { name: 'Ali' }, 'not-a-function');
  });

  it('rate-limits request floods', async () => {
    const { io, handlers } = setup();
    stops.push(handlers.stop);
    const a = await io.connect();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => a.request<AckResult<JoinedPayload>>('room:join', { code: 'HJ-0000', name: 'Ali' })),
    );
    assert.ok(results.some((r) => !r.ok && r.error === 'RATE_LIMITED'));
  });

  it('disconnect → others see "reconnecting" → resume restores the player', async () => {
    const { io, handlers } = setup();
    stops.push(handlers.stop);
    const a = await io.connect();
    const b = await io.connect();
    const created = await a.request<AckResult<JoinedPayload>>('room:create', { name: 'Aiman' });
    assert.ok(created.ok);
    const { code } = created.data.room;
    await b.request('room:join', { code, name: 'Balqis' });

    a.disconnect();
    let state = b.last('room:state')?.[0] as RoomSnapshot;
    assert.equal(state.players.find((p) => p.name === 'Aiman')?.connected, false);
    assert.equal(state.players.find((p) => p.isHost)?.name, 'Balqis');

    const a2 = await io.connect();
    const resumed = await a2.request<AckResult<JoinedPayload>>('room:resume', { code, sessionToken: created.data.sessionToken });
    assert.ok(resumed.ok);
    state = b.last('room:state')?.[0] as RoomSnapshot;
    assert.equal(state.players.find((p) => p.name === 'Aiman')?.connected, true);
  });

  it('expired players are swept and the remaining players are told', async () => {
    const { io, handlers } = setup();
    stops.push(handlers.stop);
    const a = await io.connect();
    const b = await io.connect();
    const created = await a.request<AckResult<JoinedPayload>>('room:create', { name: 'Aiman' });
    assert.ok(created.ok);
    await b.request('room:join', { code: created.data.room.code, name: 'Balqis' });
    b.disconnect();
    await new Promise((r) => setTimeout(r, 120));
    const state = a.last('room:state')?.[0] as RoomSnapshot;
    assert.deepEqual(state.players.map((p) => p.name), ['Aiman']);
  });

  it('leave updates the room and frees the socket for a new room', async () => {
    const { io, handlers } = setup();
    stops.push(handlers.stop);
    const a = await io.connect();
    const b = await io.connect();
    const created = await a.request<AckResult<JoinedPayload>>('room:create', { name: 'Aiman' });
    assert.ok(created.ok);
    const { code } = created.data.room;
    await b.request('room:join', { code, name: 'Balqis' });
    const left = await b.request<AckResult<null>>('room:leave');
    assert.ok(left.ok);
    assert.equal(b.rooms.has(roomChannel(code)), false);
    const state = a.last('room:state')?.[0] as RoomSnapshot;
    assert.equal(state.players.length, 1);
    const again = await b.request<AckResult<JoinedPayload>>('room:create', { name: 'Balqis' });
    assert.ok(again.ok);
  });

  it('answers latency pings with the server time', async () => {
    const { io, handlers } = setup();
    stops.push(handlers.stop);
    const a = await io.connect();
    const t = await a.request<number>('net:ping', Date.now());
    assert.ok(Math.abs(t - Date.now()) < 1000);
  });
});
