# Klassenraum.io

Ein Multiplayer-Idle-Game im Browser: **alle Spieler sitzen im selben Klassenraum.**
Sammle Hirnschmalz, kauf dir vom Bleistiftstummel bis zum Galaxienhirn hoch, klau deinen
Mitschülern per Papierflieger die Punkte — und drück Esc, wenn der Lehrer kommt.

A multiplayer browser idle game where everyone shares **one global classroom**. Pixel art,
German-first UI (English toggle in settings), built to run quietly on a school Chromebook.

![Klassenraum.io](docs/screenshot.png)

## Features

- Idle economy with 9 school-themed generators, upgrades and prestige („Versetzung" for Goldsterne)
- One shared room: live desks for every online player, chalkboard leaderboard, class goal
- Real stealing: throw paper airplanes at other desks (5 min cooldown, capped, risky during patrol)
- Synchronized room events: Kurztest (pop quiz), Lehrer-Rundgang (patrol), Vertretungsstunde
- Chat (passed notes), emotes, offline progress up to 8 h
- Boss key: **Esc** swaps to a fake math-notes page (title + favicon included)
- Server-authoritative: all production, clicks, buys and steals are validated server-side

## Development

Requires Node >= 22.5 (uses built-in `node:sqlite`).

```bash
npm install
npm run dev:server   # game server on :8080 (ws + API)
npm run dev:client   # vite dev server on :5173, proxies /ws to :8080
```

Open http://localhost:5173 — multiple tabs/browsers join the same room
(each browser profile is one player; a second tab replaces the first connection).

## Production

```bash
npm run build        # builds client + bundles server to a single file
npm start            # serves client + WebSocket on PORT (default 8080)
```

Environment: `PORT` (default `8080`), `DB_PATH` (default `./data/klassenraum.db`).
One process serves everything — put it behind any HTTPS proxy and the client
connects via `wss://` on the same origin automatically.

## Tests

```bash
npm test             # balance math + game logic unit tests (vitest)
npm run typecheck
node scripts/bots.mjs # optional: simulated players against a running server
```

## Repo layout

- `packages/shared` — protocol types + balance tables/math (used by both sides)
- `packages/server` — Node WebSocket game server, SQLite persistence
- `packages/client` — Vite + canvas-2D pixel client, DOM UI, no runtime deps

See [DESIGN.md](DESIGN.md) for game design and architecture details.
