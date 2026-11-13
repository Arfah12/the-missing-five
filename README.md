# THE MISSING FIVE

A 3D multiplayer co-op survival horror game for the browser (2–5 players, first person).
Kampung Hujan, Malaysia. Five children are missing. Something is watching.

> **Status: v1.0 – all eight phases complete.**
> - Phase 1: main menu, settings, real Socket.IO rooms (create / join by code /
>   live lobby / reconnect / host migration), animated Three.js menu scene.
> - Phase 2: **Explore Alone** – first-person walk through the Village Entrance
>   (car, fallen tree, welcome sign, village gate, bus stop, an enterable kedai
>   runcit, two stilt houses, road block), collisions, stairs, crouch, sprint with
>   stamina, flashlight with battery, rain, lightning, fog, footsteps.
> - Phase 3: lobby **Ready** + host **Start Game**; 2–5 players walk the village
>   together (figures with name tags, walk animation, their torches), the server
>   checks every movement report (speed, walls, flying) and corrects cheaters,
>   dropped players rejoin the running game where they were. "Explore Alone" now
>   runs through the same server as a private one-player room.
> - Phase 4: one connected map with all seven areas – Village Entrance, Central
>   Village (houses, Warung Mak Jah, Balai Raya, well), the Abandoned School
>   (3 enterable rooms: Bilik Guru, Kelas 2 Mawar, Kelas 3 Melati), the Village
>   Chief's House (enterable, two rooms) and storeroom, the Forbidden Forest
>   (footpaths, Pondok Pak Dollah, the giant fig tree, the old well), the
>   Underground Tunnel (reach it through the storeroom hatch or the old well)
>   and the Forbidden Area behind an iron gate (opened in Phase 5). Map screen
>   (**M**), area titles, darker fog in the forest, no sky light underground.
> - Phase 5: everything you can *do* – look at something and press **E**
>   (prompt `[E] Take …`): items, a 5-slot inventory (**Tab**, **G** drop,
>   use a battery to recharge the torch), readable diaries / documents /
>   photographs / cassettes, a mission journal (**J**: main + side objectives,
>   clues), doors and locks, puzzles (school fuse box, radio frequency, the
>   storeroom padlock code, prying planks with the crowbar, two levers in the
>   tunnel that must be pulled together), health, being **downed** and
>   **revived** by a teammate (hold E), and fear (heartbeat, vignette). All of
>   it is decided by the server and shared by everyone in the room.
> - Phase 6: **The Watcher** (server-side AI): *observe* from a distance →
>   *stalk* quietly → *chase* (after a scream) → *disappear*. It hits once and
>   retreats; it is slower than a sprint, gives up when you hide indoors or break
>   line of sight, avoids the working street lamp, and leaves if you hold your
>   torch on it while it watches. Random horror events (footsteps behind you,
>   whispers, a child humming, knocks, doors slamming shut, lights flickering, a
>   figure in the fog, illusions) with 3D-panned sound. Everyone down → **Game
>   Over** screen with stats, back to the lobby. Tuning lives in
>   `shared/src/game/watcher.ts` (`WATCHER`, `HORROR_EVENTS`, `HORROR`).
> - Phase 7: the story. Every game opens with the recording that brought you
>   here. What happened in 1998 is pieced together from diary pages, letters,
>   tapes, photographs and Haji Osman's confession in the hidden chamber. Two
>   shared decisions (recorded in the journal with who made them): at the
>   **Batu Penunggu** – free the children or let them sleep – and at **your
>   car** – leave now or stay. Four endings decided on the server:
>   **The Truth** (free them and reach the car before dawn), **The Last Night**
>   (free them but dawn – or the Penunggu – gets you first), **The Escape**
>   (let them sleep, or leave having found most of them) and **The Forgotten**
>   (leave early knowing little). Freeing them starts a 6-minute dawn countdown
>   and enrages The Watcher. Rules: `shared/src/game/endings.ts`.
> - Phase 8: polish – automatic resolution scaling when the frame rate drops,
>   a generative score that follows the mood (calm → tense → chase), an
>   end-to-end test that plays a full two-player game from the car to
>   **The Truth**, and the playing guide below.

---

## How to play (panduan ringkas)

