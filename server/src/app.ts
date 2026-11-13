import express, { type Express } from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GAME_VERSION, PROTOCOL_VERSION } from '@tmf/shared';
import type { ServerConfig } from './config';
import type { RoomManager } from './rooms/RoomManager';
import type { Logger } from './util/logger';

// Same relative depth from src/app.ts (dev) and dist/index.js (production).
export const CLIENT_DIST = fileURLToPath(new URL('../../client/dist', import.meta.url));

export function createApp(deps: { config: ServerConfig; rooms: RoomManager; log: Logger; startedAt?: number }): Express {
  const { config, rooms, log } = deps;
  const startedAt = deps.startedAt ?? Date.now();
  const app = express();
  app.disable('x-powered-by');

  // Health check for hosting platforms and the client's status badge.
  app.get('/health', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      status: 'ok',
      game: 'the-missing-five',
      version: GAME_VERSION,
      protocol: PROTOCOL_VERSION,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      ...rooms.stats(),
    });
  });

  // Optional: serve the built client from the same origin (single-service deploy).
  if (config.serveClient) {
    if (existsSync(CLIENT_DIST)) {
      app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
      app.use((req, res, next) => {
        if (req.method !== 'GET' || req.path.startsWith('/socket.io') || !req.accepts('html')) {
          next();
          return;
        }
        res.set('Cache-Control', 'no-cache');
        res.sendFile('index.html', { root: CLIENT_DIST });
      });
      log.info('serving client build', { dir: CLIENT_DIST });
    } else {
      log.warn('SERVE_CLIENT is on but client/dist does not exist – run `npm run build` first');
    }
  } else {
    app.get('/', (_req, res) => {
      res.type('text').send('THE MISSING FIVE game server is running. Open the client (Vite dev server) to play.');
    });
  }

  return app;
}
