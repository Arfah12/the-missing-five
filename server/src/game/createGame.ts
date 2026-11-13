import { KAMPUNG_SPAWNS, buildGameWorld } from '@tmf/shared';
import { GameSession } from './GameSession';

/**
 * Every game gets its own collision world, because doors and gates change
 * it (an opened gate in one game must not open in another).
 */
export function createGame(mode: 'solo' | 'coop'): GameSession {
  return new GameSession({ world: buildGameWorld(), spawns: KAMPUNG_SPAWNS, mode });
}
