/** Bump PROTOCOL_VERSION whenever client↔server messages change shape. */
export const PROTOCOL_VERSION = 5;
export const GAME_VERSION = '1.0.1';
export const GAME_TITLE = 'THE MISSING FIVE';
export const GAME_TAGLINE = 'Five children disappeared. Something never left.';

export const MAX_PLAYERS = 5;
export const MIN_PLAYERS = 2;

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 16;

/** Room codes look like "HJ-8291" (HJ = Kampung Hujan). */
export const ROOM_CODE_PREFIX = 'HJ';
export const ROOM_CODE_DIGITS = 4;

/** How long a disconnected player keeps their slot so they can reconnect. */
export const RECONNECT_GRACE_MS = 30_000;

/** Max time the client waits for the server to answer a request. */
export const REQUEST_TIMEOUT_MS = 6_000;

export const DEFAULT_SERVER_PORT = 3001;

/** Server → clients position snapshots per second. */
export const NET_TICK_HZ = 15;
/** Client → server movement updates per second. */
export const CLIENT_SEND_HZ = 15;
/** Remote players are drawn this far in the past so they move smoothly. */
export const INTERP_DELAY_MS = 120;
