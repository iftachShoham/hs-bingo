// ══════════════════════════════════════════════════════
//  CONFIG — fill in before deploying
// ══════════════════════════════════════════════════════
const CONFIG = {
  // Your Google Apps Script web app URL
  APPS_SCRIPT_URL: "%%APPS_SCRIPT_URL%%",

  // The WEB_APP_SECRET value from line 7 of your Apps Script
  WEB_SECRET: "%%WEB_SECRET%%",

  // Whoever types this on the login screen gets Game Master controls
  ADMIN_CODE: "%%ADMIN_CODE%%",

  // Free API key from https://api.imgbb.com — needed for image proof uploads
  IMGBB_KEY: "%%IMGBB_KEY%%",

  // URL of the proxy Cloudflare Worker (routes commands + forwards to Discord)
  PROXY_URL: "%%PROXY_URL%%",

};

// ── RAT tiles (must match the Apps Script constant) ──
const RAT_TILES = new Set([7,8,9,10,11,12,13,22,31,44,55,67,71,82,89,95]);

// ── Team visuals ──
const TEAM_BULLETS = { 1:"🟣", 2:"🔴", 3:"🔵", 4:"🟡" };
const TEAM_COLORS  = { 1:"#9b59b6", 2:"#e74c3c", 3:"#3498db", 4:"#f1c40f" };
function getTeamBullet(id) { return TEAM_BULLETS[Number(id)] || "⚪"; }

// ── App state ──
const state = {
  channelId:       null,   // the logged-in team's channel_id (or ADMIN_CODE)
  team:            null,   // { team_id, team_name, current_tile }
  isAdmin:         false,
  boardData:       null,
  pollTimer:       null,
  activeTab:       'board',
  playerName:      null,   // optional display name entered at login
  proofFile:       null,   // pending image File for proof upload
  tileImages:      null,   // Map<normalizedTaskName, imagePath> — loaded once on login
  prevTaskContent: null,   // tracks last rendered task to detect ACB trigger
};

// ── Tile images — loaded once, matched by normalised task name ──
async function loadTileImages() {
  try {
    const res = await fetch('tile-images.json');
    if (!res.ok) {
      console.warn('[tile-images] fetch failed:', res.status, res.url);
      state.tileImages = new Map();
      return;
    }
    const data = await res.json();
    const map  = new Map();
    for (const entry of Object.values(data)) {
      if (entry.name && entry.image) {
        map.set(entry.name.toLowerCase().trim(), entry.image);
      }
    }
    state.tileImages = map;
    console.log(`[tile-images] loaded ${map.size} entries`);
  } catch (err) {
    console.warn('[tile-images] error:', err);
    state.tileImages = new Map();
  }
}

// ══════════════════════════════════════════════════════
//  API — calls Apps Script directly
//  Content-Type: text/plain avoids CORS preflight (simple request)
// ══════════════════════════════════════════════════════

