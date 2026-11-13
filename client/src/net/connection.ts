import { io, type Socket } from 'socket.io-client';
import {
  CONNECT_ERROR_OUTDATED,
  ERROR_MESSAGES,
  PROTOCOL_VERSION,
  REQUEST_TIMEOUT_MS,
  type AckResult,
  type ClientToServerEvents,
  type Correction,
  type ErrorCode,
  type GameEvent,
  type GameSync,
  type InteractAction,
  type InteractResult,
  type PrivateState,
  type WorldSnapshot,
  DOCS,
  type JoinedPayload,
  type PlayerNetInput,
  type PlayersFrame,
  type RoomClosedReason,
  type RoomSnapshot,
  type ServerToClientEvents,
} from '@tmf/shared';
import type { GameEnd } from '@tmf/shared';
import { createStore, safeStorage } from '../lib/store';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ConnectionStatus = 'connecting' | 'online' | 'offline' | 'outdated';

export interface ConnectionState {
  status: ConnectionStatus;
  latencyMs: number | null;
  serverUrl: string;
}

export interface SessionState {
  room: RoomSnapshot | null;
  playerId: string | null;
  /** Set while we try to reclaim a slot after a reconnect / page refresh. */
  resuming: boolean;
}

export interface Notice {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

/** Empty = same origin (dev proxy, or the server also serves the client). */
export const SERVER_URL = (import.meta.env.VITE_SERVER_URL ?? '').trim().replace(/\/$/, '');

export const connectionStore = createStore<ConnectionState>({
  status: 'connecting',
  latencyMs: null,
  serverUrl: SERVER_URL || 'same origin',
});

export const sessionStore = createStore<SessionState>({ room: null, playerId: null, resuming: false });

export const noticeStore = createStore<{ notice: Notice | null }>({ notice: null });

/** Shared game world (items, doors, puzzles, journal, objectives). */
export const worldStore = createStore<{ world: WorldSnapshot | null }>({ world: null });
/** This player's inventory and health. */
export const meStore = createStore<{ me: PrivateState | null }>({ me: null });
/** A document pushed to everyone (school PA, radio voices). */
export const broadcastStore = createStore<{ doc: string | null; key: number }>({ doc: null, key: 0 });
/** Set when a game ends (Game Over / ending); the end screen shows until dismissed. */
export const endStore = createStore<{ end: GameEnd | null }>({ end: null });

let noticeSeq = 0;
export function notify(text: string, tone: Notice['tone'] = 'info'): void {
  noticeStore.set({ notice: { id: ++noticeSeq, text, tone } });
}

/* ───────────── session persistence (survives a page refresh) ───────────── */

const SESSION_KEY = 'tmf:session';

interface SavedSession {
  code: string;
  sessionToken: string;
}

function saveSession(s: SavedSession | null): void {
  if (s) safeStorage.set(SESSION_KEY, JSON.stringify(s), 'session');
  else safeStorage.remove(SESSION_KEY, 'session');
}

function loadSession(): SavedSession | null {
  const raw = safeStorage.get(SESSION_KEY, 'session');
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SavedSession>;
    return typeof v.code === 'string' && typeof v.sessionToken === 'string' ? (v as SavedSession) : null;
  } catch {
    return null;
  }
}

/* ───────────── socket lifecycle ───────────── */

let socket: ClientSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;

export function getSocket(): ClientSocket {
  if (!socket) throw new Error('initConnection() has not been called');
  return socket;
}

