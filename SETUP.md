# Website Setup Guide

## Step 1 — Add team codes to Google Sheets

Open your **Teams** sheet. Add a column **I** (column 9) named `team_code`.

Fill in a short unique code for each team, e.g.:

| team_id | team_name | channel_id | … | team_code |
|---------|-----------|------------|---|-----------|
| 1 | Team Purple | 123… | … | PURPLE-1234 |
| 2 | Team Red    | 456… | … | RED-5678    |
| 3 | Team Blue   | 789… | … | BLUE-9012   |
| 4 | Team Yellow | 012… | … | YELLOW-3456 |

Share each team's code only with that team. These are their login passwords.

---

## Step 2 — Deploy the updated backend scripts

### Google Apps Script
Replace the code in your Apps Script project with the updated `AppsScriptSnakesAndRats.txt`.
Re-deploy as a web app (new deployment, same settings).

### Cloudflare Worker
Replace the code in your Worker with the updated `CloudflareSnakesAndRats.txt`.
Save and deploy.

---

## Step 3 — Configure `app.js`

Open `web/app.js` and fill in the three values at the top:

```js
const CONFIG = {
  CLOUDFLARE_URL: "https://your-worker.your-subdomain.workers.dev",
  WEB_SECRET:     "your_web_app_secret",   // same as WEB_APP_SECRET in Apps Script
  ADMIN_CODE:     "pick-a-secret-phrase"   // share only with game masters
};
```

- `CLOUDFLARE_URL` — your Cloudflare Worker URL (no trailing slash)
- `WEB_SECRET` — the same secret as `WEB_APP_SECRET` in Apps Script / Cloudflare env
- `ADMIN_CODE` — any string you choose; whoever logs in with this gets the Game Master panel

---

## Step 4 — Deploy to GitHub Pages

Push the `web/` folder contents to your GitHub Pages repo root (or the `web/` subfolder,
depending on how you configure Pages). The three files needed are:

```
index.html
style.css
app.js
```

Set GitHub Pages source to the branch/folder containing these files.

---

## How it works

| Who | Login code | What they see |
|-----|------------|---------------|
| Each team | Their `team_code` from the sheet | Roll, Complete, Current buttons for their own team |
| Game master | `ADMIN_CODE` from `app.js` | Full admin panel: Punish, Move, Reset for any team |

**Both Discord and the website work at the same time.** They share the same Google Sheets
state, so a roll on Discord shows up on the website within 6 seconds (poll interval), and vice versa.

---

## Proof for `/complete`

Players paste a public image URL in the proof field (e.g. an Imgur link, a Discord CDN link,
or any direct image URL). The URL is stored in the activity log exactly like the Discord version.