// All team/admin commands
// Routes through proxy worker when PROXY_URL is configured (enables Discord posting).
// Falls back to calling Apps Script directly if proxy is unreachable or not deployed.
async function apiCommand(command, extra = {}) {
  const useProxy = CONFIG.PROXY_URL && !CONFIG.PROXY_URL.includes("%%");

  const makeBody = (authKey, url) => ({
    url,
    options: {
      method:   "POST",
      headers:  { "Content-Type": "text/plain;charset=utf-8" },
      body:     JSON.stringify({
        [authKey]:   CONFIG.WEB_SECRET,
        channel_id:  state.channelId,
        command,
        player_name: state.playerName || "",
        source:      "web",
        ...extra
      }),
      redirect: "follow"
    }
  });

  if (useProxy) {
    try {
      const { url, options } = makeBody("web_secret", CONFIG.PROXY_URL);
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (proxyErr) {
      console.warn("Proxy failed, falling back to direct Apps Script:", proxyErr.message);
    }
  }

  // Direct Apps Script (fallback or no proxy configured)
  const { url, options } = makeBody("secret", CONFIG.APPS_SCRIPT_URL);
  const res = await fetch(url, options);
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

  const nameInput = document.getElementById("player-name-input");
  const playerName = nameInput ? nameInput.value.trim() : "";

  const btn = document.getElementById("login-btn");
  btn.textContent = "Connecting…";
  btn.disabled = true;
  document.getElementById("login-error").classList.add("hidden");

  try {
    // Admin shortcut — no server lookup needed
    if (code === CONFIG.ADMIN_CODE) {
      state.channelId  = code;
      state.isAdmin    = true;
      state.team       = null;
      state.playerName = playerName || null;
      localStorage.setItem("hs_cid", code);
      if (playerName) localStorage.setItem("hs_player", playerName);
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

    state.channelId  = code;
    state.isAdmin    = false;
    state.team       = { team_id: match.team_id, team_name: match.team_name, current_tile: match.current_tile };
    state.boardData  = boardData;
    state.playerName = playerName || null;
    localStorage.setItem("hs_cid", code);
    if (playerName) localStorage.setItem("hs_player", playerName);
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
  Object.assign(state, { channelId: null, team: null, isAdmin: false, boardData: null, pollTimer: null, playerName: null, proofFile: null, prevTaskContent: null });
  localStorage.removeItem("hs_cid");
  document.getElementById("game-screen").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("team-code-input").value = "";
  document.getElementById("roll-result").classList.add("hidden");
  document.getElementById("complete-result").classList.add("hidden");
  clearProof();
}

function enterGame() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");

  const nameBadge = document.getElementById("header-team-badge");

  if (state.isAdmin) {
    nameBadge.textContent    = state.playerName ? `🛡️ ${state.playerName}` : "🛡️ Game Master";
    nameBadge.style.borderColor = "#e67e22";
    document.getElementById("roll-section").classList.add("hidden");
    document.getElementById("complete-section").classList.add("hidden");
    document.getElementById("task-section").classList.add("hidden");
    document.getElementById("admin-section").classList.remove("hidden");
  } else {
    const nameLabel = state.playerName ? ` · ${state.playerName}` : "";
    nameBadge.textContent    = `${getTeamBullet(state.team.team_id)} ${state.team.team_name}${nameLabel}`;
    nameBadge.style.borderColor = TEAM_COLORS[state.team.team_id] || "#555";
  }

  const whoLabel = state.playerName
    ? `${state.playerName} (${state.isAdmin ? "Game Master" : state.team.team_name})`
    : (state.isAdmin ? "Game Master" : state.team.team_name);
  addFeedEvent("sys", `Logged in as ${whoLabel}.`);

  // On mobile, update Play tab label for admin
  if (state.isAdmin) {
    const tabIcon  = document.querySelector('.tab-btn[data-tab="play"] .tab-icon');
    const tabLabel = document.querySelector('.tab-btn[data-tab="play"] .tab-label');
    if (tabIcon)  tabIcon.textContent  = '🛡️';
    if (tabLabel) tabLabel.textContent = 'Admin';
  }

  // Always render the skeleton board immediately so something is visible
  renderEmptyBoard();

  // Apply mobile tab layout before first render
  if (isMobile()) switchTab('board');

  // Load tile images once, then kick off polling
  loadTileImages().then(() => {
    refreshBoard().then(() => {
      state.pollTimer = setInterval(refreshBoard, 6000);
    });
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
      const numEl = document.createElement("div");
      numEl.className = "tile-num";
      numEl.textContent = tileNum;
      cell.appendChild(numEl);
      boardEl.appendChild(cell);
    });
  });
}