export function initConnection(): ClientSocket {
  if (socket) return socket;
  const s: ClientSocket = io(SERVER_URL || undefined, {
    auth: { protocol: PROTOCOL_VERSION },
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 5_000,
    timeout: 8_000,
  });
  socket = s;

  s.on('connect', () => {
    connectionStore.patch({ status: 'online' });
    void measureLatency();
    void tryResume();
  });

  s.on('disconnect', (reason) => {
    connectionStore.patch({ status: reason === 'io client disconnect' ? 'offline' : 'connecting', latencyMs: null });
  });

  s.on('connect_error', (err) => {
    if (err.message === CONNECT_ERROR_OUTDATED) {
      connectionStore.patch({ status: 'outdated', latencyMs: null });
      s.disconnect(); // retrying will never work – the page must be refreshed
      return;
    }
    connectionStore.patch({ status: 'offline', latencyMs: null });
  });

  s.on('room:state', (room) => {
    const session = sessionStore.get();
    if (!session.room || session.room.code === room.code) sessionStore.patch({ room });
  });

  s.on('game:players', (frame) => frameListeners.forEach((fn) => fn(frame)));
  s.on('player:correct', (c) => correctionListeners.forEach((fn) => fn(c)));
  s.on('game:event', (e) => handleEvent(e));
  s.on('game:world', (w) => worldStore.set({ world: w }));
  s.on('game:me', (me) => meStore.set({ me }));
  s.on('game:end', (end) => endStore.set({ end }));

  s.on('room:closed', (reason: RoomClosedReason) => {
    clearLocalSession();
    notify(
      reason === 'SESSION_TAKEN' ? 'You joined this room from another tab, so this one was disconnected.' : 'You were removed from the room.',
      'error',
    );
  });

  pingTimer = setInterval(() => void measureLatency(), 5_000);
  return s;
}

export function disposeConnection(): void {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}

async function measureLatency(): Promise<void> {
  const s = socket;
  if (!s?.connected) return;
  const sent = performance.now();
  s.timeout(4_000).emit('net:ping', Date.now(), (err: Error | null) => {
    if (err) return;
    connectionStore.patch({ latencyMs: Math.round(performance.now() - sent) });
  });
}

/* ───────────── requests ───────────── */

export type RequestResult<T> = AckResult<T>;

function failure<T>(error: ErrorCode): RequestResult<T> {
  return { ok: false, error, message: ERROR_MESSAGES[error] };
}

type AckCallback<T> = (err: Error | null, res: RequestResult<T>) => void;

/**
 * Sends a request through `fire` and waits for the server's acknowledgement.
 * Resolves with a TIMEOUT / NOT_CONNECTED failure instead of throwing.
 */
function request<T>(fire: (s: ClientSocket, cb: AckCallback<T>) => void): Promise<RequestResult<T>> {
  const s = socket;
  if (!s?.connected) return Promise.resolve(failure<T>('NOT_CONNECTED'));
  return new Promise((resolve) => {
    fire(s, (err, res) => resolve(err ? failure<T>('TIMEOUT') : res));
  });
}

function applyJoined(data: JoinedPayload): void {
  sessionStore.set({ room: data.room, playerId: data.playerId, resuming: false });
  saveSession({ code: data.room.code, sessionToken: data.sessionToken });
}

export async function createRoom(name: string, solo = false): Promise<RequestResult<JoinedPayload>> {
  const res = await request<JoinedPayload>((s, cb) => s.timeout(REQUEST_TIMEOUT_MS).emit('room:create', { name, solo }, cb));
  if (res.ok) applyJoined(res.data);
  return res;
}

export async function joinRoom(code: string, name: string): Promise<RequestResult<JoinedPayload>> {
  const res = await request<JoinedPayload>((s, cb) => s.timeout(REQUEST_TIMEOUT_MS).emit('room:join', { code, name }, cb));
  if (res.ok) applyJoined(res.data);
  return res;
}

/** After (re)connecting, quietly reclaim our slot if we were in a room. */
async function tryResume(): Promise<void> {
  const saved = loadSession();
  if (!saved) {
    // Our socket changed but we have no saved session: we can't be in a room.
    if (sessionStore.get().room) clearLocalSession();
    return;
  }
  sessionStore.patch({ resuming: true });
  const res = await request<JoinedPayload>((s, cb) => s.timeout(REQUEST_TIMEOUT_MS).emit('room:resume', saved, cb));
  if (res.ok) {
    applyJoined(res.data);
  } else {
    const wasInRoom = sessionStore.get().room !== null;
    clearLocalSession();
    if (wasInRoom || res.error === 'SESSION_EXPIRED') notify('Your previous room is no longer available.', 'error');
  }
}

export function clearLocalSession(): void {
  saveSession(null);
  worldStore.set({ world: null });
  meStore.set({ me: null });
  sessionStore.set({ room: null, playerId: null, resuming: false });
}

