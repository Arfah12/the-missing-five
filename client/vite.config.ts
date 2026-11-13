import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Where the game server runs during development.
  const devServer = env.DEV_SERVER_URL || 'http://localhost:3001';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@tmf/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      host: true, // also listen on the LAN so friends on the same Wi-Fi can join
      strictPort: false,
      // The client talks to the game server through the dev server, so in
      // development everything is same-origin (no CORS, works over LAN too).
      proxy: {
        '/socket.io': { target: devServer, ws: true, changeOrigin: true },
        '/health': { target: devServer, changeOrigin: true },
      },
    },
    preview: {
      port: 4173,
      proxy: {
        '/socket.io': { target: devServer, ws: true, changeOrigin: true },
        '/health': { target: devServer, changeOrigin: true },
      },
    },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            three: ['three'],
            net: ['socket.io-client'],
          },
        },
      },
    },
  };
});