function renderBoard(data) {
  const { teams, tileContentMap, completedByTile, snakes, tileAmountMap, completionCountsByTile } = data;
  const triggeredRatSet = new Set((data.triggeredRats || []).map(Number));

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
      const required     = Number((tileAmountMap || {})[String(tileNum)] || 1);
      const tileCounts   = (completionCountsByTile || {})[String(tileNum)] || {};

      const cell = document.createElement("div");
      cell.className = "tile";
      cell.dataset.tile = tileNum;

      if (snakes[tileNum])                     cell.classList.add("snake-head");
      else if (triggeredRatSet.has(tileNum))   cell.classList.add("rat-tile");
      if (tileNum === myTile)                  cell.classList.add("my-tile");
      if (myId && completedIds.includes(myId)) cell.classList.add("done-by-me");

      // Tile number
      const numEl = document.createElement("div");
      numEl.className = "tile-num";
      numEl.textContent = tileNum;
      cell.appendChild(numEl);

      // Icon badge (top-right) — rats only shown once triggered
      if (snakes[tileNum]) {
        const b = document.createElement("span");
        b.className = "snake-badge"; b.textContent = "🐍";
        cell.appendChild(b);
      } else if (triggeredRatSet.has(tileNum)) {
        const b = document.createElement("span");
        b.className = "rat-badge"; b.textContent = "🐀";
        cell.appendChild(b);
      }

      // Task content
      const content = (tileContentMap && tileContentMap[tileNum]) || "";
      if (content) {
        if (state.tileImages && state.tileImages.size > 0) {
          const key     = content.toLowerCase().trim();
          const imgPath = state.tileImages.get(key);
          if (imgPath) {
            const bgEl = document.createElement("div");
            bgEl.className = "tile-bg-img";
            bgEl.style.backgroundImage = `url('${imgPath.replace(/'/g, "%27")}')`;
            cell.insertBefore(bgEl, cell.firstChild);
          }
        }
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

      // Completion bar ▰▱ (fully-completed teams only — unchanged)
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

      // Progress label for multi-completion tiles only
      if (required > 1) {
        const progEl = document.createElement("div");
        progEl.className = "tile-progress";
        const parts = [1, 2, 3, 4]
          .filter(id => (tileCounts[String(id)] || 0) > 0)
          .map(id => `${getTeamBullet(id)}${tileCounts[String(id)]}/${required}`);
        progEl.textContent = parts.length ? parts.join(" ") : `0/${required}`;
        cell.appendChild(progEl);
      }

      // Desktop hover tooltip
      const tip = document.createElement("div");
      tip.className = "tile-tooltip";
      let tipLines = [`Tile ${tileNum}`];
      if (content) tipLines.push(content);
      if (snakes[tileNum]) tipLines.push(`🐍 Snake → tile ${snakes[tileNum]}`);
      if (triggeredRatSet.has(tileNum)) tipLines.push("🐀 Rat trap (triggered)");
      if (teamsHere.length) tipLines.push(teamsHere.map(t => `${getTeamBullet(t.team_id)} ${t.team_name}`).join("  "));
      if (required > 1) {
        const tp = [1, 2, 3, 4]
          .map(id => `${getTeamBullet(id)} ${tileCounts[String(id)] || 0}/${required}`)
          .join("  ");
        tipLines.push(`Progress: ${tp}`);
      }
      tip.textContent = tipLines.join("\n");
      cell.appendChild(tip);

      // Click → info modal (all devices)
      cell.addEventListener('click', () => {
        showTileInfo(tileNum, content, snakes, teamsHere, triggeredRatSet, completedIds, required, tileCounts);
      });

      boardEl.appendChild(cell);
    });
  });
  requestAnimationFrame(() => drawSnakes(snakes));
}

