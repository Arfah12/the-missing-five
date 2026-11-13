import type { Server, Socket } from 'socket.io';
import {
  CONNECT_ERROR_OUTDATED,
  ERROR_MESSAGES,
  NET_TICK_HZ,
  PROTOCOL_VERSION,
  parseAction,
  parsePlayerInput,
  fail,
  ok,
  type Ack,
  type AckResult,
  type ClientToServerEvents,
  type ErrorCode,
  type GameEvent,
  type GameSync,
  type InteractResult,
  type JoinedPayload,
  type ServerToClientEvents,
  type SocketData,
} from '@tmf/shared';
import type { Joined, Result, Room, RoomManager } from '../rooms/RoomManager';
import type { Logger } from '../util/logger';
import { TokenBucket } from '../util/rateLimiter';

type InterServerEvents = Record<string, never>;
export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export interface HandlerOptions {
  log: Logger;
  sweepIntervalMs?: number;
  /** Position snapshots per second (0 disables the timer, for tests). */
  tickHz?: number;
}

export const roomChannel = (code: string) => `room:${code}`;

const isFn = (v: unknown): v is (...args: never[]) => void => typeof v === 'function';
const field = (payload: unknown, key: string): unknown =>
  payload && typeof payload === 'object' ? (payload as Record<string, unknown>)[key] : undefined;

/**
 * Wires Socket.IO events to the RoomManager. Every request is validated,
 * rate-limited and answered through an acknowledgement; shared state is
 * broadcast to the room afterwards.
 */
