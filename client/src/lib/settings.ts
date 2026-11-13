import { sanitizeName } from '@tmf/shared';
import { createStore, safeStorage } from './store';

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  playerName: string;
  masterVolume: number; // 0..1
  ambienceVolume: number; // 0..1
  sfxVolume: number; // 0..1
  mouseSensitivity: number; // 0.2..3
  invertY: boolean;
  fov: number; // 60..100
  brightness: number; // 0.6..1.6 (tone-mapping exposure)
  quality: Quality;
}

const KEY = 'tmf:settings:v1';

export const SETTINGS_LIMITS = {
  mouseSensitivity: [0.2, 3],
  fov: [60, 100],
  brightness: [0.6, 1.6],
} as const;

function defaultQuality(): Quality {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4;
  return cores >= 8 ? 'high' : 'medium';
}

export function defaultSettings(): Settings {
  return {
    playerName: '',
    masterVolume: 0.8,
    ambienceVolume: 0.7,
    sfxVolume: 0.8,
    mouseSensitivity: 1,
    invertY: false,
    fov: 75,
    brightness: 1,
    quality: defaultQuality(),
  };
}

const clamp = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

/** Validates anything loaded from storage. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  return {
    playerName: typeof r.playerName === 'string' ? (sanitizeName(r.playerName) ?? '') : '',
    masterVolume: clamp(r.masterVolume, 0, 1, d.masterVolume),
    ambienceVolume: clamp(r.ambienceVolume, 0, 1, d.ambienceVolume),
    sfxVolume: clamp(r.sfxVolume, 0, 1, d.sfxVolume),
    mouseSensitivity: clamp(r.mouseSensitivity, ...SETTINGS_LIMITS.mouseSensitivity, d.mouseSensitivity),
    invertY: r.invertY === true,
    fov: Math.round(clamp(r.fov, ...SETTINGS_LIMITS.fov, d.fov)),
    brightness: clamp(r.brightness, ...SETTINGS_LIMITS.brightness, d.brightness),
    quality: r.quality === 'low' || r.quality === 'medium' || r.quality === 'high' ? r.quality : d.quality,
  };
}

function load(): Settings {
  const raw = safeStorage.get(KEY);
  if (!raw) return defaultSettings();
  try {
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return defaultSettings();
  }
}

export const settingsStore = createStore<Settings>(load());

settingsStore.subscribe(() => safeStorage.set(KEY, JSON.stringify(settingsStore.get())));

export function updateSettings(patch: Partial<Settings>): void {
  settingsStore.set(sanitizeSettings({ ...settingsStore.get(), ...patch }));
}

export function resetSettings(): void {
  const name = settingsStore.get().playerName;
  settingsStore.set({ ...defaultSettings(), playerName: name });
}