function renderTeamsList(teams) {
  const el        = document.getElementById("teams-list");
  el.innerHTML    = "";
  const myId      = state.team ? Number(state.team.team_id) : null;
  const tileMap   = state.boardData?.tileContentMap || {};
  const amountMap = state.boardData?.tileAmountMap || {};
  const countsMap = state.boardData?.completionCountsByTile || {};

  teams.forEach(t => {
    const tid      = Number(t.team_id);
    const tile     = Number(t.current_tile);
    const tileText = tile > 0 ? `Tile ${tile}` : "Start";
    const showTask = (state.isAdmin || tid === myId) && tile > 0;
    let taskText   = showTask ? (tileMap[tile] || "") : "";

    if (taskText) {
      const req = Number(amountMap[String(tile)] || 1);
      if (req > 1) {
        const c = Number((countsMap[String(tile)] || {})[String(tid)] || 0);
        taskText += ` (${c}/${req})`;
      }
    }

    const row = document.createElement("div");
    row.className = "team-row" + (tid === myId ? " is-mine" : "");

    const bullet = document.createElement("span");
    bullet.className = "team-bullet";
    bullet.textContent = getTeamBullet(tid);

    const info = document.createElement("div");
    info.className = "team-info";

    const nameRow = document.createElement("div");
    nameRow.className = "team-name-tile";

    const nameEl = document.createElement("span");
    nameEl.className = "team-name";
    nameEl.textContent = t.team_name;

    const tileEl = document.createElement("span");
    tileEl.className = "team-tile";
    tileEl.textContent = tileText;

    nameRow.appendChild(nameEl);
    nameRow.appendChild(tileEl);
    info.appendChild(nameRow);

    if (taskText) {
      const taskEl = document.createElement("div");
      taskEl.className = "team-task";
      taskEl.textContent = taskText;
      info.appendChild(taskEl);
    }

    row.appendChild(bullet);
    row.appendChild(info);
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

  // Play ACB jingle when landing on the ACB tile for the first time this session
  if (state.prevTaskContent !== null &&
      content.toLowerCase().trim() === 'acb' &&
      state.prevTaskContent.toLowerCase().trim() !== 'acb') {
    playSound('old-armadyl-eye-spec-made-with-Voicemod.mp3');
  }
  state.prevTaskContent = content;

  const required = Number((data.tileAmountMap || {})[String(myTile)] || 1);
  const count    = Number(((data.completionCountsByTile || {})[String(myTile)] || {})[String(myId)] || 0);

  const statusEl = document.getElementById("task-status");
  let subsEl = document.getElementById("task-submissions");
  if (!subsEl) {
    subsEl = document.createElement("div");
    subsEl.id = "task-submissions";
    subsEl.className = "task-submissions";
    statusEl.parentNode.insertBefore(subsEl, statusEl);
  }
  if (myTile > 0 && required > 1) {
    subsEl.textContent = `Submissions: ${count} / ${required}`;
    subsEl.style.display = "";
  } else {
    subsEl.style.display = "none";
  }

  let status;
  if (myTile === 0) {
    status = "Roll to enter the board!";
  } else if (myTile === 100) {
    status = "🏆 You've won!";
  } else if (required > 1) {
    if (count === 0)           status = "⏳ Not started. Submit with Complete when done.";
    else if (count < required) status = `⏳ In progress (${count}/${required}). Keep submitting with proof.`;
    else                       status = "✅ Completed — you can roll again!";
  } else {
    const completedIds = ((data.completedByTile || {})[String(myTile)] || []).map(Number);
    status = completedIds.includes(myId)
      ? "✅ Completed — you can roll again!"
      : "⏳ Not completed yet. Use Complete when done.";
  }
  statusEl.textContent = status;
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
  const btn = document.getElementById("btn-roll");
  setBusy(btn, true, "🎲 Rolling…");
  setRollResult("🎲 Rolling…");
  try {
    // Non-admin: suppress the proxy's Discord post so we can send a combined
    // message (roll text + tile image) via the team's webhook ourselves below.
    const extra = !state.isAdmin ? { source: "web-client" } : {};
    const result = await apiCommand("roll", extra);
    setRollResult(result.message || JSON.stringify(result));
    addFeedEvent(result.success ? "ok" : "err", result.message || "Roll done.");
    if (result.success) {
      const msg = (result.message || "").toLowerCase();
      const hasSnakeOrRat = msg.includes("snake") || msg.includes("rat");
      if (msg.includes("snake"))     showBoardGif("snake-dance.gif");
      else if (msg.includes("rat"))  showBoardGif("rat-dance.gif");

      // Post combined roll message + tile image to the team's Discord webhook.
      // result.result.tile_content is available immediately — no need to wait for refreshBoard.
      if (!state.isAdmin && state.team) {
        const teamData = state.boardData?.teams?.find(
          t => Number(t.team_id) === Number(state.team.team_id)
        );
        const webhookUrl = teamData?.webhook_url;
        if (webhookUrl) {
          const tileContent = result.result?.tile_content;
          const imgPath = tileContent && state.tileImages
            ? state.tileImages.get(tileContent.toLowerCase().trim())
            : null;
          const credit = state.playerName ? ` *(${state.playerName} via web)*` : " *(via web)*";
          const discordContent = (result.message || "") + credit;
          const payload = { content: discordContent };
          if (imgPath) payload.embeds = [{ image: { url: new URL(imgPath, window.location.href).href } }];
          fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          }).catch(() => {});
        }
      }

      await refreshBoard();

      // Auto-open the modal for the tile that was just landed on
      if (!state.isAdmin && state.team) {
        const newTile = Number(state.team.current_tile);
        if (newTile >= 1 && newTile <= 100) {
          const popDelay = hasSnakeOrRat ? 3200 : 400;
          setTimeout(() => {
            const tileEl = document.querySelector(`.tile[data-tile="${newTile}"]`);
            if (tileEl) tileEl.click();
          }, popDelay);
        }
      }
    }
  } catch (err) {
    setRollResult("❌ " + err.message);
    addFeedEvent("err", err.message);
  } finally {
    setBusy(btn, false, "🎲 Roll Dice");
  }
}

let _gifTimer = null;
function showBoardGif(filename) {
  const overlay = document.getElementById("board-gif-overlay");
  const img     = document.getElementById("board-gif-img");
  if (_gifTimer) { clearTimeout(_gifTimer); _gifTimer = null; }
  img.src = filename;
  overlay.classList.remove("hidden");
  _gifTimer = setTimeout(() => {
    overlay.classList.add("hidden");
    img.src = "";
    _gifTimer = null;
  }, 3000);
}