**Matlamat:** cari barang lima budak yang hilang – Alya, Danish, Mira, Adam,
Sofia – dan fahami apa yang berlaku pada 13 Ogos 1998. Kemudian buat pilihan.

1. **Mula di kereta.** Jalan ke utara. Tekan **J** untuk jurnal (misi + petunjuk),
   **M** untuk peta. Kutip bateri – lampu suluh (**F**) tak kekal.
2. **Sekolah (kiri di simpang):** kunci Kelas 3, kotak fius (baca nota penjaga),
   pembesar suara sekolah memberi petunjuk radio.
3. **Rumah Ketua Kampung (kanan):** radio lama (cari frekuensi), surat yang tak
   dihantar, stor bermangga (kod = tarikh yang kampung tak boleh lupa).
4. **Balai Raya:** besi pengumpil (crowbar) untuk papan dan pintu kecil di lantai.
5. **Hutan Larangan (utara):** Pondok Pak Dollah, Pokok Ara, perigi lama.
6. **Terowong:** dua tuil mesti ditarik serentak (berdua; solo pun boleh, tapi
   kena laju) untuk membuka pintu besi ke Kawasan Larangan.
7. **Batu Penunggu:** bila kelima-lima barang dijumpai *dan* kamu tahu kebenaran,
   pilih: bebaskan mereka (lari ke kereta sebelum subuh!) atau biarkan mereka tidur.
8. **Kereta:** boleh dihidupkan selepas sekurang-kurangnya seorang budak dijumpai –
   tapi keluar awal bermakna ending yang lain.

**The Watcher:** jangan berlari ke arahnya. Kalau ia memerhati, suluh lampu tepat
ke mukanya. Kalau ia menjerit – lari, putuskan pandangan, masuk ke dalam bangunan.
Ia lebih perlahan daripada orang berlari, dan ia tak suka cahaya lampu jalan.
Kawan yang jatuh boleh dibangunkan (tahan **E**). Semua jatuh = Game Over.

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm` not recognised (Windows) | use `npm.cmd`, or reopen PowerShell after installing Node |
| `TAR_ENTRY_ERROR` during install | close other terminals/VS Code, delete `node_modules` and `package-lock.json`, reinstall; move the folder to a short path like `C:\dev\` |
| Menu works but Create/Join says not connected | the server isn't running – use `npm run dev` (both), or check the Render service is "Live" |
| "Game updated – refresh" | a friend uses an older build; everyone refreshes the page |
| Low FPS | Settings → Quality Low/Medium; the game also lowers its resolution automatically |
| No sound | click once in the page (browsers block audio until you interact) |

## Requirements

- **Node.js 20.12 or newer** (22 LTS recommended – see `.nvmrc`)
- npm 10+ (comes with Node)
- A desktop browser with WebGL 2 (Chrome, Edge, Firefox)

## Install

```bash
npm install
```

One install at the root sets up all three workspaces (`shared`, `server`, `client`).

> **Windows / PowerShell:** if `npm` is blocked by the execution policy, use `npm.cmd`
> (e.g. `npm.cmd install`, `npm.cmd run dev`).

## Run locally (development)

```bash
npm run dev
```

This starts both processes with prefixed output:

| Process | URL | Notes |
|---|---|---|
| `[server]` Express + Socket.IO | http://localhost:3001 | `GET /health` returns JSON status |
| `[client]` Vite dev server | http://localhost:5173 | proxies `/socket.io` and `/health` to the server |

Open **http://localhost:5173**. To test multiplayer on one PC, open a second
browser window (or a private window – each tab is its own player), create a room in
one and join with the code in the other.

Other players on your Wi-Fi can join via `http://<your-PC-LAN-IP>:5173`.

Run them separately if you prefer:

```bash
npm run dev:server
npm run dev:client
```

## Other commands

| Command | What it does |
|---|---|
| `npm test` | Server unit + socket-handler tests (Node test runner) |
| `npm run typecheck` | Type-checks server and client |
| `npm run build` | Builds `client/dist` and `server/dist` |
| `npm start` | Runs the built server (also serves `client/dist` when `NODE_ENV=production`) |

Production test locally:

