import {
  KAMPUNG_PROPS,
  PLAYER,
  UNDERGROUND_RECT,
  WATCHER,
  type CollisionWorld,
  type GameEvent,
  type NetWatcher,
  type WatcherMode,
} from '@tmf/shared';

/**
 * THE WATCHER – server-side AI. One per game, deterministic given the
 * random source and clock, so it can be unit-tested.
 *
 *   hidden ──(cooldown)──► observe ──► stalk ──► chase ──► disappear ──► hidden
 *                             │          │          ▲
 *                             └──────────┴──────────┘ (noticed you)
 *
 * Fairness rules: it is slower than a sprint, it gives up when it loses
 * sight of you or gets stuck at a wall (hide indoors!), it never enters the
 * working street lamp's light, shining a torch at it while it watches makes
 * it leave, and after one hit it retreats.
 */

export interface WatcherTarget {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  crouch: number;
  flashlight: boolean;
  sprinting: boolean;
  connected: boolean;
  downed: boolean;
}

export interface WatcherHooks {
  damage(id: string, amount: number): void;
  emit(event: GameEvent, to: string | null): void;
  /** How many children have been found (makes it come back sooner). */
  childrenFound(): number;
}

const LIGHTS = KAMPUNG_PROPS.filter((p) => p.kind === 'lampPole' && p.working).map((p) => ({ x: p.x + 1.7 * (p.arm ?? 1), z: p.z }));

const underground = (x: number, z: number) =>
  x >= UNDERGROUND_RECT.minX && x <= UNDERGROUND_RECT.maxX && z >= UNDERGROUND_RECT.minZ && z <= UNDERGROUND_RECT.maxZ;

const range = (r: () => number, [a, b]: readonly [number, number]) => a + r() * (b - a);

export class WatcherAI {
  mode: WatcherMode = 'hidden';
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  /** Player it is interested in. */
  targetId: string | null = null;

  private modeSince = 0;
  private modeUntil = 0;
  private nextAppear: number;
  private stare = 0;
  private lastSeen = 0;
  private lastProgress = { x: 0, z: 0, t: 0 };
  private lastT: number;
  /** After the children are freed it hunts relentlessly until dawn. */
  private rage = false;

  constructor(
    private readonly world: CollisionWorld,
    mode: 'solo' | 'coop',
    private readonly rand: () => number,
    start: number,
  ) {
    this.nextAppear = start + WATCHER.firstDelayS[mode] * 1000;
    this.lastT = start;
  }

  /** Network view (null while hidden). */
  net(): NetWatcher | null {
    if (this.mode === 'hidden') return null;
    return { mode: this.mode, x: this.x, y: this.y, z: this.z, yaw: this.yaw, windup: this.mode === 'chase' && this.inWindup(this.lastT) };
  }

  get active(): boolean {
    return this.mode !== 'hidden';
  }

  /** Enraged: comes back quickly, skips watching from afar, chases more often. */
  setRage(on: boolean, t: number): void {
    this.rage = on;
    if (on && this.mode === 'hidden') this.nextAppear = Math.min(this.nextAppear, t + 8_000);
  }

  /** Force the next appearance (tests, scripted scares). */
  appearAt(t: number): void {
    this.nextAppear = t;
  }