async function doComplete() {
  const proofUrl = document.getElementById("proof-url").value.trim();
  const hasFile  = !!state.proofFile;

  if (!hasFile && !proofUrl) {
    setCompleteResult("❌ Add a photo or paste a proof URL first.");
    return;
  }

  const btn = document.getElementById("btn-complete");
  setBusy(btn, true, "✅ Submitting…");
  setCompleteResult("✅ Submitting…");

  try {
    let finalUrl = proofUrl;

    if (hasFile) {
      setCompleteResult("📤 Uploading image…");
      finalUrl = await uploadProofImage(state.proofFile);
    }

    const result = await apiCommand("complete", { proof_url: finalUrl, username: state.playerName || "" });
    setCompleteResult(result.message || JSON.stringify(result));

    addFeedEvent(result.success ? "ok" : "err", result.message || "Complete done.");

    if (result.success) {
      playSound('task_completed.mp3');
      clearProof();
      document.getElementById("proof-url").value = "";
      refreshBoard();
    }
  } catch (err) {
    setCompleteResult("❌ " + err.message);
    addFeedEvent("err", err.message);
  } finally {
    setBusy(btn, false, "✅ Complete Task");
  }
}

// Upload an image File to ImgBB and return the hosted URL
async function uploadProofImage(file) {
  const key = CONFIG.IMGBB_KEY;
  if (!key || key.startsWith("%%")) {
    throw new Error("Image upload needs an IMGBB_KEY secret — add it in GitHub Secrets or paste a URL instead.");
  }

  const base64 = await fileToBase64(file);
  const body   = new FormData();
  body.append("key",   key);
  body.append("image", base64.split(",")[1]);

  const res  = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "ImgBB upload failed");
  return json.data.url;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

// Resize image via canvas before upload (max 1280px, keeps aspect ratio)
function resizeImage(file, maxPx = 1280, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale  = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => resolve(new File([blob], file.name, { type: "image/jpeg" })), "image/jpeg", quality);
    };
    img.src = url;
  });
}

function setProofFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  resizeImage(file).then(resized => {
    state.proofFile = resized;
    const reader = new FileReader();
    reader.onload = e => {
      document.getElementById("proof-img").src = e.target.result;
      document.getElementById("proof-preview").classList.remove("hidden");
      document.getElementById("proof-inputs").classList.add("hidden");
    };
    reader.readAsDataURL(resized);
  });
}

function clearProof() {
  state.proofFile = null;
  document.getElementById("proof-preview").classList.add("hidden");
  document.getElementById("proof-inputs").classList.remove("hidden");
  document.getElementById("proof-img").src = "";
  const fi = document.getElementById("proof-file");
  if (fi) fi.value = "";
}

function setBusy(btn, busy, label) {
  btn.disabled = busy;
  btn.classList.toggle("busy", busy);
  btn.textContent = label;
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
//  AUDIO
// ══════════════════════════════════════════════════════

function playSound(src) {
  const audio = new Audio(src);
  audio.play().catch(() => {});
}

// ══════════════════════════════════════════════════════
//  UI HELPERS
// ══════════════════════════════════════════════════════

function setRollResult(text) {
  const el = document.getElementById("roll-result");
  el.textContent = text;
  el.classList.remove("hidden");
}

function setCompleteResult(text) {
  const el = document.getElementById("complete-result");
  el.textContent = text;
  el.classList.remove("hidden");
}

function setActionResult(text) {
  setRollResult(text);
  setCompleteResult(text);
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
//  MOBILE — tab navigation & tile modal
// ══════════════════════════════════════════════════════

function isMobile() {
  return window.matchMedia('(max-width: 860px)').matches;
}

function switchTab(name) {
  state.activeTab = name;
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name)
  );
  if (isMobile()) _applyMobileTab(name);
}

function _applyMobileTab(name) {
  const bw = document.getElementById('board-wrapper');
  const sp = document.getElementById('side-panel');
  const ef = document.getElementById('event-feed');
  const ml = document.getElementById('main-layout');

  // Close any open tile modal when switching tabs
  document.getElementById('tile-modal').classList.add('hidden');

  // Log tab: hide main layout, show event feed full-height
  const isLog = name === 'log';
  ml.style.display = isLog ? 'none' : '';
  ef.classList.toggle('m-active', isLog);

  if (isLog) return;

  // Board tab: show board; others: show side panel
  bw.classList.toggle('m-active', name === 'board');
  sp.classList.toggle('m-active', name !== 'board');

  // Reveal the right panel sections
  document.querySelectorAll('#side-panel .panel-section').forEach(s =>
    s.classList.remove('m-active')
  );

  const sectionsForTab = {
    play:  ['task-section', 'roll-section', 'complete-section', 'admin-section'],
    teams: ['teams-section', 'admin-section']
  };

  (sectionsForTab[name] || []).forEach(id => {
    const el = document.getElementById(id);
    // Respect hidden class (admin vs player visibility)
    if (el && !el.classList.contains('hidden')) el.classList.add('m-active');
  });
}

