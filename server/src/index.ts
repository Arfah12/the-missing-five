import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { GAME_VERSION } from '@tmf/shared';
import { createApp } from './app';
import { loadConfig } from './config';
import { registerSocketHandlers, type GameServer } from './net/registerSocketHandlers';
import { createGame } from './game/createGame';
import { RoomManager } from './rooms/RoomManager';
import { createLogger } from './util/logger';

// Load server/.env if it exists (Node ≥ 20.12, no dotenv dependency).
try {
  process.loadEnvFile('.env');
} catch {
  /* no .env file – fine */
}

const config = loadConfig();
const log = createLogger(config.logLevel);
const rooms = new RoomManager({ graceMs: config.reconnectGraceMs, gameFactory: createGame });
const app = createApp({ config, rooms, log });
const httpServer = createServer(app);

const io: GameServer = new Server(httpServer, {
  cors: { origin: config.clientOrigins, credentials: false },
  pingInterval: 10_000,
  pingTimeout: 8_000,
  maxHttpBufferSize: 64 * 1024,
});

const handlers = registerSocketHandlers(io, rooms, { log });

httpServer.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    log.error(`Port ${config.port} is already in use. Stop the other server or set PORT in server/.env.`);
  } else {
    log.error('HTTP server error', { error: e.message });
  }
  process.exit(1);
});

httpServer.listen(config.port, config.host, () => {
  log.info(`THE MISSING FIVE server v${GAME_VERSION} listening on http://localhost:${config.port}`, {
    env: config.env,
    origins: config.clientOrigins === true ? 'any (dev)' : config.clientOrigins,
    serveClient: config.serveClient,
  });
});

let closing = false;
function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  log.info(`${signal} received, shutting down`);
  handlers.stop();
  io.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
