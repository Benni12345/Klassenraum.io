# CrazyGames marketing assets

Upload these files in the CrazyGames Developer Portal metadata form.

## Cover images

| File | Size | Use |
|------|------|-----|
| `cover-landscape-1920x1080.png` | 1920×1080 | Landscape cover (16:9) |
| `cover-portrait-800x1200.png` | 800×1200 | Portrait cover (2:3) |
| `cover-square-800x800.png` | 800×800 | Square cover (1:1) |

## Preview videos

| File | Resolution | Use |
|------|------------|-----|
| `preview-landscape.mp4` | 1920×1080 | Landscape hover video |
| `preview-portrait.mp4` | 1080×1620 | Portrait hover video |

## Regenerate

Requires a running game server (`npm start`) and Playwright Chromium:

```bash
npm install
npx playwright install chromium
npm start          # terminal 1
node scripts/bots.mjs   # optional, for livelier multiplayer shots
npm run marketing  # terminal 2
```

Outputs land in this folder.
