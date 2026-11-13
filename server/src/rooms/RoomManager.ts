import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  RECONNECT_GRACE_MS,
  ROOM_CODE_DIGITS,
  ROOM_CODE_PREFIX,
  nameKey,
  normalizeRoomCode,
  sanitizeName,
  type ErrorCode,
  type RoomPhase,
  type RoomSnapshot,
} from '@tmf/shared';
import type { GameSession } from '../game/GameSession';

export interface Player {
  id: string;
  name: string;
  socketId: string | null;
  sessionToken: string;
  connected: boolean;
  ready: boolean;
  joinedAt: number;
  disconnectedAt: number | null;
}

export interface Room {
  code: string;
  hostId: string;
  phase: RoomPhase;
  players: Map<string, Player>;
  createdAt: number;
  solo: boolean;
  game: GameSession | null;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: ErrorCode };

export interface Joined {
  room: Room;
  player: Player;
  /** Socket that previously owned this player slot (session taken over). */
  displacedSocketId?: string;
}

export interface Departure {
  code: string;
  /** True when the room no longer exists. */
  closed: boolean;
}

export interface RoomManagerOptions {
  now?: () => number;
  graceMs?: number;
  maxRooms?: number;
  codeGen?: () => string;
  idGen?: () => string;
  tokenGen?: () => string;
  /** Creates the game when the host presses Start. */
  gameFactory?: (mode: 'solo' | 'coop') => GameSession;
}

const okr = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: ErrorCode): Result<T> => ({ ok: false, error });

function defaultCode(): string {
  const max = 10 ** ROOM_CODE_DIGITS;
  return `${ROOM_CODE_PREFIX}-${randomInt(0, max).toString().padStart(ROOM_CODE_DIGITS, '0')}`;
}

