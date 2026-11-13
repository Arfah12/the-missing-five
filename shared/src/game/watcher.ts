import type { AreaId } from './maps/kampung';

/**
 * THE WATCHER – tuning shared by the server AI and the client effects.
 *
 * It does not hunt constantly. Most of the time it is gone; then it
 * OBSERVES from a distance, or STALKS someone quietly; only when it
 * notices you does it CHASE – and after an encounter it DISAPPEARS again.
 * Every number lives here so the horror can be tuned without touching code.
 */

export type WatcherMode = 'hidden' | 'observe' | 'stalk' | 'chase' | 'disappear';

export interface NetWatcher {
  mode: WatcherMode;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Chase: true during the second before it starts running (its "scream"). */
  windup: boolean;
}

export const WATCHER = {
  /** Seconds before the first appearance. */
  firstDelayS: { solo: 95, coop: 70 },
  /** Gap between appearances (shrinks as more children are found). */
  cooldownS: [70, 140] as const,
  /** Each child found shortens the gap by this fraction (max 4 → −48%). */
  escalationPerChild: 0.12,

  observeS: [6, 11] as const,
  observeDistance: [14, 22] as const,
  stalkS: [14, 24] as const,
  stalkDistance: 10,
  stalkSpeed: 1.8,
  /** Catch-up speed while stalking when it fell far behind. */
  stalkCatchUp: 2.6,

  /** Slower than a sprint (4.8 m/s) – running away works while stamina lasts. */
  chaseSpeed: 4.1,
  chaseWindupS: 1.0,
  chaseMaxS: 12,
  /** Losing line of sight for this long ends the chase. */
  loseSightS: 3.5,
  /** Torchlight in its face slows it down. */
  torchSlow: 0.75,

  /** Noticing a player while stalking: range, more with torch on / running, less crouched. */
  detectRange: 9,
  detectTorchBonus: 5,
  detectSprintBonus: 6,
  detectCrouchFactor: 0.55,

  hitRange: 1.15,
  hitDamage: 40,

  /** Holding a torch on it while it observes / stalks makes it go away. */
  torchStareS: 1.6,
  torchStareRange: 24,

  /** It never comes into the working street lamp's light. */
  lightSafeRadius: 7,

  /** Stuck against a wall (players hiding indoors) for this long → it gives up. */
  stuckS: 1.6,
  disappearS: 1.2,

  radius: 0.35,
  height: 2.55,
  /** Eye/head height used for "is it being looked at". */
  headHeight: 2.3,
} as const;

/* ───────────────────────── random horror events ───────────────────────── */

export type HorrorKind = 'footsteps' | 'whisper' | 'childVoice' | 'knock' | 'doorSlam' | 'flicker' | 'silhouette' | 'illusion' | 'laugh';

export interface HorrorDef {
  kind: HorrorKind;
  weight: number;
  /** Only in these areas (all areas when omitted). */
  areas?: AreaId[];
  /** Short subtitle shown with the sound (Malay, in italics on screen). */
  lines?: string[];
}

/** Configurable table: add, remove or re-weight events here. */
export const HORROR_EVENTS: HorrorDef[] = [
  { kind: 'footsteps', weight: 5 },
  { kind: 'whisper', weight: 3, lines: ['…cari kami…', '…jangan tinggalkan…', '…sejuk kat sini…'] },
  { kind: 'childVoice', weight: 3, areas: ['school', 'forest', 'tunnel', 'central'], lines: ['Satu… dua… tiga… sorok!', 'Kak, tunggu…', 'Siapa yang jaga?'] },
  { kind: 'knock', weight: 3, areas: ['tunnel', 'forbidden', 'chief', 'school'] },
  { kind: 'doorSlam', weight: 2, areas: ['school', 'central', 'chief'] },
  { kind: 'flicker', weight: 4 },
  { kind: 'silhouette', weight: 3, areas: ['entrance', 'central', 'forest', 'school', 'chief'] },
  { kind: 'illusion', weight: 2, lines: ['Ada orang di belakang awak.', '…'] },
  { kind: 'laugh', weight: 2, areas: ['forest', 'tunnel', 'school'] },
];

export const HORROR = {
  /** Seconds between events for one team (random in range). */
  gapS: [24, 55] as const,
  firstDelayS: 35,
  /** No random events while The Watcher is out (it's scary enough). */
  pauseDuringWatcher: true,
} as const;

/** Weighted pick, optionally filtered by area. Deterministic given `rand`. */
export function pickHorror(area: AreaId, rand: () => number): HorrorDef {
  const pool = HORROR_EVENTS.filter((h) => !h.areas || h.areas.includes(area));
  const total = pool.reduce((s, h) => s + h.weight, 0);
  let r = rand() * total;
  for (const h of pool) {
    r -= h.weight;
    if (r <= 0) return h;
  }
  return pool[pool.length - 1];
}