  update(t: number, players: WatcherTarget[], hooks: WatcherHooks): void {
    const dt = Math.min(0.25, Math.max(0, (t - this.lastT) / 1000));
    this.lastT = t;
    const target = players.find((p) => p.id === this.targetId) ?? null;

    switch (this.mode) {
      case 'hidden':
        if (t >= this.nextAppear) this.appear(t, players, hooks);
        return;
      case 'disappear':
        if (t >= this.modeUntil) this.hide(t, hooks);
        return;
    }

    // whoever it was after is gone / down / went somewhere else → leave
    if (!target || !target.connected || target.downed || underground(target.x, target.z) !== underground(this.x, this.z)) {
      this.vanish(t, hooks, false);
      return;
    }
    const dist = Math.hypot(target.x - this.x, target.z - this.z);
    const seen = this.isSeenBy(target);
    const torchOnIt = seen && target.flashlight && dist < WATCHER.torchStareRange;

    if (this.mode === 'observe' || this.mode === 'stalk') {
      this.stare = torchOnIt ? this.stare + dt : Math.max(0, this.stare - dt * 0.5);
      if (this.stare >= WATCHER.torchStareS) {
        this.vanish(t, hooks, true);
        return;
      }
    }

    switch (this.mode) {
      case 'observe': {
        this.face(target);
        if (dist < 9) {
          // walked right up to it
          if (this.rand() < 0.5) this.startChase(t, target, hooks);
          else this.vanish(t, hooks, true);
        } else if (t >= this.modeUntil) {
          if (this.rand() < 0.55) this.startStalk(t);
          else this.vanish(t, hooks, false);
        }
        return;
      }
      case 'stalk': {
        // keep a few metres behind them, out of the light
        const fx = -Math.sin(target.yaw);
        const fz = -Math.cos(target.yaw);
        const gx = target.x - fx * WATCHER.stalkDistance;
        const gz = target.z - fz * WATCHER.stalkDistance;
        const far = Math.hypot(gx - this.x, gz - this.z);
        this.moveTowards(gx, gz, far > 6 ? WATCHER.stalkCatchUp : WATCHER.stalkSpeed, dt, t);
        this.face(target);
        if (this.stuck(t)) {
          this.vanish(t, hooks, false);
          return;
        }
        if (seen && dist < 14) {
          if (this.rand() < 0.5) this.startChase(t, target, hooks);
          else this.vanish(t, hooks, true);
          return;
        }
        if (this.notices(target, dist)) {
          this.startChase(t, target, hooks);
          return;
        }
        if (t >= this.modeUntil) {
          if (this.rand() < (this.rage ? 0.85 : 0.35)) this.startChase(t, target, hooks);
          else this.vanish(t, hooks, false);
        }
        return;
      }
      case 'chase': {
        this.face(target);
        if (this.inWindup(t)) return; // the scream – a second to run
        if (this.inLight(target.x, target.z) || t - this.modeSince > WATCHER.chaseMaxS * 1000) {
          this.vanish(t, hooks, false);
          return;
        }
        const los = this.lineOfSight(target);
        if (los) this.lastSeen = t;
        else if (t - this.lastSeen > WATCHER.loseSightS * 1000) {
          this.vanish(t, hooks, false);
          return;
        }
        if (dist <= WATCHER.hitRange && Math.abs(target.y - this.y) < 1.6) {
          hooks.damage(target.id, WATCHER.hitDamage);
          hooks.emit({ type: 'hit', damage: WATCHER.hitDamage }, target.id);
          hooks.emit({ type: 'sfx', sound: 'watcherHit', x: target.x, y: target.y + 1.2, z: target.z }, null);
          this.vanish(t, hooks, false); // it retreats after an encounter
          return;
        }
        const speed = WATCHER.chaseSpeed * (torchOnIt ? WATCHER.torchSlow : 1);
        this.moveTowards(target.x, target.z, speed, dt, t);
        if (this.stuck(t)) this.vanish(t, hooks, false);
        return;
      }
    }
  }

  /* ───────────────────────── transitions ───────────────────────── */

  private appear(t: number, players: WatcherTarget[], hooks: WatcherHooks): void {
    const candidates = players.filter((p) => p.connected && !p.downed && !this.inLight(p.x, p.z));
    if (!candidates.length) {
      this.nextAppear = t + 10_000;
      return;
    }
    // prefers whoever strayed furthest from the group
    const isolation = (p: WatcherTarget) =>
      Math.min(60, ...players.filter((q) => q !== p && q.connected).map((q) => Math.hypot(q.x - p.x, q.z - p.z)));
    candidates.sort((a, b) => isolation(b) - isolation(a));
    const target = this.rand() < 0.7 ? candidates[0] : candidates[Math.floor(this.rand() * candidates.length)];
    const observe = !this.rage && this.rand() < 0.5;
    const spot = observe ? this.findSpot(target, 'front') : this.findSpot(target, 'behind');
    if (!spot) {
      this.nextAppear = t + 6_000; // nowhere to stand right now – try again soon
      return;
    }
    this.targetId = target.id;
    this.x = spot.x;
    this.z = spot.z;
    this.y = spot.y;
    this.face(target);
    this.stare = 0;
    this.lastProgress = { x: this.x, z: this.z, t };
    if (observe) this.setMode('observe', t, range(this.rand, WATCHER.observeS));
    else this.startStalk(t);
    void hooks;
  }

  private startStalk(t: number): void {
    this.setMode('stalk', t, range(this.rand, WATCHER.stalkS));
    this.lastProgress = { x: this.x, z: this.z, t };
  }

  private startChase(t: number, target: WatcherTarget, hooks: WatcherHooks): void {
    this.setMode('chase', t, WATCHER.chaseMaxS);
    this.lastSeen = t;
    this.lastProgress = { x: this.x, z: this.z, t: t + WATCHER.chaseWindupS * 1000 };
    hooks.emit({ type: 'chase', target: target.name, x: this.x, y: this.y, z: this.z }, null);
  }

  private vanish(t: number, hooks: WatcherHooks, withSound: boolean): void {
    if (withSound) hooks.emit({ type: 'sfx', sound: 'vanish', x: this.x, y: this.y + 1.5, z: this.z }, null);
    this.setMode('disappear', t, WATCHER.disappearS);
  }

  private hide(t: number, hooks: WatcherHooks): void {
    this.mode = 'hidden';
    this.targetId = null;
    const found = Math.min(4, hooks.childrenFound());
    const gap = this.rage ? range(this.rand, [12, 25]) : range(this.rand, WATCHER.cooldownS) * (1 - WATCHER.escalationPerChild * found);
    this.nextAppear = t + gap * 1000;
  }

  private setMode(mode: WatcherMode, t: number, seconds: number): void {
    this.mode = mode;
    this.modeSince = t;
    this.modeUntil = t + seconds * 1000;
  }

