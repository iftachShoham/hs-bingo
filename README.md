# High Society - Snakes & Rats

A live multiplayer board-game web portal for the **High Society** OSRS clan's *Snakes & Rats* competition. Teams roll dice, land on task tiles, submit proof, and race to tile 100 — all through a PWA-ready web app backed by Google Apps Script, Cloudflare Workers, and Discord.

## Contributers:
1. SoftPapi
2. Toxic
---

## Table of Contents

- [What It Is](#what-it-is)
- [How the Game Works](#how-the-game-works)
- [Architecture](#architecture)
- [Repository Layout](#repository-layout)
- [Self-Hosting Setup](#self-hosting-setup)
  - [1. Google Apps Script (backend)](#1-google-apps-script-backend)
  - [2. Cloudflare Worker (proxy)](#2-cloudflare-worker-proxy)
  - [3. GitHub Secrets](#3-github-secrets)
  - [4. Deploy](#4-deploy)
- [Installing as a Phone App (PWA)](#installing-as-a-phone-app-pwa)
- [Regenerating App Icons](#regenerating-app-icons)
- [Game Master Controls](#game-master-controls)
- [Feature Roadmap](#feature-roadmap)

---



## What It Is

A single-page web app that lets up to 4 teams:

- **Roll a dice** to move along a 100-tile boustrophedon board
- **Complete tasks** on each tile and submit photo proof
- **Land on snakes** and slide back, or **trigger rat traps** that send a random other team backwards
- **Watch live** as a spinning wheel reveals the rat's victim, and animated GIFs celebrate (or mourn) every big event

The app polls the game state every 6 seconds so every player's board stays in sync without a page refresh.

---

## How the Game Works

| Mechanic | Detail |
|---|---|
| **Board** | 100 tiles arranged in a boustrophedon (snake-path) grid. Tile 1 is bottom-left, tile 100 is top. |
| **Snakes** | Several tiles are snake *heads*. Landing on one slides the team back to the snake's tail. |
| **Rats** | 16 tiles are rat traps. Landing on an unsprung trap spins a wheel — a random other team (or yourself) gets sent back by a dice roll. |
| **Tasks** | Every tile has an assigned OSRS task. Teams must complete it and submit screenshot proof before rolling again. Some tiles require multiple submissions. |
| **Winning** | First team to reach tile 100 wins. |

---

## Architecture

```
Browser (PWA)
    │  polls every 6 s
    ▼
Cloudflare Worker  ←── proxy-worker.js
    │  forwards commands + Discord messages
    ▼
Google Apps Script  ←── AppsScriptSnakesAndRats.txt
    │  owns the game state (Google Sheets)
    │
    └──► Discord Bot  (posts to team channels)
```

- **Frontend** — pure HTML/CSS/JS, no build step. Served via GitHub Pages.
- **Proxy Worker** — a Cloudflare Worker that adds CORS headers, validates the shared secret, forwards board reads and game commands to Apps Script, and posts Discord notifications.
- **Backend** — a Google Apps Script web app that reads/writes game state from a Google Sheet and handles `roll`, `complete`, and admin commands.
- **Discord** — the Worker posts to each team's channel via bot token whenever a web action succeeds.

---

## Repository Layout

```
hs-bingo/
├── index.html                 # Single-page app shell
├── style.css                  # OSRS-styled design system
├── manifest.json              # PWA manifest (name, icons, theme)
├── proxy-worker.js            # Cloudflare Worker source
│
├── js/
│   ├── config.js              # CONFIG object + RAT_TILES + TEAM_COLORS (secrets injected at deploy)
│   ├── api.js                 # apiFetchBoardState(), apiCommand(), playSound()
│   ├── auth.js                # login(), logout(), enterGame()
│   ├── board.js               # refreshBoard(), renderBoard(), renderTeamsList(), detectMovements()
│   ├── actions.js             # doRoll(), doComplete(), spinWheelForRat(), proof upload
│   ├── snakes.js              # SVG snake drawing over the board grid
│   ├── ui.js                  # Tab switching, modals, feed, helper utilities
│   ├── admin.js               # Game Master panel (move team, reset tile, etc.)
│   └── main.js                # DOMContentLoaded bootstrap + event listeners
│
├── assets/
│   ├── gifs/
│   │   ├── snake-dance.gif    # Full-board overlay on snake events
│   │   └── rat-dance.gif      # Full-board overlay on rat events
│   └── audio/
│       ├── task_completed.mp3             # Plays on successful task completion
│       └── old-armadyl-eye-spec-*.mp3    # Plays when landing on the ACB tile
│
├── icons/                     # PWA icons (192 × 192 and 512 × 512 PNG)
├── images/                    # Source logo and tile images
│
├── .github/workflows/
│   └── deploy.yml             # CI: injects secrets into config.js → deploys to GitHub Pages
│
├── AppsScriptSnakesAndRats.txt  # Google Apps Script source (paste into script.google.com)
├── CloudflareSnakesAndRats.txt  # Legacy reference — use proxy-worker.js instead
│
└── package.json               # Dev dependency: sharp (for icon generation only)
```

---

## Self-Hosting Setup

### 1. Google Apps Script (backend)

1. Open [script.google.com](https://script.google.com) and create a new project.
2. Paste the contents of `AppsScriptSnakesAndRats.txt` into the editor.
3. Edit the constants at the top:
   - `WEB_APP_SECRET` — any strong random string (share it with the Worker)
   - Set up the Google Sheet ID and team channel IDs
4. Click **Deploy → New deployment → Web app**, execute as *Me*, access set to *Anyone*.
5. Copy the deployment URL — this becomes `APPS_SCRIPT_URL`.

### 2. Cloudflare Worker (proxy)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → Workers → Create a Service.
2. Paste the contents of `proxy-worker.js` into the editor.
3. Add these **Environment Variables** in the Worker settings:

   | Variable | Value |
   |---|---|
   | `GOOGLE_SCRIPT_URL` | Your Apps Script deployment URL |
   | `WEB_APP_SECRET` | Same secret set in the Apps Script |
   | `DISCORD_BOT_TOKEN` | Bot token from the Discord Developer Portal |

4. Deploy and copy the Worker URL — this becomes `PROXY_URL`.

### 3. GitHub Secrets

In your GitHub repo → **Settings → Secrets and variables → Actions**, add:

| Secret | Description |
|---|---|
| `APPS_SCRIPT_URL` | Google Apps Script web app URL |
| `WEB_SECRET` | Shared secret (same as `WEB_APP_SECRET` in the Worker) |
| `ADMIN_CODE` | The passphrase that grants Game Master access on the login screen |
| `IMGBB_KEY` | Free API key from [api.imgbb.com](https://api.imgbb.com) — used for proof image hosting |
| `PROXY_URL` | Your Cloudflare Worker URL |

The deploy workflow (`deploy.yml`) injects these into `js/config.js` using `sed` before publishing, so secrets never appear in the repo history.

### 4. Deploy

Push to `main`. The GitHub Actions workflow:
1. Replaces `%%PLACEHOLDER%%` tokens in `js/config.js` with the real secrets.
2. Deploys the entire repo to GitHub Pages via `peaceiris/actions-gh-pages`.

The live site is at `https://<your-org>.github.io/hs-bingo/`.

---

## Installing as a Phone App (PWA)

The site ships a `manifest.json` and `apple-touch-icon`, so it can be pinned to a home screen as a full-screen app.

**Android (Chrome)**
1. Open the site in Chrome.
2. Tap the 3-dot menu → **Add to Home Screen** (Chrome may also prompt automatically).
3. Tap **Add**.

**iPhone (Safari)**
1. Open the site in **Safari** (Chrome on iOS does not support PWA install).
2. Tap the Share button (box with an arrow, bottom of the screen).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add**.

---

## Regenerating App Icons

If you replace the source logo at `images/HS logo big.webp`, regenerate the PNG icons:

```bash
npm install
node -e "
const sharp = require('sharp');
const src = 'images/HS logo big.webp';
Promise.all([
  sharp(src).resize(192, 192).png().toFile('icons/icon-192.png'),
  sharp(src).resize(512, 512).png().toFile('icons/icon-512.png'),
]).then(() => console.log('Icons created'));
"
```

This produces `icons/icon-192.png` and `icons/icon-512.png`, referenced by `manifest.json` and the `apple-touch-icon` tag in `index.html`.

---

## Game Master Controls

Log in with the `ADMIN_CODE` to unlock the **Game Master** panel:

- Move any team to a specific tile
- Reset a tile's completion state
- View all teams' positions and tasks simultaneously
- All admin actions are posted to the affected team's Discord channel

The Game Master view hides the Roll and Complete buttons — it is read/write for administration only.

---

## Feature Roadmap

Planned enhancements are documented in [`FEATURES.md`](FEATURES.md), ordered by player impact. Highlights:

| # | Feature | Status |
|---|---|---|
| 1 | 🎲 Animated dice roll face sequence | Planned |
| 2 | 🐀 "You've Been Ratted!" full-screen alert + red flash | Planned |
| 3 | 🏁 Race track position bar (always visible, all tabs) | Planned |
| 4 | 🔊 Web Audio synthesized sound effects | Planned |
| 5 | 🎯 Next-roll tile preview (hover Roll button) | Planned |
| 6 | 🎉 Winner confetti burst | Planned |
| 9 | ☠️ Threat map toggle (snake heads + unsprung rats) | Planned |
| 12 | 📳 Board earthquake shake on snake/rat events | Planned |

All planned features are frontend-only and require no new backend endpoints.
