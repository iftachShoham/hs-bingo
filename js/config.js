// ══════════════════════════════════════════════════════
//  CONFIG — fill in before deploying
// ══════════════════════════════════════════════════════
const CONFIG = {
  // Your Google Apps Script web app URL
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbw0ZAhadYwG1z6sYczshDN5AAG9s-NQtFbDOUFkmaOwT6qEn5Qxm6FAhUOt0zMbrb7V7A/exec",

  // The WEB_APP_SECRET value from line 7 of your Apps Script
  WEB_SECRET: "TestSecret1996boris",

  // Whoever types this on the login screen gets Game Master controls
  ADMIN_CODE: "softpapihasbigpipiwhennotsoft",

  // Free API key from https://api.imgbb.com — needed for image proof uploads
  IMGBB_KEY: "10ab068f4a22b9c256c83eeddfcbfd75",

  // URL of the proxy Cloudflare Worker (routes commands + forwards to Discord)
  PROXY_URL: "https://high-society-web-portal-proxy.borisvdh96.workers.dev",

};

// ── RAT tiles (must match the Apps Script constant) ──
const RAT_TILES = new Set([7,8,9,10,11,12,13,22,31,44,55,67,71,82,89,95]);

// ── Team visuals ──
const TEAM_BULLETS = { 1:"🟣", 2:"🔴", 3:"🔵", 4:"🟡" };
const TEAM_COLORS  = { 1:"#9b59b6", 2:"#e74c3c", 3:"#3498db", 4:"#f1c40f" };
function getTeamBullet(id) { return TEAM_BULLETS[Number(id)] || "⚪"; }

// ── App state ──
const state = {
  channelId:          null,   // the logged-in team's channel_id (or ADMIN_CODE)
  team:               null,   // { team_id, team_name, current_tile }
  isAdmin:            false,
  boardData:          null,
  pollTimer:          null,
  activeTab:          'board',
  playerName:         null,   // optional display name entered at login
  proofFile:          null,   // pending image File for proof upload
  tileImages:         null,   // Map<normalizedTaskName, imagePath> — loaded once on login
  prevTaskContent:    null,   // tracks last rendered task to detect ACB trigger
  playerPasswordHash: null,   // SHA-256 hex hash of the team password (null = no password)
  activityLog:        null,   // array of {timestamp,team_id,tile,discord_user} from activitylog endpoint
  activityPollTimer:  null,   // setInterval ID for 30s activity log refresh
};
