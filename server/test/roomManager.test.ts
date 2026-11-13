import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_PLAYERS, normalizeRoomCode, sanitizeName } from '@tmf/shared';
import { RoomManager } from '../src/rooms/RoomManager';

function setup(graceMs = 30_000) {
  let t = 1_000;
  let n = 0;
  const codes = ['HJ-1111', 'HJ-1111', 'HJ-2222', 'HJ-3333', 'HJ-4444'];
  const rm = new RoomManager({
    now: () => t,
    graceMs,
    codeGen: () => codes.shift() ?? `HJ-${String(9000 + n++)}`,
    idGen: () => `p${++n}`,
    tokenGen: () => `token-${n}-abcdefghijklmnop`,
  });
  return { rm, advance: (ms: number) => (t += ms) };
}

describe('validation', () => {
  it('sanitizes names', () => {
    assert.equal(sanitizeName('  Aisyah   Binti  '), 'Aisyah Binti');
    assert.equal(sanitizeName('a'), null);
    assert.equal(sanitizeName('x'.repeat(17)), null);
    assert.equal(sanitizeName('<script>'), null);
    assert.equal(sanitizeName(42), null);
    assert.equal(sanitizeName('Ali_99'), 'Ali_99');
  });

  it('normalizes room codes', () => {
    assert.equal(normalizeRoomCode('hj-8291'), 'HJ-8291');
    assert.equal(normalizeRoomCode('8291'), 'HJ-8291');
    assert.equal(normalizeRoomCode(' HJ 0042 '), 'HJ-0042');
    assert.equal(normalizeRoomCode('HJ-82'), null);
    assert.equal(normalizeRoomCode('AB-1234'), null);
    assert.equal(normalizeRoomCode(null), null);
  });
});

describe('RoomManager', () => {
  it('creates a room with a unique code and the creator as host', () => {
    const { rm } = setup();
    const a = rm.create('sA', 'Aiman');
    const b = rm.create('sB', 'Balqis');
    assert.ok(a.ok && b.ok);
    assert.equal(a.value.room.code, 'HJ-1111');
    assert.equal(b.value.room.code, 'HJ-2222', 'skips the colliding code');
    const snap = rm.snapshot(a.value.room);
    assert.equal(snap.hostId, a.value.player.id);
    assert.equal(snap.players[0].isHost, true);
    assert.equal('sessionToken' in snap.players[0], false, 'snapshots never leak tokens');
  });

  it('validates joins: code, name, duplicates, capacity', () => {
    const { rm } = setup();
    const host = rm.create('s0', 'Host');
    assert.ok(host.ok);
    const code = host.value.room.code;
    assert.deepEqual(rm.join('x1', 'nope', 'Ali'), { ok: false, error: 'INVALID_CODE' });
    assert.deepEqual(rm.join('x1', 'HJ-9999', 'Ali'), { ok: false, error: 'ROOM_NOT_FOUND' });
    assert.deepEqual(rm.join('x1', code, '!!'), { ok: false, error: 'INVALID_NAME' });
    assert.deepEqual(rm.join('x1', code.toLowerCase(), 'host'), { ok: false, error: 'NAME_TAKEN' });
    for (let i = 1; i < MAX_PLAYERS; i++) assert.ok(rm.join(`s${i}`, code, `Player${i}`).ok);
    assert.deepEqual(rm.join('s9', code, 'Extra'), { ok: false, error: 'ROOM_FULL' });
    assert.deepEqual(rm.join('s1', code, 'Again'), { ok: false, error: 'ALREADY_IN_ROOM' });
    assert.equal(rm.snapshot(rm.getRoom(code)!).players.length, MAX_PLAYERS);
  });

  it('migrates host on leave and deletes empty rooms', () => {
    const { rm } = setup();
    const h = rm.create('sA', 'Aiman');
    assert.ok(h.ok);
    const code = h.value.room.code;
    const b = rm.join('sB', code, 'Balqis');
    assert.ok(b.ok);
    assert.deepEqual(rm.leave('sA'), { ok: true, value: { code, closed: false } });
    assert.equal(rm.getRoom(code)!.hostId, b.value.player.id);
    assert.deepEqual(rm.leave('sB'), { ok: true, value: { code, closed: true } });
    assert.equal(rm.getRoom(code), undefined);
    assert.deepEqual(rm.leave('sB'), { ok: false, error: 'NOT_IN_ROOM' });
  });

  it('keeps a disconnected player for the grace period and lets them resume', () => {
    const { rm, advance } = setup(30_000);
    const h = rm.create('sA', 'Aiman');
    assert.ok(h.ok);
    const code = h.value.room.code;
    const b = rm.join('sB', code, 'Balqis');
    assert.ok(b.ok);

    rm.disconnect('sA');
    const room = rm.getRoom(code)!;
    assert.equal(room.players.get(h.value.player.id)!.connected, false);
    assert.equal(room.hostId, b.value.player.id, 'host moves to a connected player');
    assert.deepEqual(rm.join('sC', code, 'aiman'), { ok: false, error: 'NAME_TAKEN' }, 'slot is reserved');

    advance(10_000);
    assert.deepEqual(rm.sweep(), { changed: [], closed: [] });
    const resumed = rm.resume('sA2', code, h.value.player.sessionToken);
    assert.ok(resumed.ok);
    assert.equal(resumed.value.player.connected, true);
    assert.deepEqual(rm.resume('sX', code, 'wrong-token-1234567890'), { ok: false, error: 'SESSION_EXPIRED' });
  });

  it('removes players after the grace period and closes abandoned rooms', () => {
    const { rm, advance } = setup(30_000);
    const h = rm.create('sA', 'Aiman');
    assert.ok(h.ok);
    const code = h.value.room.code;
    assert.ok(rm.join('sB', code, 'Balqis').ok);
    rm.disconnect('sB');
    advance(30_000);
    assert.deepEqual(rm.sweep(), { changed: [code], closed: [] });
    assert.equal(rm.getRoom(code)!.players.size, 1);
    rm.disconnect('sA');
    advance(30_000);
    assert.deepEqual(rm.sweep(), { changed: [], closed: [code] });
    assert.equal(rm.stats().rooms, 0);
    assert.deepEqual(rm.resume('sA3', code, h.value.player.sessionToken), { ok: false, error: 'SESSION_EXPIRED' });
  });

  it('a newer connection takes over a session that is still connected', () => {
    const { rm } = setup();
    const h = rm.create('tab1', 'Aiman');
    assert.ok(h.ok);
    const r = rm.resume('tab2', h.value.room.code, h.value.player.sessionToken);
    assert.ok(r.ok);
    assert.equal(r.value.displacedSocketId, 'tab1');
    assert.equal(rm.membership('tab1'), undefined);
    assert.equal(rm.membership('tab2')?.playerId, h.value.player.id);
  });
});