export async function leaveRoom(): Promise<void> {
  clearLocalSession();
  await request<null>((s, cb) => s.timeout(REQUEST_TIMEOUT_MS).emit('room:leave', cb));
}

export async function setReady(ready: boolean): Promise<RequestResult<null>> {
  return request<null>((s, cb) => s.timeout(REQUEST_TIMEOUT_MS).emit('room:ready', ready, cb));
}

export async function startGame(): Promise<RequestResult<null>> {
  return request<null>((s, cb) => s.timeout(REQUEST_TIMEOUT_MS).emit('room:start', cb));
}

/** "Explore Alone": a private one-player room that starts immediately. */
export async function exploreAlone(name: string): Promise<RequestResult<null>> {
  const created = await createRoom(name, true);
  if (!created.ok) return created;
  const started = await startGame();
  if (!started.ok) await leaveRoom();
  return started;
}

/* ───────────── in-game traffic ───────────── */

type FrameListener = (frame: PlayersFrame) => void;
type CorrectionListener = (c: Correction) => void;
const frameListeners = new Set<FrameListener>();
const correctionListeners = new Set<CorrectionListener>();

export function onPlayersFrame(fn: FrameListener): () => void {
  frameListeners.add(fn);
  return () => frameListeners.delete(fn);
}

export function onCorrection(fn: CorrectionListener): () => void {
  correctionListeners.add(fn);
  return () => correctionListeners.delete(fn);
}

export function sendPlayerState(state: PlayerNetInput): void {
  if (socket?.connected) socket.emit('player:state', state);
}

export async function usePortal(id: string): Promise<boolean> {
  const res = await request<null>((s, cb) => s.timeout(REQUEST_TIMEOUT_MS).emit('game:portal', id, cb));
  return res.ok;
}

export async function syncGame(): Promise<RequestResult<GameSync>> {
  const res = await request<GameSync>((s, cb) => s.timeout(REQUEST_TIMEOUT_MS).emit('game:sync', cb));
  if (res.ok) {
    worldStore.set({ world: res.data.world });
    meStore.set({ me: res.data.me });
  }
  return res;
}

export async function interact(target: string, action: InteractAction): Promise<RequestResult<InteractResult>> {
  return request<InteractResult>((s, cb) => s.timeout(REQUEST_TIMEOUT_MS).emit('game:interact', { target, action }, cb));
}

export async function useItem(slot: number): Promise<RequestResult<InteractResult>> {
  return request<InteractResult>((s, cb) => s.timeout(REQUEST_TIMEOUT_MS).emit('inv:use', slot, cb));
}

export async function dropItem(slot: number): Promise<RequestResult<InteractResult>> {
  return request<InteractResult>((s, cb) => s.timeout(REQUEST_TIMEOUT_MS).emit('inv:drop', slot, cb));
}

type GameEventListener = (e: GameEvent) => void;
const eventListeners = new Set<GameEventListener>();
/** In-game listeners (sounds, torch recharge). */
export function onGameEvent(fn: GameEventListener): () => void {
  eventListeners.add(fn);
  return () => eventListeners.delete(fn);
}

function handleEvent(e: GameEvent): void {
  eventListeners.forEach((fn) => fn(e));
  const text = describeEvent(e);
  if (text) notify(text);
  if (e.type === 'broadcast') broadcastStore.set({ doc: e.doc, key: performance.now() });
}

function describeEvent(e: GameEvent): string | null {
  switch (e.type) {
    case 'message':
      return e.text;
    case 'found':
      return `${e.by} found: ${DOCS[e.doc]?.title ?? 'something'}`;
    case 'sfx':
    case 'broadcast':
    case 'recharge':
    case 'horror':
    case 'hit':
      return null;
    case 'chase':
      return `Something is coming for ${e.target}.`;
    case 'joined':
      return `${e.name} joined.`;
    case 'left':
      return `${e.name} left the game.`;
    case 'disconnected':
      return `${e.name} lost connection…`;
    case 'reconnected':
      return `${e.name} is back.`;
  }
}