export function registerSocketHandlers(io: GameServer, rooms: RoomManager, opts: HandlerOptions) {
  const { log } = opts;

  const broadcast = (code: string) => {
    const room = rooms.getRoom(code);
    if (room) io.to(roomChannel(code)).emit('room:state', rooms.snapshot(room));
  };

  const gameEvent = (code: string, e: GameEvent) => io.to(roomChannel(code)).emit('game:event', e);

  /** Sends everything a game changed: world, private states, events, respawns. */
  const flush = (room: Room) => {
    const game = room.game;
    if (!game) return;
    const socketOf = (playerId: string) => room.players.get(playerId)?.socketId ?? null;
    const { world, privates, events } = game.drain();
    if (world) io.to(roomChannel(room.code)).emit('game:world', world);
    for (const { id, state } of privates) {
      const sid = socketOf(id);
      if (sid) io.to(sid).emit('game:me', state);
    }
    for (const { to, event } of events) {
      if (to === null) io.to(roomChannel(room.code)).emit('game:event', event);
      else {
        const sid = socketOf(to);
        if (sid) io.to(sid).emit('game:event', event);
      }
    }
    for (const { id, c } of game.pendingCorrections.splice(0)) {
      const sid = socketOf(id);
      if (sid) io.to(sid).emit('player:correct', c);
    }
  };

  const joinedPayload = (j: Joined): JoinedPayload => ({
    room: rooms.snapshot(j.room),
    playerId: j.player.id,
    sessionToken: j.player.sessionToken,
  });

  // Reject clients built for a different protocol (e.g. stale cached build).
  io.use((socket, next) => {
    const auth = socket.handshake.auth as Record<string, unknown> | undefined;
    if (auth?.protocol !== PROTOCOL_VERSION) {
      log.warn('rejected outdated client', { protocol: auth?.protocol });
      next(new Error(CONNECT_ERROR_OUTDATED));
      return;
    }
    next();
  });

  io.on('connection', (socket: GameSocket) => {
    log.debug('socket connected', { id: socket.id });
    const limiter = new TokenBucket(8, 4);
    // movement updates arrive ~15×/s; allow bursts after a lag spike
    const moveLimiter = new TokenBucket(45, 32);

    const currentRoom = (): Room | undefined => {
      const m = rooms.membership(socket.id);
      return m ? rooms.getRoom(m.code) : undefined;
    };

    const enterRoom = async (result: Result<Joined>, ack: Ack<JoinedPayload>, action: string) => {
      if (!result.ok) {
        ack(fail(result.error));
        return;
      }
      const { room, player, displacedSocketId } = result.value;
      if (displacedSocketId) {
        io.to(displacedSocketId).emit('room:closed', 'SESSION_TAKEN');
        io.in(displacedSocketId).socketsLeave(roomChannel(room.code));
      }
      socket.data.roomCode = room.code;
      socket.data.playerId = player.id;
      await socket.join(roomChannel(room.code));
      ack(ok(joinedPayload(result.value)));
      broadcast(room.code);
      if (action === 'resumed' && room.phase === 'playing') gameEvent(room.code, { type: 'reconnected', name: player.name });
      log.info(`${action} ${room.code}`, { player: player.name, players: room.players.size });
    };

    /** Drops malformed requests (no ack) and rate-limits the rest. */
    const guard = (ack: unknown): boolean => {
      if (!isFn(ack)) return false;
      if (!limiter.take()) {
        (ack as (r: AckResult<never>) => void)(fail('RATE_LIMITED'));
        return false;
      }
      return true;
    };

    const safe = (label: string, fn: () => Promise<void> | void, ack?: (code: ErrorCode) => void) => {
      Promise.resolve()
        .then(fn)
        .catch((e: unknown) => {
          log.error(`handler ${label} failed`, { error: e instanceof Error ? e.message : String(e) });
          ack?.('SERVER_ERROR');
        });
    };

    socket.on('room:create', (payload, ack) => {
      if (!guard(ack)) return;
      safe(
        'room:create',
        () => enterRoom(rooms.create(socket.id, field(payload, 'name'), field(payload, 'solo') === true), ack, 'created'),
        (c) => ack(fail(c)),
      );
    });

    socket.on('room:join', (payload, ack) => {
      if (!guard(ack)) return;
      safe(
        'room:join',
        () => enterRoom(rooms.join(socket.id, field(payload, 'code'), field(payload, 'name')), ack, 'joined'),
        (c) => ack(fail(c)),
      );
    });

    socket.on('room:resume', (payload, ack) => {
      if (!guard(ack)) return;
      safe(
        'room:resume',
        () => enterRoom(rooms.resume(socket.id, field(payload, 'code'), field(payload, 'sessionToken')), ack, 'resumed'),
        (c) => ack(fail(c)),
      );
    });

    socket.on('room:leave', (ack) => {
      if (!guard(ack)) return;
      safe('room:leave', async () => {
        const before = currentRoom();
        const m = rooms.membership(socket.id);
        const name = m ? before?.players.get(m.playerId)?.name : undefined;
        const wasPlaying = before?.phase === 'playing';
        const result = rooms.leave(socket.id);
        if (!result.ok) {
          ack(fail(result.error));
          return;
        }
        const { code, closed } = result.value;
        await socket.leave(roomChannel(code));
        socket.data.roomCode = undefined;
        socket.data.playerId = undefined;
        ack(ok(null));
        if (!closed) broadcast(code);
        if (!closed && wasPlaying && name) gameEvent(code, { type: 'left', name });
        log.info(`left ${code}`, { closed });
      }, (c) => ack(fail(c)));
    });

    socket.on('room:ready', (ready, ack) => {
      if (!guard(ack)) return;
      safe('room:ready', () => {
        const r = rooms.setReady(socket.id, ready);
        if (!r.ok) return ack(fail(r.error));
        ack(ok(null));
        broadcast(r.value.code);
      }, (c) => ack(fail(c)));
    });

    socket.on('room:start', (ack) => {
      if (!guard(ack)) return;
      safe('room:start', () => {
        const r = rooms.start(socket.id);
        if (!r.ok) return ack(fail(r.error));
        ack(ok(null));
        broadcast(r.value.code);
        log.info(`game started ${r.value.code}`, { players: r.value.players.size, solo: r.value.solo });
      }, (c) => ack(fail(c)));
    });

    socket.on('game:sync', (ack) => {
      if (!guard(ack)) return;
      safe('game:sync', () => {
        const m = rooms.membership(socket.id);
        const room = currentRoom();
        const sync: GameSync | null | undefined = m && room?.game?.syncFor(m.playerId);
        if (!sync) return ack(fail('NOT_PLAYING'));
        ack(ok(sync));
      }, (c) => ack(fail(c)));
    });

    socket.on('player:state', (raw) => {
      if (!moveLimiter.take()) return;
      const input = parsePlayerInput(raw);
      const m = rooms.membership(socket.id);
      const game = currentRoom()?.game;
      if (!input || !m || !game) return;
      const correction = game.applyInput(m.playerId, input);
      if (correction) socket.emit('player:correct', correction);
    });

    socket.on('game:portal', (portalId, ack) => {
      if (!guard(ack)) return;
      safe('game:portal', () => {
        const m = rooms.membership(socket.id);
        const game = currentRoom()?.game;
        if (!m || !game) return ack(fail('NOT_PLAYING'));
        const r = game.usePortal(m.playerId, portalId);
        if (!r.ok) return ack(fail(r.error));
        socket.emit('player:correct', r.correction);
        ack(ok(null));
      }, (c) => ack(fail(c)));
    });

    socket.on('game:interact', (payload, ack) => {
      if (!guard(ack)) return;
      safe('game:interact', () => {
        const m = rooms.membership(socket.id);
        const room = currentRoom();
        const game = room?.game;
        if (!m || !room || !game) return ack(fail('NOT_PLAYING'));
        const action = parseAction(field(payload, 'action'));
        if (!action) return ack(fail('SERVER_ERROR'));
        const r = game.interact(m.playerId, field(payload, 'target'), action);
        ack(r.ok ? ok(r.value) : { ok: false, error: r.error, message: r.message ?? ERROR_MESSAGES[r.error] });
        flush(room);
      }, (c) => ack(fail(c)));
    });

    const inventoryHandler = (ev: 'inv:use' | 'inv:drop') => (slot: unknown, ack: Ack<InteractResult>) => {
      if (!guard(ack)) return;
      safe(ev, () => {
        const m = rooms.membership(socket.id);
        const room = currentRoom();
        const game = room?.game;
        if (!m || !room || !game) return ack(fail('NOT_PLAYING'));
        const r = ev === 'inv:use' ? game.useItem(m.playerId, slot) : game.dropItem(m.playerId, slot);
        ack(r.ok ? ok(r.value) : { ok: false, error: r.error, message: r.message ?? ERROR_MESSAGES[r.error] });
        flush(room);
      }, (c) => ack(fail(c)));
    };
    socket.on('inv:use', inventoryHandler('inv:use'));
    socket.on('inv:drop', inventoryHandler('inv:drop'));

    socket.on('net:ping', (clientTime, ack) => {
      if (!isFn(ack)) return;
      void clientTime;
      ack(Date.now());
    });

    socket.on('disconnect', (reason) => {
      const m = rooms.membership(socket.id);
      const name = m ? rooms.getRoom(m.code)?.players.get(m.playerId)?.name : undefined;
      const result = rooms.disconnect(socket.id);
      if (result) {
        broadcast(result.code);
        if (name && rooms.getRoom(result.code)?.phase === 'playing') gameEvent(result.code, { type: 'disconnected', name });
        log.info(`disconnected from ${result.code}`, { reason });
      }
    });
  });

  // Drop players whose reconnect window ran out.
  const timer = setInterval(() => {
    const { changed, closed } = rooms.sweep();
    for (const code of changed) broadcast(code);
    if (changed.length || closed.length) log.info('sweep', { changed, closed });
  }, opts.sweepIntervalMs ?? 2_000);
  timer.unref?.();

  // Position snapshots for every running game.
  const hz = opts.tickHz ?? NET_TICK_HZ;
  const tick = hz > 0 ? setInterval(() => broadcastFrames(), 1000 / hz) : null;
  tick?.unref?.();
  function broadcastFrames() {
    for (const room of [...rooms.playing()]) {
      const game = room.game!;
      game.tick();
      flush(room);
      io.to(roomChannel(room.code)).emit('game:players', game.frame());
      if (game.ended) {
        io.to(roomChannel(room.code)).emit('game:end', game.ended);
        log.info(`game over in ${room.code}`, { kind: game.ended.kind, ending: game.ended.ending });
        rooms.endGame(room.code);
        broadcast(room.code);
      }
    }
  }

  return {
    stop: () => {
      clearInterval(timer);
      if (tick) clearInterval(tick);
    },
    /** Exposed for tests. */
    broadcastFrames,
    flush,
  };
}