/**
 * Authoritative, transport-independent room state. Socket.IO handlers call
 * into this class; it never trusts input and is fully unit-testable.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly bySocket = new Map<string, { code: string; playerId: string }>();
  private readonly now: () => number;
  private readonly graceMs: number;
  private readonly maxRooms: number;
  private readonly codeGen: () => string;
  private readonly idGen: () => string;
  private readonly tokenGen: () => string;
  private readonly gameFactory: ((mode: 'solo' | 'coop') => GameSession) | null;

  constructor(opts: RoomManagerOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.graceMs = opts.graceMs ?? RECONNECT_GRACE_MS;
    this.maxRooms = opts.maxRooms ?? 500;
    this.codeGen = opts.codeGen ?? defaultCode;
    this.idGen = opts.idGen ?? (() => randomUUID());
    this.tokenGen = opts.tokenGen ?? (() => randomBytes(24).toString('base64url'));
    this.gameFactory = opts.gameFactory ?? null;
  }

  /** Rooms with a running game (for the network tick). */
  *playing(): IterableIterator<Room> {
    for (const room of this.rooms.values()) if (room.phase === 'playing' && room.game) yield room;
  }

  /* ───────────── queries ───────────── */

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  membership(socketId: string): { code: string; playerId: string } | undefined {
    return this.bySocket.get(socketId);
  }

  stats(): { rooms: number; players: number; connected: number } {
    let players = 0;
    let connected = 0;
    for (const room of this.rooms.values()) {
      for (const p of room.players.values()) {
        players += 1;
        if (p.connected) connected += 1;
      }
    }
    return { rooms: this.rooms.size, players, connected };
  }

  snapshot(room: Room): RoomSnapshot {
    const players = [...room.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.id === room.hostId,
        connected: p.connected,
        ready: p.ready,
        joinedAt: p.joinedAt,
      }));
    return {
      code: room.code,
      hostId: room.hostId,
      phase: room.phase,
      players,
      maxPlayers: MAX_PLAYERS,
      minPlayers: room.solo ? 1 : MIN_PLAYERS,
      createdAt: room.createdAt,
      solo: room.solo,
    };
  }

  /* ───────────── commands ───────────── */

  create(socketId: string, rawName: unknown, solo = false): Result<Joined> {
    if (this.bySocket.has(socketId)) return err('ALREADY_IN_ROOM');
    const name = sanitizeName(rawName);
    if (!name) return err('INVALID_NAME');
    if (this.rooms.size >= this.maxRooms) return err('SERVER_BUSY');

    let code: string | null = null;
    for (let i = 0; i < 64; i++) {
      const candidate = this.codeGen();
      if (!this.rooms.has(candidate)) {
        code = candidate;
        break;
      }
    }
    if (!code) return err('SERVER_BUSY');

    const player = this.newPlayer(socketId, name);
    const room: Room = {
      code,
      hostId: player.id,
      phase: 'lobby',
      players: new Map([[player.id, player]]),
      createdAt: this.now(),
      solo,
      game: null,
    };
    this.rooms.set(code, room);
    this.bySocket.set(socketId, { code, playerId: player.id });
    return okr({ room, player });
  }

  join(socketId: string, rawCode: unknown, rawName: unknown): Result<Joined> {
    if (this.bySocket.has(socketId)) return err('ALREADY_IN_ROOM');
    const code = normalizeRoomCode(rawCode);
    if (!code) return err('INVALID_CODE');
    const room = this.rooms.get(code);
    if (!room) return err('ROOM_NOT_FOUND');
    if (room.phase !== 'lobby' || room.solo) return err('GAME_IN_PROGRESS');
    const name = sanitizeName(rawName);
    if (!name) return err('INVALID_NAME');
    const key = nameKey(name);
    for (const p of room.players.values()) {
      if (nameKey(p.name) === key) return err('NAME_TAKEN');
    }
    if (room.players.size >= MAX_PLAYERS) return err('ROOM_FULL');

    const player = this.newPlayer(socketId, name);
    room.players.set(player.id, player);
    this.bySocket.set(socketId, { code, playerId: player.id });
    return okr({ room, player });
  }

  /** Reclaims a player slot after a disconnect / page refresh. */
  resume(socketId: string, rawCode: unknown, token: unknown): Result<Joined> {
    if (this.bySocket.has(socketId)) return err('ALREADY_IN_ROOM');
    const code = normalizeRoomCode(rawCode);
    if (!code || typeof token !== 'string' || token.length < 16) return err('SESSION_EXPIRED');
    const room = this.rooms.get(code);
    if (!room) return err('SESSION_EXPIRED');
    const player = [...room.players.values()].find((p) => p.sessionToken === token);
    if (!player) return err('SESSION_EXPIRED');

    let displacedSocketId: string | undefined;
    if (player.socketId && player.socketId !== socketId) {
      // Same player opened the game again (new tab / reconnect before the old
      // socket timed out): the newest connection wins.
      displacedSocketId = player.socketId;
      this.bySocket.delete(player.socketId);
    }
    player.socketId = socketId;
    player.connected = true;
    player.disconnectedAt = null;
    this.bySocket.set(socketId, { code, playerId: player.id });
    if (!this.isConnected(room, room.hostId)) room.hostId = player.id;
    room.game?.setConnected(player.id, true);
    return okr({ room, player, displacedSocketId });
  }

  leave(socketId: string): Result<Departure> {
    const m = this.bySocket.get(socketId);
    if (!m) return err('NOT_IN_ROOM');
    this.bySocket.delete(socketId);
    return okr(this.removePlayer(m.code, m.playerId));
  }

  /** Marks the player as disconnected; the slot is kept for the grace period. */
  disconnect(socketId: string): { code: string } | null {
    const m = this.bySocket.get(socketId);
    if (!m) return null;
    this.bySocket.delete(socketId);
    const room = this.rooms.get(m.code);
    const player = room?.players.get(m.playerId);
    if (!room || !player) return null;
    player.connected = false;
    player.socketId = null;
    player.disconnectedAt = this.now();
    player.ready = false;
    room.game?.setConnected(player.id, false);
    if (room.hostId === player.id) this.migrateHost(room);
    return { code: room.code };
  }

  setReady(socketId: string, ready: unknown): Result<Room> {
    const m = this.bySocket.get(socketId);
    const room = m && this.rooms.get(m.code);
    const player = m && room?.players.get(m.playerId);
    if (!m || !room || !player) return err('NOT_IN_ROOM');
    if (room.phase !== 'lobby') return err('GAME_IN_PROGRESS');
    player.ready = ready === true;
    return okr(room);
  }

  /** Host starts the game. Everyone else who is connected must be ready. */
  start(socketId: string): Result<Room> {
    const m = this.bySocket.get(socketId);
    const room = m && this.rooms.get(m.code);
    if (!m || !room) return err('NOT_IN_ROOM');
    if (room.hostId !== m.playerId) return err('NOT_HOST');
    if (room.phase !== 'lobby') return err('GAME_IN_PROGRESS');
    if (!this.gameFactory) return err('SERVER_ERROR');
    const connected = [...room.players.values()].filter((p) => p.connected);
    if (!room.solo) {
      if (connected.length < MIN_PLAYERS) return err('NOT_ENOUGH_PLAYERS');
      if (connected.some((p) => p.id !== room.hostId && !p.ready)) return err('PLAYERS_NOT_READY');
    }
    const game = this.gameFactory(room.solo ? 'solo' : 'coop');
    for (const p of [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt)) {
      game.addPlayer(p.id, p.name);
      if (!p.connected) game.setConnected(p.id, false);
    }
    room.game = game;
    room.phase = 'playing';
    return okr(room);
  }

  /** The game finished (Game Over / ending): back to the lobby, everyone un-ready. */
  endGame(code: string): Room | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    room.game = null;
    room.phase = 'lobby';
    for (const p of room.players.values()) p.ready = false;
    return room;
  }

  /**
   * Removes players whose grace period ran out and deletes empty rooms.
   * Returns the codes of rooms that changed (still existing) and closed.
   */
  sweep(): { changed: string[]; closed: string[] } {
    const t = this.now();
    const changed: string[] = [];
    const closed: string[] = [];
    for (const room of [...this.rooms.values()]) {
      const expired = [...room.players.values()].filter(
        (p) => !p.connected && p.disconnectedAt !== null && t - p.disconnectedAt >= this.graceMs,
      );
      if (!expired.length) continue;
      let gone = false;
      for (const p of expired) gone = this.removePlayer(room.code, p.id).closed;
      (gone ? closed : changed).push(room.code);
    }
    return { changed, closed };
  }

  /* ───────────── internals ───────────── */

  private newPlayer(socketId: string, name: string): Player {
    return {
      id: this.idGen(),
      name,
      socketId,
      sessionToken: this.tokenGen(),
      connected: true,
      ready: false,
      joinedAt: this.now(),
      disconnectedAt: null,
    };
  }

  private isConnected(room: Room, playerId: string): boolean {
    return room.players.get(playerId)?.connected === true;
  }

  private removePlayer(code: string, playerId: string): Departure {
    const room = this.rooms.get(code);
    if (!room) return { code, closed: true };
    const player = room.players.get(playerId);
    if (player?.socketId) this.bySocket.delete(player.socketId);
    room.players.delete(playerId);
    room.game?.removePlayer(playerId);
    if (room.players.size === 0) {
      room.game = null;
      this.rooms.delete(code);
      return { code, closed: true };
    }
    if (room.hostId === playerId) this.migrateHost(room);
    return { code, closed: false };
  }

  /** Earliest-joined connected player becomes host (or earliest at all). */
  private migrateHost(room: Room): void {
    const players = [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    const next = players.find((p) => p.connected) ?? players[0];
    if (next) room.hostId = next.id;
  }
}
