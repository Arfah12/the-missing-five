import { NAME_MAX_LENGTH, NAME_MIN_LENGTH, ROOM_CODE_DIGITS, ROOM_CODE_PREFIX } from './constants';

// Letters (any script, so Malay/Arabic/Chinese names work), numbers, space, "-" and "_".
const NAME_PATTERN = /^[\p{L}\p{N} _-]+$/u;

/** Returns a cleaned player name, or null if it is not acceptable. */
export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  const length = [...name].length;
  if (length < NAME_MIN_LENGTH || length > NAME_MAX_LENGTH) return null;
  if (!NAME_PATTERN.test(name)) return null;
  return name;
}

/** Case-insensitive key used to keep names unique inside a room. */
export function nameKey(name: string): string {
  return name.toLocaleLowerCase('en');
}

/**
 * Accepts "HJ-8291", "hj8291", "hj 8291" or just "8291"
 * and returns the canonical "HJ-8291", or null.
 */
export function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const compact = raw.toUpperCase().replace(/[\s-]/g, '');
  const digits = compact.startsWith(ROOM_CODE_PREFIX) ? compact.slice(ROOM_CODE_PREFIX.length) : compact;
  if (!new RegExp(`^\\d{${ROOM_CODE_DIGITS}}$`).test(digits)) return null;
  return `${ROOM_CODE_PREFIX}-${digits}`;
}

export function isRoomCode(value: unknown): value is string {
  return typeof value === 'string' && normalizeRoomCode(value) === value;
}