function showTileInfo(tileNum, content, snakes, teamsHere, triggeredRatSet, completedIds, required = 1, tileCounts = {}) {
  document.getElementById('tile-modal-num').textContent = `Tile ${tileNum}`;

  // Task name line
  const taskEl = document.getElementById('tile-modal-task');
  taskEl.textContent = content || '';
  taskEl.style.display = content ? '' : 'none';

  // Image
  const imgEl = document.getElementById('tile-modal-img');
  const imgPath = state.tileImages && content
    ? state.tileImages.get(content.toLowerCase().trim())
    : null;
  if (imgPath) {
    imgEl.style.backgroundImage = `url('${imgPath.replace(/'/g, "%27")}')`;
    imgEl.classList.remove('hidden');
  } else {
    imgEl.classList.add('hidden');
    imgEl.style.backgroundImage = '';
  }

  // Extra info rows
  const body = document.getElementById('tile-modal-body');
  body.innerHTML = '';

  const addRow = (text) => {
    const p = document.createElement('p');
    p.textContent = text;
    body.appendChild(p);
  };

  if (snakes[tileNum])              addRow(`🐍 Snake head — slides to tile ${snakes[tileNum]}`);
  if (triggeredRatSet.has(tileNum)) addRow('🐀 Rat trap (already triggered)');

  // Per-team completion progress for multi-completion tiles
  if (required > 1) {
    const p = document.createElement('p');
    const lbl = document.createElement('strong');
    lbl.textContent = 'Completions: ';
    p.appendChild(lbl);
    const parts = [1, 2, 3, 4].map(id => {
      const c = tileCounts[String(id)] || 0;
      const tick = c >= required ? ' ✅' : '';
      return `${getTeamBullet(id)} ${c}/${required}${tick}`;
    });
    p.appendChild(document.createTextNode(parts.join('  ')));
    body.appendChild(p);
  }

  if (teamsHere.length) {
    const p = document.createElement('p');
    const lbl = document.createElement('strong');
    lbl.textContent = 'Here now: ';
    p.appendChild(lbl);
    p.appendChild(document.createTextNode(
      teamsHere.map(t => `${getTeamBullet(t.team_id)} ${t.team_name}`).join('  ')
    ));
    body.appendChild(p);
  }

  if (completedIds.length) {
    const p = document.createElement('p');
    const lbl = document.createElement('strong');
    lbl.textContent = 'Completed by: ';
    p.appendChild(lbl);
    const names = completedIds.map(id => {
      const t = (state.boardData?.teams || []).find(t => Number(t.team_id) === id);
      return t ? `${getTeamBullet(id)} ${t.team_name}` : `Team ${id}`;
    });
    p.appendChild(document.createTextNode(names.join('  ')));
    body.appendChild(p);
  }

  document.getElementById('tile-modal').classList.remove('hidden');
}

function closeTileModal() {
  document.getElementById('tile-modal').classList.add('hidden');
}

// ══════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("login-btn").addEventListener("click", login);
  document.getElementById("logout-btn").addEventListener("click", logout);
  document.getElementById("team-code-input").addEventListener("keydown", e => {
    if (e.key === "Enter") login();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeTileModal();
  });

  // Pre-fill saved player name
  const savedName = localStorage.getItem("hs_player");
  if (savedName) document.getElementById("player-name-input").value = savedName;

  // File input → preview
  document.getElementById("proof-file").addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) setProofFile(file);
  });

  // Drag-drop on proof zone
  const zone = document.getElementById("proof-zone");
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", ()  => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) setProofFile(file);
  });

  // Paste image anywhere on the page
  document.addEventListener("paste", e => {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith("image/"));
    if (item) setProofFile(item.getAsFile());
  });

  // Redraw snake overlays when window resizes (board cell sizes change)
  window.addEventListener('resize', () => {
    if (state.boardData?.snakes) requestAnimationFrame(() => drawSnakes(state.boardData.snakes));
  });

  // Auto-login from localStorage
  const saved = localStorage.getItem("hs_cid");
  if (saved) {
    document.getElementById("team-code-input").value = saved;
    login();
  }
});

