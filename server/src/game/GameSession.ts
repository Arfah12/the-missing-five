import {
  BATTERY_CHARGE,
  BLEEDOUT_S,
  CHAMBER,
  CHAMBER_POS,
  DOCS,
  FORBIDDEN_GATE_ID,
  FUSE_ORDER,
  INTERACTABLES,
  INTERACT_RANGE_SERVER,
  INVENTORY_SLOTS,
  INVENTORY_TYPES,
  ITEM_SPAWNS,
  LEVER_LATCH_COOP_S,
  LEVER_LATCH_SOLO_S,
  MAX_HEALTH,
  PADLOCK_CODE,
  PLAYER,
  PORTALS,
  PORTAL_SLACK,
  RADIO_FREQ,
  REVIVE_HEALTH,
  REVIVE_S,
  DAWN_S,
  ENDINGS,
  MYSTERY_DOCS,
  computeObjectives,
  decideEnding,
  type CollisionWorld,
  type Decision,
  type EndingFacts,
  type GameEnd,
  type Correction,
  type ErrorCode,
  type GameEvent,
  type GameSync,
  type InteractAction,
  type InteractResult,
  type Interactable,
  type InvItem,
  type NetPlayer,
  type PlayerNetInput,
  type PlayersFrame,
  type PrivateState,
  type WorldItem,
  type WorldSnapshot,
} from '@tmf/shared';
import { HorrorDirector } from './Horror';
import { WatcherAI } from './Watcher';

/**
 * One running game: the authoritative copy of every player and of the
 * shared world (items, doors, puzzles, objectives).
 *
 * Clients move themselves (so controls feel instant) and report their
 * position; the server checks every report against the shared collision
 * world and a speed limit, and snaps the player back when it is impossible.
 * Everything that matters to the whole team – picking things up, unlocking,
 * puzzles, health – only ever changes here.
 */

export interface SpawnPoint {
  x: number;
  z: number;
  yaw: number;
}

export interface GameSessionOptions {
  world: CollisionWorld;
  spawns: readonly SpawnPoint[];
  mode: 'solo' | 'coop';
  now?: () => number;
  /** Random source for The Watcher and horror events (seeded in tests). */
  rand?: () => number;
}

interface ServerPlayer extends NetPlayer {
  seq: number;
  /** Server time of the last accepted position. */
  lastAt: number;
  /** Consecutive rejected updates (for logging / anti-cheat later). */
  rejects: number;
  inventory: (InvItem | null)[];
  downedAt: number | null;
  /** Someone is reviving this player. */
  revive: { by: string; since: number } | null;
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: ErrorCode; message?: string };

/** An event for everyone in the room, or for one player only. */
export interface Outgoing {
  to: string | null;
  event: GameEvent;
}

/** Extra metres allowed per update on top of the sprint speed (latency jitter). */
const SLACK = 0.9;
/** Max height above the ground a report may claim (falling is fine, flying isn't). */
const MAX_AIR = 2.6;

/** Everyone down for this long (nobody left to revive anyone) ends the game. */
const ALL_DOWN_GAME_OVER_S = 4;

const okv = <T>(value: T): Outcome<T> => ({ ok: true, value });
const no = <T>(error: ErrorCode, message?: string): Outcome<T> => ({ ok: false, error, message });

export class GameSession {
  readonly startedAt: number;
  readonly mode: 'solo' | 'coop';
  private readonly players = new Map<string, ServerPlayer>();
  private readonly world: CollisionWorld;
  private readonly spawns: readonly SpawnPoint[];
  private readonly now: () => number;

  // ── shared world state ──
  private readonly items = new Map<string, WorldItem>();
  private readonly journal: { doc: string; by: string }[] = [];
  private readonly rescued = new Set<string>();
  private readonly rescuing = new Map<string, { by: string; since: number }>();
  private readonly unlocked = new Set<string>();
  private power = false;
  private radioSolved = false;
  private readonly fuse = [false, false, false, false];
  private fuseSeq: number[] = [];
  private readonly levers = { a: 0, b: 0 };
  private secretRoom = false;
  private dropSeq = 0;

  // ── horror ──
  readonly watcher: WatcherAI;
  readonly horror: HorrorDirector;
  private downs = 0;
  private allDownSince: number | null = null;
  /** Set when the game is over; the network layer then ends it for everyone. */
  ended: GameEnd | null = null;

  // ── story ──
  private readonly decisions: Decision[] = [];
  private final: { mode: 'free' | 'sleep'; dawnAt: number | null } | null = null;
  private introSent = false;

  // ── outbox ──
  private worldDirty = true;
  private readonly privateDirty = new Set<string>();
  private outbox: Outgoing[] = [];

