/** In-game network messages (Phase 3+). */
import type { PrivateState, WorldSnapshot } from '../game/gameplay';
import type { HorrorKind, NetWatcher } from '../game/watcher';

/** What a client reports about its own player. */
export interface PlayerNetInput {
  /** Increasing counter, lets the server ignore out-of-order packets. */
  seq: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** 0 = standing … 1 = crouched. */
  crouch: number;
  flashlight: boolean;
  sprinting: boolean;
}

/** What everyone sees about a player. */
export interface NetPlayer {
  id: string;
  name: string;
  /** 0–4: picks the jacket colour. */
  slot: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  crouch: number;
  flashlight: boolean;
  sprinting: boolean;
  connected: boolean;
  health: number;
  downed: boolean;
}

export interface PlayersFrame {
  /** Server time (ms). */
  t: number;
  players: NetPlayer[];
  /** The Watcher, or null while it is gone. */
  watcher: NetWatcher | null;
}

export interface Correction {
  x: number;
  y: number;
  z: number;
  /** Teleports (portals, spawn) also set the view direction. */
  yaw?: number;
  teleport: boolean;
}

export interface GameSync {
  you: NetPlayer;
  players: NetPlayer[];
  mode: 'solo' | 'coop';
  startedAt: number;
  serverTime: number;
  world: WorldSnapshot;
  me: PrivateState;
}

export type Sfx =
  | 'pickup'
  | 'unlock'
  | 'locked'
  | 'trip'
  | 'switch'
  | 'power'
  | 'gate'
  | 'lever'
  | 'radio'
  | 'revived'
  | 'downed'
  | 'wrong'
  | 'vanish'
  | 'watcherHit'
  | 'doorSlam';

export type GameEvent =
  | { type: 'joined'; name: string }
  | { type: 'left'; name: string }
  | { type: 'disconnected'; name: string }
  | { type: 'reconnected'; name: string }
  /** Short toast for everyone (or one player). */
  | { type: 'message'; text: string }
  | { type: 'sfx'; sound: Sfx; x?: number; y?: number; z?: number }
  /** Someone found a journal entry. */
  | { type: 'found'; doc: string; by: string }
  /** Show a document to everyone (PA announcement, radio). */
  | { type: 'broadcast'; doc: string }
  /** Private: your torch got a new battery. */
  | { type: 'recharge'; amount: number }
  /** A scripted scare (sound / vision) at a place, usually just for one player. */
  | { type: 'horror'; kind: HorrorKind; x: number; y: number; z: number; line?: string }
  /** Private: The Watcher hit you. */
  | { type: 'hit'; damage: number }
  /** The Watcher started chasing someone (everyone hears the scream). */
  | { type: 'chase'; target: string; x: number; y: number; z: number };

const num = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null;

/** Validates the shape of an untrusted PlayerNetInput. */
export function parsePlayerInput(raw: unknown): PlayerNetInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const seq = num(r.seq, 0, Number.MAX_SAFE_INTEGER);
  const x = num(r.x, -1e4, 1e4);
  const y = num(r.y, -1e3, 1e3);
  const z = num(r.z, -1e4, 1e4);
  const yaw = num(r.yaw, -1e6, 1e6);
  const pitch = num(r.pitch, -2, 2);
  const crouch = num(r.crouch, 0, 1);
  if (seq === null || x === null || y === null || z === null || yaw === null || pitch === null || crouch === null) return null;
  return { seq, x, y, z, yaw, pitch, crouch, flashlight: r.flashlight === true, sprinting: r.sprinting === true };
}
