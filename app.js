// ══════════════════════════════════════════════════════
//  CONFIG — fill these in before deploying to GitHub Pages
// ══════════════════════════════════════════════════════
const CONFIG = {
  CLOUDFLARE_URL: "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev",
  WEB_SECRET: "YOUR_WEB_APP_SECRET_HERE",
  // Admin code — whoever enters this gets Game Master controls.
  // Set it to any string you like and share only with game masters.
  ADMIN_CODE: "gamemaster"
};

// ── RAT tile list (must match AppsScript) ──
const RAT_TILES = new Set([7,8,9,10,11,12,13,22,31,44,55,67,71,82,89,95]);

// ── Team visuals ──
const TEAM_BULLETS = { 1:"🟣", 2:"🔴", 3:"🔵", 4:"🟡" };
const TEAM_COLORS  = { 1:"#9b59b6", 2:"#e74c3c", 3:"#3498db", 4:"#f1c40f" };
function getTeamBullet(id) { return TEAM_BULLETS[id] || "⚪"; }

// ── App state ──
const state = {
  teamCode:   null,
  team:       null,   // { team_id, team_name, current_tile, ... }
  isAdmin:    false,
  boardData:  null,   // last fetched board snapshot
  prevTiles:  {},     // team_id → previous current_tile (for change detection)
  pollTimer:  null
};

// ═══════════════════════════════════════════════════════
//  API
// ═══════════════════════════════════════════════════════