  constructor(opts: GameSessionOptions) {
    this.world = opts.world;
    this.spawns = opts.spawns;
    this.mode = opts.mode;
    this.now = opts.now ?? Date.now;
    this.startedAt = this.now();
    for (const s of ITEM_SPAWNS) this.items.set(s.id, { ...s });
    const rand = opts.rand ?? Math.random;
    this.watcher = new WatcherAI(this.world, this.mode, rand, this.startedAt);
    this.horror = new HorrorDirector(rand, this.startedAt);
  }

  has(id: string): boolean {
    return this.players.has(id);
  }

  /* ───────────────────────── players ───────────────────────── */

  /** Adds a player at the next free spawn point. */
  addPlayer(id: string, name: string): NetPlayer {
    const used = new Set([...this.players.values()].map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const sp = this.spawns[slot % this.spawns.length];
    const g = this.world.groundAt(sp.x, sp.z, Number.POSITIVE_INFINITY);
    const p: ServerPlayer = {
      id,
      name,
      slot,
      x: sp.x,
      y: g.height,
      z: sp.z,
      yaw: sp.yaw,
      pitch: 0,
      crouch: 0,
      flashlight: false,
      sprinting: false,
      connected: true,
      health: MAX_HEALTH,
      downed: false,
      seq: -1,
      lastAt: this.now(),
      rejects: 0,
      inventory: Array.from({ length: INVENTORY_SLOTS }, () => null),
      downedAt: null,
      revive: null,
    };
    this.players.set(id, p);
    this.privateDirty.add(id);
    return this.public(p);
  }

  removePlayer(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    // whatever they carried is left where they stood
    p.inventory.forEach((it, i) => it && this.dropFrom(p, i));
    this.players.delete(id);
    for (const q of this.players.values()) if (q.revive?.by === id) q.revive = null;
  }

  setConnected(id: string, connected: boolean): void {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = connected;
    if (connected) {
      // after a reconnect the next report may be far from the last one
      p.lastAt = this.now();
      p.seq = -1;
      this.privateDirty.add(id);
    } else {
      p.sprinting = false;
    }
  }

  /**
   * Applies a movement report. Returns a correction when the report was
   * rejected (the client must move back to the server's position).
   */
  applyInput(id: string, input: PlayerNetInput): Correction | null {
    const p = this.players.get(id);
    if (!p) return null;
    if (input.seq <= p.seq) return null; // stale / duplicate packet
    p.seq = input.seq;

    // the downed can look around but not move
    if (p.downed) {
      p.yaw = input.yaw;
      p.pitch = input.pitch;
      const moved = Math.hypot(input.x - p.x, input.z - p.z) > 0.05;
      return moved ? { x: p.x, y: p.y, z: p.z, teleport: false } : null;
    }

    const t = this.now();
    const elapsed = Math.min(1.5, Math.max(0, (t - p.lastAt) / 1000));
    const dist = Math.hypot(input.x - p.x, input.z - p.z);
    const maxDist = PLAYER.sprintSpeed * 1.25 * elapsed + SLACK;

    let reason: string | null = null;
    const b = this.world.bounds;
    if (input.x < b.minX || input.x > b.maxX || input.z < b.minZ || input.z > b.maxZ) reason = 'bounds';
    else if (dist > maxDist) reason = 'speed';
    else {
      const crouchHeight = PLAYER.standHeight + (PLAYER.crouchHeight - PLAYER.standHeight) * input.crouch;
      const ground = this.world.groundAt(input.x, input.z, input.y + PLAYER.stepHeight);
      if (input.y < ground.height - 0.35 || input.y > ground.height + MAX_AIR) reason = 'height';
      else if (this.world.overlaps(input.x, input.z, PLAYER.radius * 0.75, input.y + PLAYER.stepHeight + 0.05, input.y + crouchHeight - 0.05))
        reason = 'inside';
    }

    // orientation and flags are always accepted (they're harmless)
    p.yaw = input.yaw;
    p.pitch = input.pitch;
    p.flashlight = input.flashlight;

    if (reason) {
      p.rejects += 1;
      return { x: p.x, y: p.y, z: p.z, teleport: false };
    }
    p.rejects = 0;
    p.x = input.x;
    p.y = input.y;
    p.z = input.z;
    p.crouch = input.crouch;
    p.sprinting = input.sprinting;
    p.lastAt = t;
    this.checkSecretRoom(p);
    return null;
  }

  /** Moves a player (portals, unstuck, respawn). Returns the correction to send. */
  teleport(id: string, x: number, z: number, yaw?: number): Correction | null {
    const p = this.players.get(id);
    if (!p) return null;
    const g = this.world.groundAt(x, z, Number.POSITIVE_INFINITY);
    p.x = x;
    p.z = z;
    p.y = g.height;
    if (yaw !== undefined) p.yaw = yaw;
    p.lastAt = this.now();
    return { x, y: p.y, z, yaw, teleport: true };
  }

  /** Walk-in portals (hatch, ladders, well). Checks the player is really there. */
  usePortal(id: string, portalId: unknown): { ok: true; correction: Correction } | { ok: false; error: ErrorCode } {
    const p = this.players.get(id);
    const portal = PORTALS.find((q) => q.id === portalId);
    if (!p || !portal || p.downed) return { ok: false, error: 'TOO_FAR' };
    if (Math.hypot(p.x - portal.from.x, p.z - portal.from.z) > portal.from.r + PORTAL_SLACK) return { ok: false, error: 'TOO_FAR' };
    if (portal.requiresOpen && !this.world.isOpen(portal.requiresOpen)) return { ok: false, error: 'LOCKED' };
    const c = this.teleport(id, portal.to.x, portal.to.z, portal.to.yaw);
    return c ? { ok: true, correction: c } : { ok: false, error: 'TOO_FAR' };
  }

  /** Opens / closes a door or gate for everyone (collision included). */
  setOpen(colliderId: string, open: boolean): void {
    if (this.world.isOpen(colliderId) === open) return;
    this.world.setOpen(colliderId, open);
    this.worldDirty = true;
  }

  /* ───────────────────────── interactions ───────────────────────── */

  private near(p: ServerPlayer, x: number, y: number, z: number, range = INTERACT_RANGE_SERVER): boolean {
    return Math.hypot(p.x - x, p.z - z) <= range && Math.abs(p.y + 1.2 - y) <= 2.2;
  }

  private emit(event: GameEvent, to: string | null = null): void {
    this.outbox.push({ to, event });
  }

  private addToJournal(doc: string, by: string): void {
    if (this.journal.some((j) => j.doc === doc)) return;
    this.journal.push({ doc, by });
    this.emit({ type: 'found', doc, by });
  }

  private rescueAction(p: ServerPlayer, child: string, action: InteractAction): Outcome<InteractResult> {
    if (!['alya', 'danish', 'mira', 'adam', 'sofia'].includes(child)) return no('TOO_FAR');
    const item = this.items.get(`belonging-${child}`);
    const position = item ?? ITEM_SPAWNS.find((q) => q.id === `belonging-${child}`);
    if (!position || !this.near(p, position.x + 0.9, position.y, position.z + 0.8, 3.2)) return no('TOO_FAR');
    if (this.rescued.has(child)) return no('SERVER_ERROR', `${child[0].toUpperCase()}${child.slice(1)} has already gone home.`);
    if (action.type === 'rescueCancel') {
      if (this.rescuing.get(child)?.by === p.id) this.rescuing.delete(child);
      return okv({ kind: 'ok' });
    }
    if (action.type !== 'rescue') return no('SERVER_ERROR');
    const current = this.rescuing.get(child);
    if (!current) this.rescuing.set(child, { by: p.id, since: this.now() });
    else if (current.by !== p.id) return no('SERVER_ERROR', 'Someone else is helping this child.');
    return okv({ kind: 'ok', message: 'Hold E and recite the doa to open the rope.' });
  }

  private hasItem(p: ServerPlayer, need: string): boolean {
    return p.inventory.some((it) => it && (it.id === need || it.type === need));
  }

  /**
   * One interaction request. `targetId` is an item id, an interactable id,
   * or a player id (revive).
   */
  interact(id: string, targetId: unknown, action: InteractAction): Outcome<InteractResult> {
    const p = this.players.get(id);
    if (!p) return no('NOT_PLAYING');
    if (typeof targetId !== 'string') return no('TOO_FAR');
    if (p.downed) return no('NOT_PLAYING', 'You are down.');

    // revive a teammate
    const other = this.players.get(targetId);
    if (other && other.id !== id) return this.reviveAction(p, other, action);

    if (targetId.startsWith('child:')) return this.rescueAction(p, targetId.slice(6), action);

    // pick up an item
    const item = this.items.get(targetId);
    if (item) {
      if (action.type !== 'pickup') return no('SERVER_ERROR');
      if (!this.near(p, item.x, item.y, item.z)) return no('TOO_FAR');
      return this.pickup(p, item);
    }

    const it = INTERACTABLES.find((q) => q.id === targetId);
    if (!it) return no('TOO_FAR');
    if (!this.near(p, it.x, it.y, it.z)) return no('TOO_FAR');
    switch (it.kind) {
      case 'door':
        return this.doorAction(p, it);
      case 'padlock':
        return this.padlockAction(it, action);
      case 'pry':
        return this.pryAction(p, it);
      case 'fusebox':
        return this.fuseAction(action);
      case 'radio':
        return this.radioAction(action);
      case 'lever':
        return this.leverAction(it);
      case 'readable':
        if (it.doc) this.addToJournal(it.doc, p.name);
        return okv({ kind: 'read', doc: it.doc ?? '' });
      case 'altar':
        return this.altarAction(p, action);
      case 'car':
        return this.carAction(p, action);
    }
  }

  /* ───────────────────────── story choices (Phase 7) ───────────────────────── */

  private found(doc: string): boolean {
    return this.journal.some((j) => j.doc === doc);
  }

  private altarAction(p: ServerPlayer, action: InteractAction): Outcome<InteractResult> {
    if (this.final) return okv({ kind: 'ok', message: this.final.mode === 'free' ? 'The mats are empty now. RUN.' : 'They are asleep. Let them be.' });
    const children = this.childrenFound();
    const knows = MYSTERY_DOCS.every((d) => this.found(d));
    if (action.type === 'choose') {
      if (children < 5 || !knows) return no('LOCKED', 'You are not ready to choose yet.');
      if (action.option !== 'free' && action.option !== 'sleep') return no('SERVER_ERROR');
      this.decisions.push({ choice: 'altar', option: action.option, by: p.name });
      this.final = { mode: action.option, dawnAt: action.option === 'free' ? this.now() + DAWN_S * 1000 : null };
      this.worldDirty = true;
      if (action.option === 'free') {
        this.emit({ type: 'message', text: `${p.name} spoke their names. The Penunggu is awake — get to the car before dawn!` });
        this.watcher.setRage(true, this.now());
      } else {
        this.emit({ type: 'message', text: `${p.name} let them sleep. Walk back to the car.` });
      }
      return okv({ kind: 'ok' });
    }
    // first look: the inscription, and what is still missing
    this.addToJournal('batu-penunggu', p.name);
    if (children < 5 || !knows) {
      const missing = [children < 5 ? `${5 - children} of the children's belongings` : null, !knows ? 'the truth about 1998' : null].filter(Boolean).join(' and ');
      return okv({ kind: 'read', doc: 'batu-penunggu', message: `Still missing: ${missing}.` });
    }
    return okv({ kind: 'choice', choice: 'altar' });
  }

  private carAction(p: ServerPlayer, action: InteractAction): Outcome<InteractResult> {
    if (!this.final && this.childrenFound() === 0) {
      return okv({ kind: 'ok', message: "The engine won't even turn over. Not yet — not before you know why you came." });
    }
    if (action.type !== 'choose') return okv({ kind: 'choice', choice: 'car' });
    if (action.option === 'stay') return okv({ kind: 'ok' });
    if (action.option !== 'leave') return no('SERVER_ERROR');
    this.decisions.push({ choice: 'car', option: 'leave', by: p.name });
    this.finish({ via: 'car', final: this.final?.mode ?? null, children: this.childrenFound() });
    return okv({ kind: 'ok' });
  }

  /** End the game with the ending the facts lead to (or Game Over). */
  private finish(f: EndingFacts): void {
    if (this.ended) return;
    const ending = decideEnding(f);
    if (!ending) {
      this.ended = this.gameOver();
      return;
    }
    const e = ENDINGS[ending];
    this.ended = { kind: 'ending', ending, title: e.title, subtitle: e.subtitle, text: [...e.text], stats: this.stats() };
  }

  private pickup(p: ServerPlayer, item: WorldItem): Outcome<InteractResult> {
    if (INVENTORY_TYPES.has(item.type)) {
      const slot = p.inventory.findIndex((s) => s === null);
      if (slot < 0) return no('SERVER_ERROR', 'Your hands are full (5 slots). Drop something with G.');
      p.inventory[slot] = { id: item.id, type: item.type, name: item.name };
      this.items.delete(item.id);
      this.privateDirty.add(p.id);
      this.worldDirty = true;
      this.emit({ type: 'sfx', sound: 'pickup', x: item.x, y: item.y, z: item.z });
      return okv({ kind: 'ok', message: `Picked up ${item.name}` });
    }
    // journal items are shared knowledge
    this.items.delete(item.id);
    this.worldDirty = true;
    this.emit({ type: 'sfx', sound: 'pickup', x: item.x, y: item.y, z: item.z });
    if (item.doc) {
      this.addToJournal(item.doc, p.name);
      return okv({ kind: 'read', doc: item.doc });
    }
    return okv({ kind: 'ok' });
  }

  private doorAction(p: ServerPlayer, it: Interactable): Outcome<InteractResult> {
    const id = it.opens ?? it.id;
    if (!this.unlocked.has(id)) {
      if (it.needsItem && this.hasItem(p, it.needsItem)) {
        this.unlocked.add(id);
        this.emit({ type: 'sfx', sound: 'unlock', x: it.x, y: it.y, z: it.z });
      } else {
        this.emit({ type: 'sfx', sound: 'locked', x: it.x, y: it.y, z: it.z }, p.id);
        return no('LOCKED', 'Locked. There must be a key somewhere.');
      }
    }
    const open = !this.world.isOpen(id);
    if (!open && this.someoneIn(id)) return okv({ kind: 'ok', message: 'Someone is in the doorway.' });
    this.setOpen(id, open);
    return okv({ kind: 'ok' });
  }

  /** Is any player standing where a closing door would be? */
  private someoneIn(colliderId: string): boolean {
    this.world.setOpen(colliderId, false);
    const blocked = [...this.players.values()].some((q) =>
      this.world.overlaps(q.x, q.z, PLAYER.radius, q.y + PLAYER.stepHeight, q.y + PLAYER.standHeight),
    );
    this.world.setOpen(colliderId, true);
    return blocked;
  }

  private padlockAction(it: Interactable, action: InteractAction): Outcome<InteractResult> {
    const id = it.opens ?? it.id;
    if (this.unlocked.has(id)) {
      const open = !this.world.isOpen(id);
      if (!open && this.someoneIn(id)) return okv({ kind: 'ok', message: 'Someone is in the doorway.' });
      this.setOpen(id, open);
      return okv({ kind: 'ok' });
    }
    if (action.type !== 'code') return okv({ kind: 'ui', ui: 'padlock' });
    if (action.code !== PADLOCK_CODE) {
      this.emit({ type: 'sfx', sound: 'wrong', x: it.x, y: it.y, z: it.z });
      return no('LOCKED', 'The padlock does not open.');
    }
    this.unlocked.add(id);
    this.setOpen(id, true);
    this.emit({ type: 'sfx', sound: 'unlock', x: it.x, y: it.y, z: it.z });
    this.emit({ type: 'message', text: 'The padlock clicks open.' });
    return okv({ kind: 'ok', message: 'The padlock clicks open.' });
  }

  private pryAction(p: ServerPlayer, it: Interactable): Outcome<InteractResult> {
    const id = it.opens ?? it.id;
    if (this.world.isOpen(id)) return okv({ kind: 'ok', message: 'Already open.' });
    if (!it.needsItem || !this.hasItem(p, it.needsItem)) {
      this.emit({ type: 'sfx', sound: 'locked', x: it.x, y: it.y, z: it.z }, p.id);
      return no('LOCKED', 'Nailed shut. You need something to pry it open.');
    }
    this.setOpen(id, true);
    this.unlocked.add(id);
    this.emit({ type: 'sfx', sound: 'unlock', x: it.x, y: it.y, z: it.z });
    this.emit({ type: 'message', text: `${p.name} pried it open.` });
    return okv({ kind: 'ok' });
  }

  private fuseAction(action: InteractAction): Outcome<InteractResult> {
    if (action.type !== 'toggle' || action.index === undefined) return okv({ kind: 'ui', ui: 'fusebox' });
    if (this.power) return okv({ kind: 'ok', message: 'The power is already on.' });
    const i = action.index;
    this.worldDirty = true;
    if (this.fuse[i]) {
      // switching one off resets the sequence
      this.fuse.fill(false);
      this.fuseSeq = [];
      this.emit({ type: 'sfx', sound: 'switch' });
      return okv({ kind: 'ok' });
    }
    this.fuse[i] = true;
    this.fuseSeq.push(i);
    const good = this.fuseSeq.every((v, k) => v === FUSE_ORDER[k]);
    if (!good) {
      this.fuse.fill(false);
      this.fuseSeq = [];
      this.emit({ type: 'sfx', sound: 'trip' });
      return okv({ kind: 'ok', message: 'Everything trips with a loud bang.' });
    }
    this.emit({ type: 'sfx', sound: 'switch' });
    if (this.fuseSeq.length === FUSE_ORDER.length) {
      this.power = true;
      this.emit({ type: 'sfx', sound: 'power' });
      this.emit({ type: 'broadcast', doc: 'pa-announcement' });
      this.addToJournal('pa-announcement', 'school speakers');
      return okv({ kind: 'ok', message: 'The school lights flicker on.' });
    }
    return okv({ kind: 'ok' });
  }

  private radioAction(action: InteractAction): Outcome<InteractResult> {
    if (action.type !== 'tune') return okv({ kind: 'ui', ui: 'radio' });
    if (Math.abs(action.freq - RADIO_FREQ) < 0.06) {
      if (!this.radioSolved) {
        this.radioSolved = true;
        this.worldDirty = true;
        this.emit({ type: 'sfx', sound: 'radio' });
        this.emit({ type: 'broadcast', doc: 'radio-message' });
        this.addToJournal('radio-message', 'the radio');
      }
      return okv({ kind: 'read', doc: 'radio-message' });
    }
    return okv({ kind: 'ok', message: 'Only static…' });
  }

  private leverAction(it: Interactable): Outcome<InteractResult> {
    if (this.world.isOpen(FORBIDDEN_GATE_ID)) return okv({ kind: 'ok', message: 'The gate is already open.' });
    const t = this.now();
    const latch = (this.mode === 'solo' ? LEVER_LATCH_SOLO_S : LEVER_LATCH_COOP_S) * 1000;
    const key = it.id === 'lever-a' ? 'a' : 'b';
    this.levers[key] = t + latch;
    this.worldDirty = true;
    this.emit({ type: 'sfx', sound: 'lever', x: it.x, y: it.y, z: it.z });
    if (this.levers.a > t && this.levers.b > t) {
      this.setOpen(FORBIDDEN_GATE_ID, true);
      this.emit({ type: 'sfx', sound: 'gate' });
      this.emit({ type: 'message', text: 'Somewhere ahead, iron screeches open.' });
      return okv({ kind: 'ok' });
    }
    return okv({
      kind: 'ok',
      message: this.mode === 'solo' ? 'It springs back slowly… the other lever, quickly!' : 'It springs back as soon as you let go. Someone has to pull the other one at the same time.',
    });
  }

  /* ───────────────────────── inventory ───────────────────────── */

  useItem(id: string, slot: unknown): Outcome<InteractResult> {
    const p = this.players.get(id);
    if (!p || typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= INVENTORY_SLOTS) return no('SERVER_ERROR');
    if (p.downed) return no('NOT_PLAYING', 'You are down.');
    const it = p.inventory[slot];
    if (!it) return no('SERVER_ERROR', 'Empty slot.');
    if (it.type === 'battery') {
      p.inventory[slot] = null;
      this.privateDirty.add(p.id);
      this.emit({ type: 'recharge', amount: BATTERY_CHARGE }, p.id);
      return okv({ kind: 'ok', message: 'Fresh batteries in the torch.' });
    }
    return okv({ kind: 'ok', message: it.type === 'key' ? 'Use it on a locked door (E).' : 'Use it on something nailed shut (E).' });
  }

  dropItem(id: string, slot: unknown): Outcome<InteractResult> {
    const p = this.players.get(id);
    if (!p || typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= INVENTORY_SLOTS) return no('SERVER_ERROR');
    if (!p.inventory[slot]) return no('SERVER_ERROR', 'Empty slot.');
    this.dropFrom(p, slot);
    return okv({ kind: 'ok' });
  }

  private dropFrom(p: ServerPlayer, slot: number): void {
    const it = p.inventory[slot];
    if (!it) return;
    p.inventory[slot] = null;
    const ahead = 0.6;
    const x = p.x - Math.sin(p.yaw) * ahead;
    const z = p.z - Math.cos(p.yaw) * ahead;
    const ground = this.world.groundAt(x, z, p.y + PLAYER.stepHeight);
    // keep the original id for unique things (keys, crowbar); batteries get fresh ids
    const newId = this.items.has(it.id) ? `${it.id}#${++this.dropSeq}` : it.id;
    this.items.set(newId, { id: newId, type: it.type, name: it.name, x, y: ground.height + 0.03, z });
    this.privateDirty.add(p.id);
    this.worldDirty = true;
  }

  /* ───────────────────────── health ───────────────────────── */

  /** Hurt a player (Phase 6: The Watcher). At 0 they go down. */
  damage(id: string, amount: number): void {
    const p = this.players.get(id);
    if (!p || p.downed || amount <= 0) return;
    p.health = Math.max(0, p.health - amount);
    if (p.health === 0) {
      this.downs += 1;
      p.downed = true;
      p.downedAt = this.now();
      p.sprinting = false;
      this.emit({ type: 'sfx', sound: 'downed', x: p.x, y: p.y, z: p.z });
      this.emit({ type: 'message', text: `${p.name} is down! Hold E on them to help.` });
    }
    this.privateDirty.add(id);
  }

  private reviveAction(p: ServerPlayer, other: ServerPlayer, action: InteractAction): Outcome<InteractResult> {
    if (!other.downed) return no('SERVER_ERROR', `${other.name} doesn't need help.`);
    if (!this.near(p, other.x, other.y + 0.5, other.z, 2.6)) return no('TOO_FAR');
    if (action.type === 'reviveCancel') {
      if (other.revive?.by === p.id) other.revive = null;
      return okv({ kind: 'ok' });
    }
    if (action.type !== 'revive') return no('SERVER_ERROR');
    if (!other.revive || other.revive.by !== p.id) other.revive = { by: p.id, since: this.now() };
    return okv({ kind: 'ok', message: `Helping ${other.name} up…` });
  }

  /** Advances timers (revive, bleed-out, levers). Call ~10×/s. */
  tick(): void {
    const t = this.now();
    for (const p of this.players.values()) {
      if (!p.downed) continue;
      if (p.revive) {
        const helper = this.players.get(p.revive.by);
        if (!helper || helper.downed || !helper.connected || Math.hypot(helper.x - p.x, helper.z - p.z) > 2.8) p.revive = null;
        else if (t - p.revive.since >= REVIVE_S * 1000) {
          p.downed = false;
          p.downedAt = null;
          p.revive = null;
          p.health = REVIVE_HEALTH;
          p.lastAt = t;
          this.privateDirty.add(p.id);
          this.emit({ type: 'sfx', sound: 'revived', x: p.x, y: p.y, z: p.z });
          this.emit({ type: 'message', text: `${helper.name} got ${p.name} back on their feet.` });
          continue;
        }
      }
      if (p.downedAt !== null && t - p.downedAt >= BLEEDOUT_S * 1000) {
        // they wake up back at the car, shaken
        const sp = this.spawns[p.slot % this.spawns.length];
        const c = this.teleport(p.id, sp.x, sp.z, sp.yaw);
        p.downed = false;
        p.downedAt = null;
        p.revive = null;
        p.health = 50;
        this.privateDirty.add(p.id);
        if (c) this.emit({ type: 'message', text: `${p.name} woke up by the car, not knowing how they got there.` });
        this.pendingCorrections.push({ id: p.id, c: c! });
      }
      for (const [child, rescue] of this.rescuing) {
        const helper = this.players.get(rescue.by);
        const item = ITEM_SPAWNS.find((q) => q.id === `belonging-${child}`);
        if (!helper || !helper.connected || helper.downed || !item || Math.hypot(helper.x - (item.x + 0.9), helper.z - (item.z + 0.8)) > 3.2) {
          this.rescuing.delete(child);
        } else if (t - rescue.since >= 5000) {
          this.rescuing.delete(child);
          this.rescued.add(child);
          this.items.delete(`belonging-${child}`);
          this.addToJournal(`belonging-${child}`, helper.name);
          this.emit({ type: 'message', text: `${child[0].toUpperCase()}${child.slice(1)} dijumpai! Ibu bapa telah dihubungi dan datang mengambilnya.` });
          this.emit({ type: 'sfx', sound: 'vanish', x: item.x, y: item.y, z: item.z });
          this.worldDirty = true;
        }
      }
    }
    const before = this.leverState();
    if (this.levers.a && this.levers.a <= t) this.levers.a = 0;
    if (this.levers.b && this.levers.b <= t) this.levers.b = 0;
    const after = this.leverState();
    if (before.a !== after.a || before.b !== after.b) this.worldDirty = true;

    if (this.ended) return;
    if (!this.introSent && this.players.size) {
      // the recording that brought them here
      this.introSent = true;
      this.emit({ type: 'broadcast', doc: 'rakaman' });
      for (const p of this.players.values()) this.addToJournal('rakaman', p.name);
    }
    if (this.final?.dawnAt && t >= this.final.dawnAt) {
      this.finish({ via: 'dawn', final: this.final.mode, children: this.childrenFound() });
      return;
    }
    const everyone = [...this.players.values()];
    this.watcher.update(t, everyone, {
      damage: (id, amount) => this.damage(id, amount),
      emit: (e, to) => this.emit(e, to),
      childrenFound: () => this.childrenFound(),
    });
    this.horror.update(t, everyone, {
      emit: (e, to) => this.emit(e, to),
      slamDoorNear: (x, z) => this.slamDoorNear(x, z),
      watcherActive: () => this.watcher.active,
    });

    // everyone still here is down and nobody can help → Game Over
    const present = everyone.filter((p) => p.connected);
    if (present.length && present.every((p) => p.downed)) {
      this.allDownSince ??= t;
      if (t - this.allDownSince >= ALL_DOWN_GAME_OVER_S * 1000) this.finish({ via: 'allDown', final: this.final?.mode ?? null, children: this.childrenFound() });
    } else {
      this.allDownSince = null;
    }
  }

  private childrenFound(): number {
    return this.journal.filter((j) => j.doc.startsWith('belonging-')).length;
  }

  /** A random scare: an open door near the players swings shut. */
  private slamDoorNear(x: number, z: number): { x: number; y: number; z: number } | null {
    for (const it of INTERACTABLES) {
      if (it.kind !== 'door' && it.kind !== 'padlock') continue;
      const id = it.opens ?? it.id;
      if (!this.world.isOpen(id) || Math.hypot(it.x - x, it.z - z) > 25 || this.someoneIn(id)) continue;
      this.setOpen(id, false);
      return { x: it.x, y: it.y, z: it.z };
    }
    return null;
  }

  stats(): GameEnd['stats'] {
    return {
      timeS: Math.round((this.now() - this.startedAt) / 1000),
      children: this.childrenFound(),
      clues: this.journal.filter((j) => !['pa-announcement', 'radio-message', 'rakaman', 'batu-penunggu'].includes(j.doc)).length,
      totalClues: Object.keys(DOCS).filter((d) => !['pa-announcement', 'radio-message', 'rakaman', 'batu-penunggu'].includes(d)).length,
      downs: this.downs,
    };
  }

  private gameOver(): GameEnd {
    return {
      kind: 'gameover',
      ending: null,
      title: 'Game Over',
      subtitle: 'Kampung Hujan keeps its secrets.',
      text: [
        'One by one the torches went out. When the rain stopped, the road out of the village was empty again.',
        'Nobody came looking for you. Nobody ever does.',
      ],
      stats: this.stats(),
    };
  }

  /** Corrections produced by tick() (respawns) for the network layer. */
  readonly pendingCorrections: { id: string; c: Correction }[] = [];

  private leverState() {
    const t = this.now();
    return { a: this.levers.a > t, b: this.levers.b > t };
  }

  private checkSecretRoom(p: ServerPlayer): void {
    if (this.secretRoom) return;
    if (Math.abs(p.x - CHAMBER_POS.x) < CHAMBER.hx - 0.5 && Math.abs(p.z - CHAMBER_POS.z) < CHAMBER.hz - 0.5) {
      this.secretRoom = true;
      this.worldDirty = true;
      this.emit({ type: 'message', text: `${p.name} found the secret room.` });
    }
  }

  /* ───────────────────────── snapshots ───────────────────────── */

  worldSnapshot(): WorldSnapshot {
    const found = new Set<string>(this.journal.map((j) => j.doc));
    return {
      items: [...this.items.values()],
      open: ['door:kelas3', 'door:stor', 'hatch:stor', 'well:planks', FORBIDDEN_GATE_ID].filter((id) => this.world.isOpen(id)),
      unlocked: [...this.unlocked],
      power: this.power,
      radioSolved: this.radioSolved,
      fuse: [...this.fuse],
      levers: this.leverState(),
      journal: [...this.journal],
      rescued: [...this.rescued],
      objectives: computeObjectives({ found, power: this.power, secretRoom: this.secretRoom, final: this.final?.mode ?? null }),
      decisions: [...this.decisions],
      final: this.final ? { ...this.final } : null,
      serverTime: this.now(),
    };
  }

  privateState(id: string): PrivateState | null {
    const p = this.players.get(id);
    if (!p) return null;
    const bleed = p.downedAt === null ? 0 : Math.max(0, BLEEDOUT_S - (this.now() - p.downedAt) / 1000);
    return { inventory: p.inventory.map((i) => (i ? { ...i } : null)), health: p.health, downed: p.downed, bleedout: bleed };
  }

  /** Pulls what changed since the last call (the network layer sends it). */
  drain(): { world: WorldSnapshot | null; privates: { id: string; state: PrivateState }[]; events: Outgoing[] } {
    const world = this.worldDirty ? this.worldSnapshot() : null;
    this.worldDirty = false;
    // downed players' bleed-out timer changes every second
    for (const p of this.players.values()) if (p.downed) this.privateDirty.add(p.id);
    const privates = [...this.privateDirty].flatMap((id) => {
      const state = this.privateState(id);
      return state ? [{ id, state }] : [];
    });
    this.privateDirty.clear();
    const events = this.outbox;
    this.outbox = [];
    return { world, privates, events };
  }

  /* ───────────────────────── frames ───────────────────────── */

  frame(): PlayersFrame {
    return { t: this.now(), players: [...this.players.values()].map((p) => this.public(p)), watcher: this.watcher.net() };
  }

  syncFor(id: string): GameSync | null {
    const p = this.players.get(id);
    if (!p) return null;
    return {
      you: this.public(p),
      players: [...this.players.values()].map((q) => this.public(q)),
      mode: this.mode,
      startedAt: this.startedAt,
      serverTime: this.now(),
      world: this.worldSnapshot(),
      me: this.privateState(id)!,
    };
  }

  rejectCount(id: string): number {
    return this.players.get(id)?.rejects ?? 0;
  }

  /** Journal docs that exist (sanity check for tests). */
  static docExists(doc: string): boolean {
    return doc in DOCS;
  }

  private public(p: ServerPlayer): NetPlayer {
    return {
      id: p.id,
      name: p.name,
      slot: p.slot,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      pitch: p.pitch,
      crouch: p.crouch,
      flashlight: p.flashlight,
      sprinting: p.sprinting,
      connected: p.connected,
      health: p.health,
      downed: p.downed,
    };
  }
}
