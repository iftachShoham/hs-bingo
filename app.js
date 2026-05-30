// ══════════════════════════════════════════════════════
//  CONFIG — fill in before deploying
// ══════════════════════════════════════════════════════
const CONFIG = {
  // Your Google Apps Script web app URL
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbw0ZAhadYwG1z6sYczshDN5AAG9s-NQtFbDOUFkmaOwT6qEn5Qxm6FAhUOt0zMbrb7V7A/exec",

  // The WEB_APP_SECRET value from line 7 of your Apps Script
  WEB_SECRET: "placeholder",

  // Whoever types this on the login screen gets Game Master controls
  ADMIN_CODE: "gamemaster"
};

// ── RAT tiles (must match the Apps Script constant) ──
const RAT_TILES = new Set([7,8,9,10,11,12,13,22,31,44,55,67,71,82,89,95]);

// ── Team visuals ──
const TEAM_BULLETS = { 1:"🟣", 2:"🔴", 3:"🔵", 4:"🟡" };
const TEAM_COLORS  = { 1:"#9b59b6", 2:"#e74c3c", 3:"#3498db", 4:"#f1c40f" };
function getTeamBullet(id) { return TEAM_BULLETS[Number(id)] || "⚪"; }

// ── App state ──
const state = {
  channelId:  null,   // the logged-in team's channel_id (or ADMIN_CODE)
  team:       null,   // { team_id, team_name, current_tile }
  isAdmin:    false,
  boardData:  null,
  pollTimer:  null
};

// ══════════════════════════════════════════════════════
//  API — calls Apps Script directly
//  Content-Type: text/plain avoids CORS preflight (simple request)
// ══════════════════════════════════════════════════════