async function apiPost(command, extra = {}) {
  const body = {
    web_secret: CONFIG.WEB_SECRET,
    team_code:  state.teamCode,
    command,
    ...extra
  };
  const res = await fetch(`${CONFIG.CLOUDFLARE_URL}/web`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiFetchBoardState() {
  const url = `${CONFIG.CLOUDFLARE_URL}/web?secret=${encodeURIComponent(CONFIG.WEB_SECRET)}&view=boardstate`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ═══════════════════════════════════════════════════════
//  LOGIN / LOGOUT
// ═══════════════════════════════════════════════════════

async function login() {
  const input = document.getElementById("team-code-input");
  const code  = input.value.trim();
  const errEl = document.getElementById("login-error");

  if (!code) { showLoginError("Please enter your team code."); return; }
  errEl.classList.add("hidden");
  document.getElementById("login-btn").textContent = "Connecting…";

  try {
    if (code === CONFIG.ADMIN_CODE) {
      // Admin login — no team lookup needed
      state.teamCode = code;
      state.isAdmin  = true;
      state.team     = null;
      enterGame();
      return;
    }

    const result = await apiPost("login", { team_code: code });

    if (!result.success) {
      showLoginError(result.message || "Invalid team code.");
      return;
    }

    state.teamCode = code;
    state.isAdmin  = false;
    state.team     = {
      team_id:      result.team_id,
      team_name:    result.team_name,
      current_tile: result.current_tile
    };

    localStorage.setItem("hs_team_code", code);
    enterGame();

  } catch (err) {
    showLoginError("Could not reach server: " + err.message);
  } finally {
    document.getElementById("login-btn").textContent = "Enter Game";
  }
}

function showLoginError(msg) {
  const el = document.getElementById("login-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function logout() {
  clearInterval(state.pollTimer);
  state.teamCode  = null;
  state.team      = null;
  state.isAdmin   = false;
  state.boardData = null;
  state.prevTiles = {};
  localStorage.removeItem("hs_team_code");
  document.getElementById("game-screen").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("team-code-input").value = "";
  document.getElementById("action-result").classList.add("hidden");
}

function enterGame() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");

  // Header badges
  const nameBadge = document.getElementById("header-team-badge");
  if (state.isAdmin) {
    nameBadge.textContent = "🛡️ Game Master";
    nameBadge.style.borderColor = "#e67e22";
    document.getElementById("actions-section").classList.add("hidden");
    document.getElementById("task-section").classList.add("hidden");
    document.getElementById("admin-section").classList.remove("hidden");
  } else {
    nameBadge.textContent = `${getTeamBullet(state.team.team_id)} ${state.team.team_name}`;
    nameBadge.style.borderColor = TEAM_COLORS[state.team.team_id] || "#555";
  }

  // Initial board load then start polling
  refreshBoard().then(() => {
    state.pollTimer = setInterval(refreshBoard, 6000);
  });

  addFeedEvent("sys", `Entered game as ${state.isAdmin ? "Game Master" : state.team.team_name}.`);
}

// ═══════════════════════════════════════════════════════
//  BOARD POLLING & RENDERING
// ═══════════════════════════════════════════════════════

async function refreshBoard() {
  try {
    const data = await apiFetchBoardState();
    if (!data || !data.teams) return;

    detectTeamMovements(data);
    state.boardData = data;

    // Keep our team object in sync with server state
    if (state.team) {
      const serverTeam = data.teams.find(t => Number(t.team_id) === Number(state.team.team_id));
      if (serverTeam) {
        state.team.current_tile = serverTeam.current_tile;
        state.team.team_name    = serverTeam.team_name;
      }
    }

    renderBoard(data);
    renderTeamsList(data.teams);
    renderTaskBox(data);
    updateHeaderTile();
    if (state.isAdmin) populateAdminDropdown(data.teams);

  } catch (_) { /* silent — don't spam the feed on network blip */ }
}

function detectTeamMovements(newData) {
  if (!state.boardData) return;
  const prev = {};
  state.boardData.teams.forEach(t => { prev[t.team_id] = t.current_tile; });
  newData.teams.forEach(t => {
    if (prev[t.team_id] !== undefined && prev[t.team_id] !== t.current_tile) {
      addFeedEvent("ok", `📍 ${t.team_name} moved: tile ${prev[t.team_id]} → tile ${t.current_tile}`);
    }
  });
}

// Build the boustrophedon grid: returns 10×10 array of tile numbers
// Row 0 = top visual row (tiles 91-100 or 100-91), row 9 = bottom (tiles 1-10)
function buildGrid() {
  const grid = [];
  for (let vRow = 0; vRow < 10; vRow++) {
    const tileRow = 9 - vRow; // 0 = tiles 1-10 (bottom), 9 = tiles 91-100 (top)
    const row = [];
    for (let col = 0; col < 10; col++) {
      const tileNum = tileRow * 10 + (tileRow % 2 === 0 ? col + 1 : 10 - col);
      row.push(tileNum);
    }
    grid.push(row);
  }
  return grid;
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

  const grid    = buildGrid();
  const boardEl = document.getElementById("board-grid");
  boardEl.innerHTML = "";

  grid.forEach(row => {
    row.forEach(tileNum => {
      const completedIds = (completedByTile[String(tileNum)] || []).map(Number);
      const cell = document.createElement("div");
      cell.className = "tile";
      cell.dataset.tile = tileNum;

      if (snakes[tileNum])       cell.classList.add("snake-head");
      else if (RAT_TILES.has(tileNum)) cell.classList.add("rat-tile");

      if (tileNum === myTile)                 cell.classList.add("my-tile");
      if (myId && completedIds.includes(myId)) cell.classList.add("done-by-me");

      // Tile number
      const numEl = document.createElement("div");
      numEl.className = "tile-num";
      numEl.textContent = tileNum;
      cell.appendChild(numEl);

      // Badge (snake / rat)
      if (snakes[tileNum]) {
        const b = document.createElement("span");
        b.className = "snake-badge";
        b.textContent = "🐍";
        cell.appendChild(b);
      } else if (RAT_TILES.has(tileNum)) {
        const b = document.createElement("span");
        b.className = "rat-badge";
        b.textContent = "🐀";
        cell.appendChild(b);
      }

      // Content (show 2 lines max, full on tooltip)
      const content = tileContentMap[tileNum] || "";
      if (content) {
        const cEl = document.createElement("div");
        cEl.className = "tile-content";
        cEl.textContent = content;
        cell.appendChild(cEl);
      }

      // Pawns
      const teamsHere = teamsByTile[tileNum] || [];
      if (teamsHere.length) {
        const pawnsEl = document.createElement("div");
        pawnsEl.className = "tile-pawns";
        teamsHere.forEach(t => {
          const p = document.createElement("span");
          p.className = "pawn";
          p.title = t.team_name;
          p.textContent = getTeamBullet(t.team_id);
          pawnsEl.appendChild(p);
        });
        cell.appendChild(pawnsEl);
      }

      // Completion bar ▰▱
      const barEl = document.createElement("div");
      barEl.className = "completion-bar";
      [1, 2, 3, 4].forEach(id => {
        const dot = document.createElement("span");
        const done = completedIds.includes(id);
        dot.className = "comp-dot" + (done ? ` comp-done-${id}` : "");
        dot.textContent = "▰";
        dot.title = `Team ${id}${done ? " ✓" : ""}`;
        barEl.appendChild(dot);
      });
      cell.appendChild(barEl);

      // Hover tooltip
      const tip = document.createElement("div");
      tip.className = "tile-tooltip";
      let tipText = `Tile ${tileNum}`;
      if (content) tipText += `\n${content}`;
      if (snakes[tileNum]) tipText += `\n🐍 Snake → tile ${snakes[tileNum]}`;
      if (RAT_TILES.has(tileNum)) tipText += "\n🐀 Rat trap!";
      if (teamsHere.length) tipText += "\n" + teamsHere.map(t => `${getTeamBullet(t.team_id)} ${t.team_name}`).join("  ");
      tip.textContent = tipText;
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

    const bullet = document.createElement("span");
    bullet.className = "team-bullet";
    bullet.textContent = getTeamBullet(t.team_id);

    const name = document.createElement("span");
    name.className = "team-name";
    name.textContent = t.team_name;

    const tile = document.createElement("span");
    tile.className = "team-tile";
    tile.textContent = t.current_tile > 0 ? `Tile ${t.current_tile}` : "Start";

    row.append(bullet, name, tile);
    el.appendChild(row);
  });
}

function renderTaskBox(data) {
  if (!state.team || state.isAdmin) return;
  const myId   = Number(state.team.team_id);
  const myTile = Number(state.team.current_tile);

  document.getElementById("task-tile").textContent =
    myTile > 0 ? `Tile ${myTile}` : "Not on board yet";

  const content = (myTile > 0 && data.tileContentMap)
    ? (data.tileContentMap[myTile] || "No task text found")
    : "—";
  document.getElementById("task-desc").textContent = content;

  const completed = (data.completedByTile[String(myTile)] || []).map(Number);
  const isDone = completed.includes(myId);
  document.getElementById("task-status").textContent =
    myTile === 0  ? "Roll to enter the board!" :
    myTile === 100 ? "🏆 You won!" :
    isDone        ? "✅ Completed — you can roll again!" :
                    "⏳ Not completed yet — use Complete when done.";
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
    opt.value = t.team_id;
    opt.textContent = `${getTeamBullet(t.team_id)} ${t.team_name} (tile ${t.current_tile})`;
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
}

// ═══════════════════════════════════════════════════════
//  PLAYER ACTIONS
// ═══════════════════════════════════════════════════════

async function doRoll() {
  setActionLoading("🎲 Rolling…");
  try {
    const result = await apiPost("roll");
    showActionResult(result.message || JSON.stringify(result));
    if (result.success) {
      addFeedEvent("ok", result.message);
      refreshBoard();
    } else {
      addFeedEvent("err", result.message);
    }
  } catch (err) {
    showActionResult("❌ " + err.message);
    addFeedEvent("err", err.message);
  }
}

async function doComplete() {
  const proofUrl = document.getElementById("proof-input").value.trim();
  if (!proofUrl) {
    showActionResult("❌ Paste a proof URL first.");
    return;
  }
  setActionLoading("✅ Submitting…");
  try {
    const result = await apiPost("complete", { proof_url: proofUrl });
    showActionResult(result.message || JSON.stringify(result));
    if (result.success) {
      document.getElementById("proof-input").value = "";
      addFeedEvent("ok", result.message);
      refreshBoard();
    } else {
      addFeedEvent("err", result.message);
    }
  } catch (err) {
    showActionResult("❌ " + err.message);
    addFeedEvent("err", err.message);
  }
}

async function doCurrent() {
  setActionLoading("📍 Checking…");
  try {
    const result = await apiPost("current");
    showActionResult(result.message || JSON.stringify(result));
  } catch (err) {
    showActionResult("❌ " + err.message);
  }
}

// ═══════════════════════════════════════════════════════
//  ADMIN ACTIONS
// ═══════════════════════════════════════════════════════

async function doPunish() {
  const targetId = document.getElementById("admin-target").value;
  if (!targetId) { showActionResult("❌ Select a team first.", true); return; }

  if (!confirm(`Punish this team (roll them backwards)?`)) return;

  setActionLoading("⏪ Punishing…", true);
  try {
    const result = await apiPost("punish", { target_team_id: Number(targetId) });
    showActionResult(result.message || JSON.stringify(result), true);
    if (result.success) { addFeedEvent("sys", result.message); refreshBoard(); }
    else addFeedEvent("err", result.message);
  } catch (err) {
    showActionResult("❌ " + err.message, true);
    addFeedEvent("err", err.message);
  }
}

async function doMove() {
  const targetId = document.getElementById("admin-target").value;
  const tile     = Number(document.getElementById("admin-tile").value);

  if (!targetId)                       { showActionResult("❌ Select a team first.", true); return; }
  if (!tile || tile < 1 || tile > 100) { showActionResult("❌ Enter a tile between 1 and 100.", true); return; }

  if (!confirm(`Move team to tile ${tile}?`)) return;

  setActionLoading("➡️ Moving…", true);
  try {
    const result = await apiPost("move", { target_team_id: Number(targetId), tile });
    showActionResult(result.message || JSON.stringify(result), true);
    if (result.success) { addFeedEvent("sys", result.message); refreshBoard(); }
    else addFeedEvent("err", result.message);
  } catch (err) {
    showActionResult("❌ " + err.message, true);
    addFeedEvent("err", err.message);
  }
}

async function doReset() {
  if (!confirm("⚠️ This will RESET the entire game for all teams. Are you sure?")) return;
  if (!confirm("Really? This cannot be undone.")) return;

  setActionLoading("🔄 Resetting…", true);
  try {
    const result = await apiPost("reset");
    showActionResult(result.message || JSON.stringify(result), true);
    if (result.success) { addFeedEvent("sys", "🔄 Game reset by Game Master."); refreshBoard(); }
    else addFeedEvent("err", result.message);
  } catch (err) {
    showActionResult("❌ " + err.message, true);
    addFeedEvent("err", err.message);
  }
}

// ═══════════════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════════════

function setActionLoading(text, isAdmin = false) {
  const el = isAdmin
    ? document.getElementById("admin-section").querySelector(".action-result") || document.getElementById("action-result")
    : document.getElementById("action-result");
  el.classList.remove("hidden");
  el.textContent = text;
}

function showActionResult(text, isAdmin = false) {
  const el = document.getElementById("action-result");
  el.classList.remove("hidden");
  el.textContent = text;
}

// ── Event Feed ──

function addFeedEvent(type, message) {
  const feed = document.getElementById("feed-items");
  const item = document.createElement("div");
  item.className = `feed-item feed-${type}`;

  const time = document.createElement("span");
  time.className = "feed-time";
  time.textContent = new Date().toLocaleTimeString();

  const msg = document.createElement("span");
  msg.className = "feed-msg";
  msg.textContent = message;

  item.append(time, msg);
  feed.prepend(item);

  // Keep feed from growing unbounded
  while (feed.children.length > 80) {
    feed.removeChild(feed.lastChild);
  }
}

function clearFeed() {
  document.getElementById("feed-items").innerHTML = "";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("login-btn").addEventListener("click", login);
  document.getElementById("logout-btn").addEventListener("click", logout);

  document.getElementById("team-code-input").addEventListener("keydown", e => {
    if (e.key === "Enter") login();
  });

  // Auto-login from localStorage
  const saved = localStorage.getItem("hs_team_code");
  if (saved) {
    document.getElementById("team-code-input").value = saved;
    login();
  }
});
