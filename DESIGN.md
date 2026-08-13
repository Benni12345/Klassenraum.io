# Classroom.io — Design

Multiplayer browser idle game. **Every player sits in one shared, global classroom.**
You idle-generate **Hirnschmalz (HS)** — brainpower — buy increasingly absurd school-themed
generators, and watch your desk (and everyone else's) visibly level up. Played best as a
quiet side game during class.

Locked decisions:

- **One global room** for all players (the classroom grows rows as people join)
- **Real stealing** between players (paper airplanes knock HS off other desks)
- **Pixel art**, code-authored sprites, crisp on weak Chromebooks
- Name: **Classroom.io**, English-first UI with DE toggle

## Core loop

- **Hirnschmalz (HS)** accrues per second from generators; clicking **„Mitschreiben"** (take notes)
  gives `(1 + 0.05 × HS/s) × clickMult` per click, so active play stays relevant.
- **Generators** (cost grows ×1.15 per owned unit):

  | # | ID | DE | base cost | base HS/s |
  |---|----|----|-----------|-----------|
  | 1 | pencil | Bleistiftstummel | 15 | 0.1 |
  | 2 | notes | Klebezettel | 100 | 1 |
  | 3 | calc | Taschenrechner | 1.100 | 8 |
  | 4 | group | Lerngruppe | 12.000 | 47 |
  | 5 | cheat | Spickzettel | 130.000 | 260 |
  | 6 | espresso | Espressomaschine | 1,4 M | 1.400 |
  | 7 | bot | Hausaufgaben-Bot | 20 M | 7.800 |
  | 8 | timeturner | Zeitumkehrer | 330 M | 44.000 |
  | 9 | brain | Galaxienhirn | 5,1 Mrd | 260.000 |

- **Upgrades**: per generator at 10/25/50/100 owned → that generator ×2
  (cost = baseCost × 30/300/3.000/30.000). Click upgrades at 100/1.000/10.000 total clicks → click ×2.
- **Prestige — „Versetzung"**: reset the run for **Goldsterne** ⭐.
  Stars gained = `floor((runHS / 1e6) ^ 0.6)`, each star +10 % production forever.
  Graduations advance your grade badge: 1. Klasse → … → 13. Klasse → Uni → Prof.
- **Offline**: your desk keeps producing for up to 8 h while you're away (base rate, no buffs).
- **School day**: daily attendance streak (claim once per UTC day; missed-by-one-day late slip via rewarded ad), three homework tasks, and desk skins unlocked by streak / stars / grade.

## The one global room

## The one global room

- Desk grid, 6 per row; rows appear as more players are online. Camera pans vertically.
- Seats are assigned to **online** players (lowest free desk). After disconnect you sleep
  („Zzz") at your desk for 5 min, then the desk frees up. Progress is always persistent.
- **Chalkboard** at the front shows: top 5 by HS/s, the class goal bar, and the active event.
- **Klassenziel** (class goal, co-op): all HS earned by anyone counts toward a shared target
  (level n target = 50.000 × 5ⁿ). On completion: everyone online gets ×3 for 5 min
  („Hausaufgabenfrei!") and the goal levels up. Progress persists in DB.

## Stealing — Papierflieger

- Click another desk → throw a paper airplane. **Steals real HS** from their unspent balance.
- Amount = `min(8 % of victim's HS on hand, attacker's HS/s × 600 + 250)` — scales with your
  own economy so whales can't farm newbies and newbies can't drain whales.
- 5 min cooldown per attacker. Sleeping (Zzz) players can't be targeted. Spent HS is safe —
  stealing is the economy's pressure to spend.
- During **Lehrer-Rundgang** (teacher patrol) throwing is risky: 50 % chance to get caught →
  **Nachsitzen** (detention): 90 s at ×0.25 production and no stealing.

## Events (server-driven, synchronized for the whole room)

Random event every 4–8 min:

- **Kurztest** (pop quiz, weight 3): 20 s arithmetic question; everyone who answers correctly
  gets ×2 for 2 min plus a flat HS reward.
- **Lehrer-Rundgang** (patrol, weight 2): teacher walks the rows for 45 s; stealing risky.
- **Vertretungsstunde** (substitute, weight 1): everyone online ×2 for 3 min.

## Tech

- **TypeScript** monorepo (npm workspaces): `shared` (protocol + balance), `server`, `client`.
- **Server**: Node ≥ 22.5, plain `ws` WebSockets (one global room — no room framework needed),
  `node:sqlite` persistence (zero native deps), fully **server-authoritative** economy:
  clients only send actions (batched clicks, buys, steals); the server computes all
  production lazily from timestamps (no per-player tick loops), clamps click rates
  (≤ 25/s counted), enforces steal cooldowns, and broadcasts room state at 2 Hz.
- **Client**: Vite + raw canvas 2D (no engine — a classroom with ~30 sprites doesn't need one),
  code-authored pixel sprites + 5×7 bitmap font (incl. ÄÖÜß), DOM for all idle-game UI.
  Zero runtime npm dependencies. Numbers are plain doubles (fine until ~1e308;
  swap in break_infinity.js if balance ever gets there).
- **School-friendly**: silent by default (music/SFX can be toggled in Settings),
  timestamp-based (background-tab safe), auto-reconnect with resync, anonymous
  localStorage token accounts, and a **boss key** (Tab) that swaps the page to a
  fake math-notes document incl. title/favicon.

## Save system

- **Server-authoritative**: game progress (economy, upgrades, stars, etc.) lives
  in SQLite on the game server and is flushed at most once every 30 seconds.
- **localStorage** only holds the anonymous guest token plus UI preferences
  (language, music/SFX, tutorial state), also written at most once every 30 s.
- On CrazyGames, the save is linked to the CrazyGames user via JWT (`userId`).
  Guest progress is copied into a brand-new account **once**; later logins
  resume the account save without re-importing guest data.

## Multiplayer

Classroom.io is a real multiplayer game: every player sits in the same global
classroom over WebSockets. There is **one public room** (no private lobbies) —
the desk grid grows new rows of 6 as more players join, so there is no hard
player cap. CrazyGames room data, invite link/button and the join-room listener
are wired so friends can drop into the shared classroom. Instant multiplayer
(`isInstantMultiplayer`) routes straight into that same public room.

## Not in this version (stretch)

Seasons ("Schuljahre"), unlockable maps (Bibliothek, Turnhalle), break_infinity numbers.