// ══════════════════════════════════════════════════════
//  SNAKE DRAWING — SVG overlay on the board grid
// ══════════════════════════════════════════════════════

function drawSnakes(snakes) {
  const grid = document.getElementById('board-grid');
  if (!grid || !snakes) return;

  const old = document.getElementById('snake-svg');
  if (old) old.remove();

  const entries = Object.entries(snakes).filter(([, t]) => t);
  if (!entries.length) return;

  grid.style.position = 'relative';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'snake-svg';
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:20;overflow:hidden;';
  grid.appendChild(svg);

  const gridRect = grid.getBoundingClientRect();
  const W = gridRect.width, H = gridRect.height;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // Clip everything to the grid bounds so curves never overflow
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const clipEl = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
  clipEl.id = 'snake-board-clip';
  const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  clipRect.setAttribute('width', W); clipRect.setAttribute('height', H);
  clipEl.appendChild(clipRect); defs.appendChild(clipEl); svg.appendChild(defs);

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('clip-path', 'url(#snake-board-clip)');
  svg.appendChild(g);

  const PALETTES = [
    { body: '#2e7d32', hi: '#81c784', dark: '#1b5e20' },
    { body: '#558b2f', hi: '#aed581', dark: '#33691e' },
    { body: '#00695c', hi: '#80cbc4', dark: '#004d40' },
    { body: '#4527a0', hi: '#b39ddb', dark: '#1a0072' },
    { body: '#ad1457', hi: '#f48fb1', dark: '#78002e' },
    { body: '#e65100', hi: '#ffcc80', dark: '#ac1900' },
  ];

  entries.forEach(([headStr, tailStr], idx) => {
    const headTile = Number(headStr);
    const tailTile = Number(tailStr);

    const headEl = grid.querySelector(`[data-tile="${headTile}"]`);
    const tailEl = grid.querySelector(`[data-tile="${tailTile}"]`);
    if (!headEl || !tailEl) return;

    const hRect = headEl.getBoundingClientRect();
    const tRect = tailEl.getBoundingClientRect();

    const hx = hRect.left - gridRect.left + hRect.width  / 2;
    const hy = hRect.top  - gridRect.top  + hRect.height / 2;
    const tx = tRect.left - gridRect.left + tRect.width  / 2;
    const ty = tRect.top  - gridRect.top  + tRect.height / 2;

    const cellSize = Math.min(hRect.width, hRect.height);
    const pal = PALETTES[idx % PALETTES.length];
    drawSnakeShape(g, hx, hy, tx, ty, pal, cellSize, idx);
  });
}

