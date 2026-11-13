import { HORROR, areaAt, pickHorror, type GameEvent } from '@tmf/shared';
import type { WatcherTarget } from './Watcher';

/**
 * Random horror events: footsteps behind you, whispers, a door slamming,
 * the lights stuttering, a figure standing in the fog… The table and the
 * timings are in `shared/src/game/watcher.ts` (HORROR_EVENTS, HORROR).
 */

export interface HorrorHooks {
  emit(event: GameEvent, to: string | null): void;
  /** Close an open door near (x, z). Returns its position, or null if none. */
  slamDoorNear(x: number, z: number): { x: number; y: number; z: number } | null;
  /** True while The Watcher is out. */
  watcherActive(): boolean;
}

export class HorrorDirector {
  private nextAt: number;

  constructor(
    private readonly rand: () => number,
    start: number,
  ) {
    this.nextAt = start + HORROR.firstDelayS * 1000;
  }

  /** Force the next event now (tests). */
  triggerAt(t: number): void {
    this.nextAt = t;
  }

  update(t: number, players: WatcherTarget[], hooks: HorrorHooks): void {
    if (t < this.nextAt) return;
    const [a, b] = HORROR.gapS;
    this.nextAt = t + (a + this.rand() * (b - a)) * 1000;
    if (HORROR.pauseDuringWatcher && hooks.watcherActive()) return;
    const alive = players.filter((p) => p.connected && !p.downed);
    if (!alive.length) return;
    const p = alive[Math.floor(this.rand() * alive.length)];
    const def = pickHorror(areaAt(p.x, p.z).id, this.rand);
    const line = def.lines ? def.lines[Math.floor(this.rand() * def.lines.length)] : undefined;
    // forward is (−sin yaw, −cos yaw); "behind" is the opposite
    const behind = (min: number, max: number) => {
      const ang = p.yaw + Math.PI + (this.rand() * 2 - 1) * 0.8;
      const d = min + this.rand() * (max - min);
      return { x: p.x - Math.sin(ang) * d, y: p.y + 1.1, z: p.z - Math.cos(ang) * d };
    };
    const ahead = (min: number, max: number) => {
      const ang = p.yaw + (this.rand() * 2 - 1) * 0.5;
      const d = min + this.rand() * (max - min);
      return { x: p.x - Math.sin(ang) * d, y: p.y, z: p.z - Math.cos(ang) * d };
    };
    const nearby = (r: number) => alive.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < r);

    switch (def.kind) {
      case 'doorSlam': {
        const door = hooks.slamDoorNear(p.x, p.z);
        if (door) {
          hooks.emit({ type: 'sfx', sound: 'doorSlam', ...door }, null);
          return;
        }
        // no open door around: fall back to footsteps
        hooks.emit({ type: 'horror', kind: 'footsteps', ...behind(5, 9) }, p.id);
        return;
      }
      case 'flicker':
        for (const q of nearby(30)) hooks.emit({ type: 'horror', kind: 'flicker', x: p.x, y: p.y, z: p.z }, q.id);
        return;
      case 'silhouette':
        hooks.emit({ type: 'horror', kind: 'silhouette', ...ahead(18, 28) }, p.id);
        return;
      case 'knock':
      case 'laugh':
        for (const q of nearby(14)) hooks.emit({ type: 'horror', kind: def.kind, ...behind(6, 11), line }, q.id);
        return;
      default:
        hooks.emit({ type: 'horror', kind: def.kind, ...behind(3, 7), line }, p.id);
    }
  }
}