// All team/admin commands
async function apiCommand(command, extra = {}) {
  const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method:   "POST",
    headers:  { "Content-Type": "text/plain;charset=utf-8" },
    body:     JSON.stringify({
      secret:     CONFIG.WEB_SECRET,
      channel_id: state.channelId,
      command,
      ...extra   // channel_id can be overridden here for admin commands
    }),
    redirect: "follow"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Board state — public GET endpoint on Apps Script, no auth needed
async function apiFetchBoardState() {
  const res = await fetch(
    `${CONFIG.APPS_SCRIPT_URL}?view=boarddata&cb=${Date.now()}`,
    { redirect: "follow" }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ══════════════════════════════════════════════════════
//  LOGIN / LOGOUT
// ══════════════════════════════════════════════════════

async function login() {
  const input = document.getElementById("team-code-input");
  const code  = input.value.trim();
  if (!code) { showLoginError("Paste your channel ID."); return; }

  const btn = document.getElementById("login-btn");
  btn.textContent = "Connecting…";
  btn.disabled = true;
  document.getElementById("login-error").classList.add("hidden");

  try {
    // Admin shortcut — no server lookup needed
    if (code === CONFIG.ADMIN_CODE) {
      state.channelId = code;
      state.isAdmin   = true;
      state.team      = null;
      localStorage.setItem("hs_cid", code);
      enterGame();
      return;
    }

    // Validate by fetching board state and matching channel_id
    const boardData = await apiFetchBoardState();
    if (!boardData || !boardData.teams) throw new Error("Could not load board data.");

    const match = boardData.teams.find(t => String(t.channel_id).trim() === String(code).trim());
    if (!match) {
      showLoginError("Channel ID not recognised — check and try again.");
      return;
    }

    state.channelId = code;
    state.isAdmin   = false;
    state.team      = { team_id: match.team_id, team_name: match.team_name, current_tile: match.current_tile };
    state.boardData = boardData;
    localStorage.setItem("hs_cid", code);
    enterGame();

  } catch (err) {
    showLoginError("Error: " + err.message);
  } finally {
    btn.textContent = "Enter Game";
    btn.disabled = false;
  }
}

function showLoginError(msg) {
  const el = document.getElementById("login-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function logout() {
  clearInterval(state.pollTimer);
  Object.assign(state, { channelId: null, team: null, isAdmin: false, boardData: null, pollTimer: null });
  localStorage.removeItem("hs_cid");
  document.getElementById("game-screen").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("team-code-input").value = "";
  document.getElementById("action-result").classList.add("hidden");
}

function enterGame() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");

  const nameBadge = document.getElementById("header-team-badge");

  if (state.isAdmin) {
    nameBadge.textContent    = "🛡️ Game Master";
    nameBadge.style.borderColor = "#e67e22";
    document.getElementById("actions-section").classList.add("hidden");
    document.getElementById("task-section").classList.add("hidden");
    document.getElementById("admin-section").classList.remove("hidden");
  } else {
    nameBadge.textContent    = `${getTeamBullet(state.team.team_id)} ${state.team.team_name}`;
    nameBadge.style.borderColor = TEAM_COLORS[state.team.team_id] || "#555";
  }

  addFeedEvent("sys", `Logged in as ${state.isAdmin ? "Game Master" : state.team.team_name}.`);

  // Always render the skeleton board immediately so something is visible
  renderEmptyBoard();

  refreshBoard().then(() => {
    state.pollTimer = setInterval(refreshBoard, 6000);
  });
}

// ══════════════════════════════════════════════════════
//  BOARD POLLING & RENDERING
// ══════════════════════════════════════════════════════

async function refreshBoard() {
  // Catch config mistake early so user sees a clear message
  if (CONFIG.APPS_SCRIPT_URL.includes("YOUR_DEPLOYMENT_ID")) {
    showBoardError("⚙️ APPS_SCRIPT_URL is still the placeholder.\nOpen app.js and paste your Apps Script URL on line 6.");
    return;
  }

  try {
    const data = await apiFetchBoardState();

    if (!data || !data.teams) {
      showBoardError("⚠️ Board data returned empty. Check your Apps Script deployment.");
      return;
    }

    // Clear any previous error
    const boardEl = document.getElementById("board-grid");
    boardEl.style.removeProperty("display");
    const errEl = document.getElementById("board-error");
    if (errEl) errEl.remove();

    detectMovements(data);
    state.boardData = data;

    if (state.team) {
      const srv = data.teams.find(t => Number(t.team_id) === Number(state.team.team_id));
      if (srv) { state.team.current_tile = srv.current_tile; state.team.team_name = srv.team_name; }
    }

    renderBoard(data);
    renderTeamsList(data.teams);
    renderTaskBox(data);
    updateHeaderTile();
    if (state.isAdmin) populateAdminDropdown(data.teams);

  } catch (err) {
    showBoardError(`❌ Could not load board: ${err.message}\n\nCheck your APPS_SCRIPT_URL in app.js.`);
  }
}

function showBoardError(msg) {
  const wrapper = document.getElementById("board-wrapper");
  let errEl = document.getElementById("board-error");
  if (!errEl) {
    errEl = document.createElement("div");
    errEl.id = "board-error";
    errEl.style.cssText = "background:#2a1a1a;border:1px solid #6b2020;border-radius:8px;padding:20px 24px;font-size:13px;white-space:pre-line;line-height:1.6;color:#e0a0a0;margin-top:8px;";
    wrapper.appendChild(errEl);
  }
  errEl.textContent = msg;
  // Hide the grid so the error is prominent
  document.getElementById("board-grid").style.display = "none";
  addFeedEvent("err", msg.split("\n")[0]);
}

function detectMovements(newData) {
  if (!state.boardData) return;
  const prev = {};
  state.boardData.teams.forEach(t => { prev[t.team_id] = Number(t.current_tile); });
  newData.teams.forEach(t => {
    const p = prev[t.team_id];
    if (p !== undefined && p !== Number(t.current_tile)) {
      addFeedEvent("ok", `📍 ${t.team_name} moved: tile ${p} → tile ${t.current_tile}`);
    }
  });
}

// Boustrophedon grid: row 0 = top visual row (tiles 91-100), row 9 = bottom (tiles 1-10)
function buildGrid() {
  const grid = [];
  for (let vRow = 0; vRow < 10; vRow++) {
    const tileRow = 9 - vRow;
    const row = [];
    for (let col = 0; col < 10; col++) {
      row.push(tileRow * 10 + (tileRow % 2 === 0 ? col + 1 : 10 - col));
    }
    grid.push(row);
  }
  return grid;
}

function renderEmptyBoard() {
  const boardEl = document.getElementById("board-grid");
  boardEl.innerHTML = "";
  boardEl.style.removeProperty("display");
  buildGrid().forEach(row => {
    row.forEach(tileNum => {
      const cell = document.createElement("div");
      cell.className = "tile";
      if (RAT_TILES.has(tileNum)) cell.classList.add("rat-tile");
      const numEl = document.createElement("div");
      numEl.className = "tile-num";
      numEl.textContent = tileNum;
      cell.appendChild(numEl);
      boardEl.appendChild(cell);
    });
  });
}

function renderBoard(data) {
  const { teams, tileContentMap, completedByTile, snakes } = data;

  const teamsByTile = {};
  teams.forEach(t => {
    const tile = Number(t.current_tile);
    if (tile >= 1 && tile <= 100) {
      if (!teamsByTile[tile]) teamsByTile[tile] = [];
      teamsByTile[tile].push(t);
    }
  });

  const myId   = state.team ? Number(state.team.team_id) : null;
  const myTile = state.team ? Number(state.team.current_tile) : null;

  const boardEl = document.getElementById("board-grid");
  boardEl.innerHTML = "";

  buildGrid().forEach(row => {
    row.forEach(tileNum => {
      const completedIds = (completedByTile[String(tileNum)] || []).map(Number);
      const cell = document.createElement("div");
      cell.className = "tile";

      if (snakes[tileNum])              cell.classList.add("snake-head");
      else if (RAT_TILES.has(tileNum))  cell.classList.add("rat-tile");
      if (tileNum === myTile)            cell.classList.add("my-tile");
      if (myId && completedIds.includes(myId)) cell.classList.add("done-by-me");

      // Tile number
      const numEl = document.createElement("div");
      numEl.className = "tile-num";
      numEl.textContent = tileNum;
      cell.appendChild(numEl);

      // Icon badge (top-right)
      if (snakes[tileNum]) {
        const b = document.createElement("span");
        b.className = "snake-badge"; b.textContent = "🐍";
        cell.appendChild(b);
      } else if (RAT_TILES.has(tileNum)) {
        const b = document.createElement("span");
        b.className = "rat-badge"; b.textContent = "🐀";
        cell.appendChild(b);
      }

      // Task content
      const content = (tileContentMap && tileContentMap[tileNum]) || "";
      if (content) {
        const cEl = document.createElement("div");
        cEl.className = "tile-content";
        cEl.textContent = content;
        cell.appendChild(cEl);
      }

      // Team pawns
      const teamsHere = teamsByTile[tileNum] || [];
      if (teamsHere.length) {
        const pawnsEl = document.createElement("div");
        pawnsEl.className = "tile-pawns";
        teamsHere.forEach(t => {
          const p = document.createElement("span");
          p.className = "pawn"; p.title = t.team_name;
          p.textContent = getTeamBullet(t.team_id);
          pawnsEl.appendChild(p);
        });
        cell.appendChild(pawnsEl);
      }

      // Completion bar ▰▱
      const barEl = document.createElement("div");
      barEl.className = "completion-bar";
      [1,2,3,4].forEach(id => {
        const dot = document.createElement("span");
        const done = completedIds.includes(id);
        dot.className = "comp-dot" + (done ? ` comp-done-${id}` : "");
        dot.textContent = "▰";
        dot.title = done ? `Team ${id} ✓` : `Team ${id}`;
        barEl.appendChild(dot);
      });
      cell.appendChild(barEl);

      // Hover tooltip
      const tip = document.createElement("div");
      tip.className = "tile-tooltip";
      let tipLines = [`Tile ${tileNum}`];
      if (content) tipLines.push(content);
      if (snakes[tileNum]) tipLines.push(`🐍 Snake → tile ${snakes[tileNum]}`);
      if (RAT_TILES.has(tileNum)) tipLines.push("🐀 Rat trap!");
      if (teamsHere.length) tipLines.push(teamsHere.map(t => `${getTeamBullet(t.team_id)} ${t.team_name}`).join("  "));
      tip.textContent = tipLines.join("\n");
      cell.appendChild(tip);

      boardEl.appendChild(cell);
    });
  });
}

function renderTeamsList(teams) {
  const el = document.getElementById("teams-list");
  el.innerHTML = "";
  const myId = state.team ? Number(state.team.team_id) : null;
  teams.forEach(t => {
    const row = document.createElement("div");
    row.className = "team-row" + (Number(t.team_id) === myId ? " is-mine" : "");
    row.innerHTML = `
      <span class="team-bullet">${getTeamBullet(t.team_id)}</span>
      <span class="team-name">${t.team_name}</span>
      <span class="team-tile">${Number(t.current_tile) > 0 ? `Tile ${t.current_tile}` : "Start"}</span>`;
    el.appendChild(row);
  });
}

function renderTaskBox(data) {
  if (!state.team || state.isAdmin) return;
  const myId   = Number(state.team.team_id);
  const myTile = Number(state.team.current_tile);

  document.getElementById("task-tile").textContent =
    myTile > 0 ? `Tile ${myTile}` : "Not on the board yet";

  const content = myTile > 0 ? ((data.tileContentMap || {})[myTile] || "No task text found") : "—";
  document.getElementById("task-desc").textContent = content;

  const completedIds = ((data.completedByTile || {})[String(myTile)] || []).map(Number);
  const isDone = completedIds.includes(myId);
  document.getElementById("task-status").textContent =
    myTile === 0   ? "Roll to enter the board!" :
    myTile === 100 ? "🏆 You've won!" :
    isDone         ? "✅ Completed — you can roll again!" :
                     "⏳ Not completed yet. Use Complete when done.";
}

function updateHeaderTile() {
  const el = document.getElementById("header-tile-badge");
  if (!state.team) { el.textContent = ""; return; }
  const t = Number(state.team.current_tile);
  el.textContent = t > 0 ? `Tile ${t}` : "Start";
}

function populateAdminDropdown(teams) {
  const sel = document.getElementById("admin-target");
  const prev = sel.value;
  sel.innerHTML = '<option value="">Select team…</option>';
  teams.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.channel_id;  // we send channel_id to the existing Apps Script handlers
    opt.textContent = `${getTeamBullet(t.team_id)} ${t.team_name} — Tile ${t.current_tile}`;
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
}

// ══════════════════════════════════════════════════════
//  PLAYER ACTIONS
// ══════════════════════════════════════════════════════

async function doRoll() {
  setActionResult("🎲 Rolling…");
  try {
    const result = await apiCommand("roll");
    setActionResult(result.message || JSON.stringify(result));
    addFeedEvent(result.success ? "ok" : "err", result.message || "Roll done.");
    if (result.success) refreshBoard();
  } catch (err) {
    setActionResult("❌ " + err.message);
    addFeedEvent("err", err.message);
  }
}

async function doComplete() {
  const proofUrl = document.getElementById("proof-input").value.trim();
  if (!proofUrl) { setActionResult("❌ Paste a proof URL first."); return; }
  setActionResult("✅ Submitting…");
  try {
    const result = await apiCommand("complete", { proof_url: proofUrl });
    setActionResult(result.message || JSON.stringify(result));
    addFeedEvent(result.success ? "ok" : "err", result.message || "Complete done.");
    if (result.success) { document.getElementById("proof-input").value = ""; refreshBoard(); }
  } catch (err) {
    setActionResult("❌ " + err.message);
    addFeedEvent("err", err.message);
  }
}

async function doCurrent() {
  setActionResult("📍 Checking…");
  try {
    const result = await apiCommand("current");
    setActionResult(result.message || JSON.stringify(result));
  } catch (err) {
    setActionResult("❌ " + err.message);
  }
}

// ══════════════════════════════════════════════════════
//  ADMIN ACTIONS
//  Override channel_id with the target team's channel_id
//  (the existing Apps Script handlers use channel_id to find the team)
// ══════════════════════════════════════════════════════

async function doPunish() {
  const targetChannelId = document.getElementById("admin-target").value;
  if (!targetChannelId) { setActionResult("❌ Select a team first."); return; }
  if (!confirm("Roll this team backwards as punishment?")) return;

  setActionResult("⏪ Punishing…");
  try {
    const result = await apiCommand("punish", { channel_id: targetChannelId });
    setActionResult(result.message || JSON.stringify(result));
    addFeedEvent(result.success ? "sys" : "err", result.message || "Punish done.");
    if (result.success) refreshBoard();
  } catch (err) {
    setActionResult("❌ " + err.message);
    addFeedEvent("err", err.message);
  }
}

async function doMove() {
  const targetChannelId = document.getElementById("admin-target").value;
  const tile = Number(document.getElementById("admin-tile").value);
  if (!targetChannelId)               { setActionResult("❌ Select a team first."); return; }
  if (!tile || tile < 1 || tile > 100){ setActionResult("❌ Enter a tile between 1 and 100."); return; }
  if (!confirm(`Move team to tile ${tile}?`)) return;

  setActionResult("➡️ Moving…");
  try {
    const result = await apiCommand("move", { channel_id: targetChannelId, tile });
    setActionResult(result.message || JSON.stringify(result));
    addFeedEvent(result.success ? "sys" : "err", result.message || "Move done.");
    if (result.success) refreshBoard();
  } catch (err) {
    setActionResult("❌ " + err.message);
    addFeedEvent("err", err.message);
  }
}

async function doReset() {
  if (!confirm("⚠️ Reset the ENTIRE game for all teams?")) return;
  if (!confirm("Really? This cannot be undone.")) return;

  setActionResult("🔄 Resetting…");
  try {
    const result = await apiCommand("reset");
    setActionResult(result.message || JSON.stringify(result));
    addFeedEvent(result.success ? "sys" : "err", result.success ? "🔄 Game reset." : result.message);
    if (result.success) refreshBoard();
  } catch (err) {
    setActionResult("❌ " + err.message);
    addFeedEvent("err", err.message);
  }
}

// ══════════════════════════════════════════════════════
//  UI HELPERS
// ══════════════════════════════════════════════════════

function setActionResult(text) {
  const el = document.getElementById("action-result");
  el.textContent = text;
  el.classList.remove("hidden");
}

function addFeedEvent(type, message) {
  if (!message) return;
  const feed = document.getElementById("feed-items");
  const item = document.createElement("div");
  item.className = `feed-item feed-${type}`;
  item.innerHTML = `<span class="feed-time">${new Date().toLocaleTimeString()}</span><span class="feed-msg">${message}</span>`;
  feed.prepend(item);
  while (feed.children.length > 80) feed.removeChild(feed.lastChild);
}

function clearFeed() { document.getElementById("feed-items").innerHTML = ""; }

// ══════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("login-btn").addEventListener("click", login);
  document.getElementById("logout-btn").addEventListener("click", logout);
  document.getElementById("team-code-input").addEventListener("keydown", e => {
    if (e.key === "Enter") login();
  });

  // Auto-login from localStorage
  const saved = localStorage.getItem("hs_cid");
  if (saved) {
    document.getElementById("team-code-input").value = saved;
    login();
  }
});