  private inWindup(t: number): boolean {
    return t - this.modeSince < WATCHER.chaseWindupS * 1000;
  }

  /* ───────────────────────── senses ───────────────────────── */

  /** Is the player looking at it (and could see it)? */
  private isSeenBy(p: WatcherTarget): boolean {
    const eyeY = p.y + PLAYER.standHeight - PLAYER.eyeOffset;
    const dx = this.x - p.x;
    const dy = this.y + WATCHER.headHeight - eyeY;
    const dz = this.z - p.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > 40) return false;
    const cp = Math.cos(p.pitch);
    const dot = (dx * -Math.sin(p.yaw) * cp + dy * Math.sin(p.pitch) + dz * -Math.cos(p.yaw) * cp) / d;
    return dot > 0.93 && this.lineOfSight(p);
  }

  /** Noise and light give you away; crouching helps. */
  private notices(p: WatcherTarget, dist: number): boolean {
    let r = WATCHER.detectRange + (p.flashlight ? WATCHER.detectTorchBonus : 0) + (p.sprinting ? WATCHER.detectSprintBonus : 0);
    if (p.crouch > 0.5) r *= WATCHER.detectCrouchFactor;
    return dist < r && this.lineOfSight(p);
  }

  private lineOfSight(p: WatcherTarget): boolean {
    const ax = this.x;
    const ay = this.y + WATCHER.headHeight;
    const az = this.z;
    const bx = p.x;
    const by = p.y + 1.2;
    const bz = p.z;
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const steps = Math.floor(len / 0.35);
    for (let i = 1; i < steps; i++) {
      const k = i / steps;
      const y = ay + (by - ay) * k;
      if (this.world.overlaps(ax + (bx - ax) * k, az + (bz - az) * k, 0.05, y - 0.05, y + 0.05)) return false;
    }
    return true;
  }

  private inLight(x: number, z: number): boolean {
    return LIGHTS.some((l) => Math.hypot(l.x - x, l.z - z) < WATCHER.lightSafeRadius);
  }

  /* ───────────────────────── movement ───────────────────────── */

  private face(p: { x: number; z: number }): void {
    this.yaw = Math.atan2(-(p.x - this.x), -(p.z - this.z));
  }

  private moveTowards(gx: number, gz: number, speed: number, dt: number, t: number): void {
    const dx = gx - this.x;
    const dz = gz - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) {
      this.lastProgress = { x: this.x, z: this.z, t };
      return;
    }
    const step = Math.min(d, speed * dt);
    let nx = this.x + (dx / d) * step;
    let nz = this.z + (dz / d) * step;
    if (this.inLight(nx, nz)) return; // stops at the edge of the light
    const r = this.world.resolve(nx, nz, WATCHER.radius, this.y + PLAYER.stepHeight, this.y + WATCHER.height);
    nx = r.x;
    nz = r.z;
    const g = this.world.groundAt(nx, nz, this.y + PLAYER.stepHeight);
    if (g.height < this.y - 1.5) return; // won't drop off ledges
    this.x = nx;
    this.z = nz;
    this.y = g.height;
    if (Math.hypot(this.x - this.lastProgress.x, this.z - this.lastProgress.z) > 0.4) this.lastProgress = { x: this.x, z: this.z, t };
  }

  private stuck(t: number): boolean {
    return t - this.lastProgress.t > WATCHER.stuckS * 1000;
  }

  /** A free spot in front of (visible) or behind the player, in the same region. */
  private findSpot(p: WatcherTarget, where: 'front' | 'behind'): { x: number; y: number; z: number } | null {
    const ug = underground(p.x, p.z);
    for (let i = 0; i < 28; i++) {
      const spread = where === 'front' ? 0.9 : 1.1;
      const base = where === 'front' ? p.yaw : p.yaw + Math.PI;
      const ang = base + (this.rand() * 2 - 1) * spread;
      const dist = where === 'front' ? range(this.rand, WATCHER.observeDistance) : WATCHER.stalkDistance + 4 + this.rand() * 6;
      const x = p.x - Math.sin(ang) * dist;
      const z = p.z - Math.cos(ang) * dist;
      const b = this.world.bounds;
      if (x < b.minX + 1 || x > b.maxX - 1 || z < b.minZ + 1 || z > b.maxZ - 1) continue;
      if (underground(x, z) !== ug || this.inLight(x, z)) continue;
      const g = this.world.groundAt(x, z, p.y + 3);
      if (Math.abs(g.height - p.y) > 2.5) continue;
      if (this.world.overlaps(x, z, WATCHER.radius + 0.1, g.height + PLAYER.stepHeight, g.height + WATCHER.height)) continue;
      const prev = { x: this.x, y: this.y, z: this.z };
      this.x = x;
      this.y = g.height;
      this.z = z;
      const visible = this.lineOfSight(p);
      this.x = prev.x;
      this.y = prev.y;
      this.z = prev.z;
      // observing needs a clear view; stalking prefers not to be in view yet
      if (where === 'front' && !visible) continue;
      return { x, y: g.height, z };
    }
    return null;
  }
}