```bash
npm run build
# PowerShell:  $env:NODE_ENV="production"; npm start
NODE_ENV=production npm start
```

Then open http://localhost:3001.

## Project structure

```
the-missing-five/
├─ package.json            npm workspaces + root scripts
├─ tsconfig.base.json      shared strict TS settings
├─ scripts/dev.mjs         runs server + client together (Windows-safe)
├─ shared/                 @tmf/shared – used by BOTH sides
│  └─ src/
│     ├─ constants.ts      versions, player limits, room-code format, timings
│     ├─ protocol.ts       typed Socket.IO events, error codes, snapshots
│     ├─ validation.ts     name / room-code sanitising
│     └─ game/             physics, collision, prop sizes, map layouts (no Three.js)
├─ server/                 @tmf/server – authoritative game server
│  ├─ src/
│  │  ├─ index.ts          HTTP + Socket.IO bootstrap, graceful shutdown
│  │  ├─ app.ts            Express app: /health, optional static client
│  │  ├─ config.ts         env → config
│  │  ├─ rooms/RoomManager.ts        rooms, players, sessions, host migration
│  │  ├─ net/registerSocketHandlers.ts  socket events, rate limit, version check
│  │  └─ util/             logger, token-bucket rate limiter
│  ├─ test/                node:test suites + in-memory Socket.IO fake
│  └─ build.mjs            esbuild bundle → dist/index.js
└─ client/                 @tmf/client – React + Vite + Three.js
   ├─ index.html
   └─ src/
      ├─ main.tsx, App.tsx screen routing, overlays, audio unlock
      ├─ net/connection.ts  Socket.IO client, requests with timeouts, auto-resume
      ├─ engine/            Three.js: menu scene, procedural props, buildings, painted signs/textures
      ├─ game/              Game loop, input, flashlight, weather, world/EntranceScene
      ├─ audio/             Web Audio: rain/wind/drone ambience, thunder, UI sounds
      ├─ lib/               tiny store, persisted settings
      ├─ ui/components/     Backdrop, menu/controls, connection status
      ├─ ui/screens/        MainMenu, Create/Join, Lobby, Settings, Exit, GameView
      ├─ ui/game/           in-game HUD
      └─ styles/            global + UI CSS (charcoal / cream / muted red)
```

## Architecture

### Multiplayer flow

1. Lobby: players press **Ready**, the host presses **Start Game** (`room:start`).
2. Every client asks for `game:sync` (its own spawn + everyone else).
3. Each client simulates its own movement with the shared physics and sends
   `player:state` ~15×/s. The server re-checks it (speed limit, inside walls,
   height) and answers `player:correct` if it's impossible.
4. The server broadcasts `game:players` snapshots ~15×/s; clients draw other
   players 120 ms in the past and interpolate, so movement looks smooth.
5. Disconnect → the player stays in the world (shown "offline") for 30 s; a
   reconnect (or page refresh) resumes into the same game and position.

- **Authoritative server.** The server owns every room. Clients only send
  *requests* (`room:create`, `room:join`, `room:resume`, `room:leave`); the server
  validates them, answers with an acknowledgement, and broadcasts the full
  `room:state` to everyone in the room. The client never invents room state.
- **Shared protocol.** Event names and payload types live in `shared/` and are
  imported by both sides, so a mismatch is a compile error. A `PROTOCOL_VERSION`
  handshake rejects outdated clients with a clear message.
- **Reconnects.** Each player receives a private session token (kept in
  `sessionStorage`). If the connection drops, the slot is held for 30 s and the
  client re-claims it automatically. If the host leaves, the earliest connected
  player becomes host.
- **Abuse limits.** Per-socket rate limiting, 64 KB message cap, name/code
  sanitising, max room count.
- **Rendering.** Plain Three.js (no React wrapper) so the game loop stays outside
  React. Menu scene: rainy kampung road at night, stilt houses, flickering street
  lamp, fog, lightning – everything is procedural (no downloaded assets yet). If
  WebGL 2 is unavailable the menu still works on a painted background.

## Room codes

Format `HJ-8291`. Players can type just the four digits, paste the full code, or
open an invite link (`…/?room=HJ-8291`) from the lobby's **Copy invite link**.

## Environment variables