function drawSnakeShape(g, hx, hy, tx, ty, pal, cellSize, idx) {
  const dx = tx - hx, dy = ty - hy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 2) return;

  const thickness = cellSize * 0.16;

  // Perpendicular unit vector — alternating side per snake gives space between them
  const sign = (idx % 2 === 0) ? 1 : -1;
  const px = (-dy / dist) * sign;
  const py = ( dx / dist) * sign;
  const amp = Math.min(dist * 0.32, cellSize * 2.2);

  // Cubic bezier control points for S-curve body
  const cp1x = hx + dx * 0.3 + px * amp;
  const cp1y = hy + dy * 0.3 + py * amp;
  const cp2x = hx + dx * 0.7 - px * amp;
  const cp2y = hy + dy * 0.7 - py * amp;

  const pathD = `M${hx},${hy} C${cp1x},${cp1y} ${cp2x},${cp2y} ${tx},${ty}`;

  // ── Drop shadow ──
  g.appendChild(svgPath(pathD, 'rgba(0,0,0,0.5)', thickness + 4, 'round'));

  // ── Main body ──
  const body = svgPath(pathD, pal.body, thickness, 'round');
  body.setAttribute('opacity', '0.9');
  g.appendChild(body);

  // ── Scale texture: dark dashes along the body ──
  const scales = svgPath(pathD, 'rgba(0,0,0,0.25)', thickness * 0.82, 'round');
  scales.setAttribute('stroke-dasharray', `${thickness * 0.5} ${thickness * 0.5}`);
  g.appendChild(scales);

  // ── Belly stripe (lighter centre) ──
  const belly = svgPath(pathD, pal.hi, thickness * 0.28, 'round');
  belly.setAttribute('opacity', '0.55');
  g.appendChild(belly);

  // ── Head oval (slightly wider, tilted toward the body) ──
  const headAngle = Math.atan2(hx - cp1x, hy - cp1y) - Math.PI / 2;  // head faces away from body
  const headR = thickness * 0.82;
  const headOval = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  headOval.setAttribute('cx', hx); headOval.setAttribute('cy', hy);
  headOval.setAttribute('rx', headR * 1.3); headOval.setAttribute('ry', headR * 0.92);
  headOval.setAttribute('fill', pal.dark);
  headOval.setAttribute('transform', `rotate(${headAngle * 180 / Math.PI},${hx},${hy})`);
  headOval.setAttribute('opacity', '0.95');
  g.appendChild(headOval);

  // ── Eyes ──
  const perpAngle = headAngle + Math.PI / 2;
  const eyeDist = headR * 0.38;
  const eyeFwd  = headR * 0.28;
  const eyeR    = headR * 0.24;

  [1, -1].forEach(side => {
    const ex = hx + Math.cos(perpAngle) * eyeDist * side + Math.cos(headAngle) * eyeFwd;
    const ey = hy + Math.sin(perpAngle) * eyeDist * side + Math.sin(headAngle) * eyeFwd;

    // Iris
    const iris = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    iris.setAttribute('cx', ex); iris.setAttribute('cy', ey);
    iris.setAttribute('r', eyeR); iris.setAttribute('fill', '#f9e44a');
    g.appendChild(iris);

    // Vertical-slit pupil (snake-like)
    const pupil = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    pupil.setAttribute('cx', ex); pupil.setAttribute('cy', ey);
    pupil.setAttribute('rx', eyeR * 0.28); pupil.setAttribute('ry', eyeR * 0.78);
    pupil.setAttribute('fill', '#0d0500');
    pupil.setAttribute('transform', `rotate(${headAngle * 180 / Math.PI},${ex},${ey})`);
    g.appendChild(pupil);
  });

  // ── Forked tongue ──
  const tongueBase = {
    x: hx + Math.cos(headAngle) * headR * 1.15,
    y: hy + Math.sin(headAngle) * headR * 1.15,
  };
  const tongueTip = {
    x: tongueBase.x + Math.cos(headAngle) * headR * 1.1,
    y: tongueBase.y + Math.sin(headAngle) * headR * 1.1,
  };
  const forkLen = headR * 0.55;
  const forkAng = 0.42;

  const tongue = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  tongue.setAttribute('d', [
    `M${tongueBase.x},${tongueBase.y} L${tongueTip.x},${tongueTip.y}`,
    `M${tongueTip.x},${tongueTip.y}`,
    `L${tongueTip.x + Math.cos(headAngle - forkAng) * forkLen},${tongueTip.y + Math.sin(headAngle - forkAng) * forkLen}`,
    `M${tongueTip.x},${tongueTip.y}`,
    `L${tongueTip.x + Math.cos(headAngle + forkAng) * forkLen},${tongueTip.y + Math.sin(headAngle + forkAng) * forkLen}`,
  ].join(' '));
  tongue.setAttribute('stroke', '#e53935');
  tongue.setAttribute('stroke-width', headR * 0.16);
  tongue.setAttribute('fill', 'none');
  tongue.setAttribute('stroke-linecap', 'round');
  g.appendChild(tongue);

  // ── Tail tip: small pointed arrow showing destination ──
  const tailAngle = Math.atan2(ty - cp2y, tx - cp2x);
  const arrowLen  = cellSize * 0.28;
  const tailArrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  tailArrow.setAttribute('d', [
    `M${tx + Math.cos(tailAngle + 2.5) * arrowLen},${ty + Math.sin(tailAngle + 2.5) * arrowLen}`,
    `L${tx},${ty}`,
    `L${tx + Math.cos(tailAngle - 2.5) * arrowLen},${ty + Math.sin(tailAngle - 2.5) * arrowLen}`,
  ].join(' '));
  tailArrow.setAttribute('stroke', pal.hi);
  tailArrow.setAttribute('stroke-width', thickness * 0.35);
  tailArrow.setAttribute('fill', 'none');
  tailArrow.setAttribute('stroke-linecap', 'round');
  tailArrow.setAttribute('stroke-linejoin', 'round');
  tailArrow.setAttribute('opacity', '0.85');
  g.appendChild(tailArrow);
}

function svgPath(d, stroke, width, linecap) {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d); p.setAttribute('stroke', stroke);
  p.setAttribute('stroke-width', width); p.setAttribute('fill', 'none');
  if (linecap) p.setAttribute('stroke-linecap', linecap);
  return p;
}
