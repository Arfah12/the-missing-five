import type { InteractResult, PrivateState, WorldSnapshot } from './game/gameplay';
import type { GameEnd } from './game/endings';
import type { Correction, GameEvent, GameSync, PlayerNetInput, PlayersFrame } from './net/game';

/**
 * Socket.IO protocol. The server is authoritative: clients only send
 * *requests*; the server validates them, changes the shared state and
 * broadcasts the result to everyone in the room.
 */

export type ErrorCode =
  | 'INVALID_NAME'
  | 'NAME_TAKEN'
  | 'INVALID_CODE'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ALREADY_IN_ROOM'
  | 'NOT_IN_ROOM'
  | 'GAME_IN_PROGRESS'
  | 'SESSION_EXPIRED'
  | 'NOT_HOST'
  | 'NOT_ENOUGH_PLAYERS'
  | 'PLAYERS_NOT_READY'
  | 'NOT_PLAYING'
  | 'TOO_FAR'
  | 'LOCKED'
  | 'RATE_LIMITED'
  | 'SERVER_BUSY'
  | 'NOT_CONNECTED'
  | 'TIMEOUT'
  | 'SERVER_ERROR';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_NAME: 'Names need 2–16 letters, numbers, spaces, "-" or "_".',
  NAME_TAKEN: 'Someone in that room already uses this name.',
  INVALID_CODE: 'Room codes look like HJ-8291.',
  ROOM_NOT_FOUND: 'No room with that code. Check the code with your host.',
  ROOM_FULL: 'That room already has five players.',
  ALREADY_IN_ROOM: 'You are already in a room. Leave it first.',
  NOT_IN_ROOM: 'You are not in a room.',
  GAME_IN_PROGRESS: 'That game has already started.',
  SESSION_EXPIRED: 'Your previous session has expired.',
  NOT_HOST: 'Only the host can do that.',
  NOT_ENOUGH_PLAYERS: 'You need at least two connected players.',
  PLAYERS_NOT_READY: 'Everyone has to be ready first.',
  NOT_PLAYING: 'The game is not running.',
  TOO_FAR: 'You are too far away.',
  LOCKED: 'It is locked.',
  RATE_LIMITED: 'Too many requests. Wait a moment.',
  SERVER_BUSY: 'The server is busy. Try again shortly.',
  NOT_CONNECTED: 'Not connected to the game server.',
  TIMEOUT: 'The server did not answer in time.',
  SERVER_ERROR: 'Something went wrong on the server.',
};

/** Reason codes sent with `connect_error` / `room:closed`. */
export const CONNECT_ERROR_OUTDATED = 'OUTDATED_CLIENT';

export type RoomPhase = 'lobby' | 'loading' | 'playing' | 'ended';

export interface PlayerSummary {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  joinedAt: number;
}

export interface RoomSnapshot {
  code: string;
  hostId: string;
  phase: RoomPhase;
  players: PlayerSummary[];
  maxPlayers: number;
  minPlayers: number;
  createdAt: number;
  /** Solo practice room ("Explore Alone"): one player, cannot be joined. */
  solo: boolean;
}

export interface JoinedPayload {
  room: RoomSnapshot;
  playerId: string;
  /** Secret used to reclaim this player slot after a disconnect. */
  sessionToken: string;
}

export type AckResult<T> = { ok: true; data: T } | { ok: false; error: ErrorCode; message: string };

export type Ack<T> = (result: AckResult<T>) => void;

export interface ClientToServerEvents {
  'room:create': (payload: { name: string; solo?: boolean }, ack: Ack<JoinedPayload>) => void;
  'room:join': (payload: { code: string; name: string }, ack: Ack<JoinedPayload>) => void;
  'room:resume': (payload: { code: string; sessionToken: string }, ack: Ack<JoinedPayload>) => void;
  'room:leave': (ack: Ack<null>) => void;
  'room:ready': (ready: boolean, ack: Ack<null>) => void;
  /** Host only. Starts the game for everyone in the room. */
  'room:start': (ack: Ack<null>) => void;
  /** Full game state for this player (on start and after reconnecting). */
  'game:sync': (ack: Ack<GameSync>) => void;
  /** Local player's movement, ~15×/s. No ack: the server corrects if needed. */
  'player:state': (state: PlayerNetInput) => void;
  /** Walked into a hatch / ladder / well: ask the server to move us through. */
  'game:portal': (portalId: string, ack: Ack<null>) => void;
  /** E on something: an item, door, puzzle, or a downed teammate. */
  'game:interact': (payload: { target: string; action: unknown }, ack: Ack<InteractResult>) => void;
  'inv:use': (slot: number, ack: Ack<InteractResult>) => void;
  'inv:drop': (slot: number, ack: Ack<InteractResult>) => void;
  'net:ping': (clientTime: number, ack: (serverTime: number) => void) => void;
}

export type RoomClosedReason = 'SESSION_TAKEN' | 'REMOVED' | 'SERVER_SHUTDOWN';

export interface ServerToClientEvents {
  'room:state': (room: RoomSnapshot) => void;
  'room:closed': (reason: RoomClosedReason) => void;
  /** Everyone's positions, ~15×/s while playing. */
  'game:players': (frame: PlayersFrame) => void;
  /** The server moved you (rejected movement or teleport). */
  'player:correct': (c: Correction) => void;
  /** Something happened that players should hear about. */
  'game:event': (e: GameEvent) => void;
  /** Shared world state (items, doors, puzzles, journal, objectives). */
  'game:world': (w: WorldSnapshot) => void;
  /** Your own inventory and health. */
  'game:me': (me: PrivateState) => void;
  /** The game is over (Game Over or an ending). The room goes back to the lobby. */
  'game:end': (end: GameEnd) => void;
}

/** Data the server attaches to each socket. */
export interface SocketData {
  roomCode?: string;
  playerId?: string;
}

/** Sent by the client in the Socket.IO handshake (`auth`). */
export interface HandshakeAuth {
  protocol: number;
}

export function ok<T>(data: T): AckResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(error: ErrorCode): AckResult<T> {
  return { ok: false, error, message: ERROR_MESSAGES[error] };
}