`server/.env` (copy from `server/.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP / Socket.IO port |
| `CLIENT_ORIGIN` | dev: any · prod: same-origin only | Comma-separated allowed origins when client is hosted elsewhere |
| `SERVE_CLIENT` | `true` in production | Serve `client/dist` from the server |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

`client/.env` (copy from `client/.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `VITE_SERVER_URL` | *(empty = same origin)* | Game server URL when client and server are on different hosts |

## Deploying

Socket.IO needs a long-running Node server. **Vercel / Netlify cannot run the game
server** (serverless functions don't keep WebSocket connections), so use one of:

### Option A – one service (simplest): Render / Railway / Fly.io

- Build command: `npm install --include=dev && npm run build`
- Start command: `npm start`
- Env: `NODE_ENV=production`
- The server serves the game and the sockets on the same URL. Nothing else to set.

### Option B – client on Vercel, server on Render

1. Deploy the server as in Option A, with `SERVE_CLIENT=false` and
   `CLIENT_ORIGIN=https://your-game.vercel.app`.
2. On Vercel: root directory `client`, build `npm run build`, output `dist`,
   env `VITE_SERVER_URL=https://your-server.onrender.com`.
   (Install from the repo root so the `@tmf/shared` workspace resolves: set the
   install command to `cd .. && npm install`.)

Note: free Render instances sleep when idle – the first connection can take ~30 s.

## Controls

| Key | Action |
|---|---|
| W A S D / arrows | Move |
| Mouse | Look (click the game to capture the mouse) |
| Shift | Sprint (uses stamina) |
| **C** (or Ctrl) | Crouch – fits under stilt houses. Prefer C: browsers never let a page block Ctrl+W |
| F | Flashlight (battery drains while on) |
| E | Interact (pick up, open, read, use) · hold E on a downed teammate to revive |
| Tab | Inventory (1–5 select, E use, G drop) |
| J | Journal – objectives and clues (← → switch tab) |
| M | Map |
| Esc | Pause (releases the mouse) |

Add `?debug` to the URL (e.g. `http://localhost:5173/?debug`) to show FPS,
draw calls and your position in-game – handy for bug reports.

## How the 3D prototype is built

- **Shared physics (`shared/src/game/`)** – the map layout, collision boxes and
  first-person movement are plain TypeScript with no Three.js, so the server can
  run the exact same code in Phase 3 to check player movement.
  - `collision.ts` – heightfield ground + rotated boxes, step-up, crouch clearance
  - `movement.ts` – walk / sprint / crouch / stamina / gravity / stairs
  - `props.ts` – sizes and collision boxes of every prop type
  - `maps/villageEntrance.ts` – the entrance area layout
  - `maps/kampung.ts` – the whole map: roads, areas, every building, forest
    trees (seeded), tunnel, portals, terrain
- **Client (`client/src/game/`)** – `Game.ts` (renderer + loop), `Input.ts`
  (keyboard, pointer lock), `Flashlight.ts`, `Weather.ts`,
  `world/WorldScene.ts` (meshes + lights built from the shared layout),
  `world/staticBatch.ts` (merges thousands of static boxes into a few meshes so
  the GPU isn't flooded with draw calls).
- Meshes are procedural (code-built) with canvas-painted textures – no
  downloaded assets yet.

### Optional real textures

Drop seamless photo textures into `client/public/assets/textures/` and list them
in `manifest.json` there (see the README in that folder). They replace the
procedural mud, road, planks, zinc, plaster and concrete automatically.

## Known limitations

- Visuals are procedural. The target dark-realistic look improves a lot with
  real textures / GLB models (see "Optional real textures").
- Browsers only allow `window.close()` on windows opened by script, so **Exit**
  shows a "you can close this tab" message when closing is blocked.
- Sound starts after the first click/keypress (browser autoplay rule).
- Movement is client-predicted and server-validated (impossible moves are
  snapped back); everything else – items, doors, puzzles, health, The Watcher,
  decisions and endings – is decided only by the server.
- Rooms live in the server's memory: restarting / redeploying the server ends
  running games (there is no database, by design – nothing needs to persist).
- Free hosting (Render) sleeps after ~15 idle minutes; the first visit then
  takes 30–60 s to wake it.
