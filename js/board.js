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
    renderCompletionsBar(data);
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

function getHotStreakTeamId() {
  const log = state.activityLog;
  if (!log || log.length < 2) return null;
  const lastId = Number(log[log.length - 1].team_id);
  let streak = 0;
  for (let i = log.length - 1; i >= 0; i--) {
    if (Number(log[i].team_id) === lastId) streak++;
    else break;
  }
  return streak >= 2 ? lastId : null;
}

function renderTeamsList(teams) {
  const el        = document.getElementById("teams-list");
  el.innerHTML    = "";
  const myId      = state.team ? Number(state.team.team_id) : null;
  const tileMap   = state.boardData?.tileContentMap || {};
  const amountMap = state.boardData?.tileAmountMap || {};
  const countsMap = state.boardData?.completionCountsByTile || {};
  const hotId     = getHotStreakTeamId();

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
    if (tid === hotId) {
      const fire = document.createElement("span");
      fire.className = "team-fire";
      fire.textContent = "🔥";
      nameEl.appendChild(fire);
    }

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
    row.addEventListener('click', () => showTeamHistory(tid, t.team_name));
    el.appendChild(row);
  });
}

function buildMiniTile(tileNum, content, teamIds = []) {
  const wrap = document.createElement('div');
  wrap.className = 'mini-tile';
  wrap.title = content ? `Tile ${tileNum}: ${content}` : `Tile ${tileNum}`;

  if (state.tileImages && content) {
    const imgPath = state.tileImages.get(content.toLowerCase().trim());
    if (imgPath) {
      const bgEl = document.createElement('div');
      bgEl.className = 'mini-tile-img';
      bgEl.style.backgroundImage = `url('${imgPath.replace(/'/g, "%27")}')`;
      wrap.appendChild(bgEl);
    }
  }

  const numEl = document.createElement('div');
  numEl.className = 'mini-tile-num';
  numEl.textContent = tileNum;
  wrap.appendChild(numEl);

  if (teamIds.length > 0) {
    const dotsEl = document.createElement('div');
    dotsEl.className = 'mini-tile-dots';
    teamIds.forEach(id => {
      const dot = document.createElement('span');
      dot.className = 'mini-tile-dot';
      dot.style.background = TEAM_COLORS[Number(id)] || '#fff';
      dotsEl.appendChild(dot);
    });
    wrap.appendChild(dotsEl);
  }

  return wrap;
}

function renderCompletionsBar(data) {
  const el = document.getElementById('completions-bar-tiles');
  if (!el) return;
  const tileContentMap = data.tileContentMap || {};

  let entries; // [{ tile, ids }] newest first

  if (state.activityLog && state.activityLog.length > 0) {
    // Use activity log for true chronological order (array is oldest→newest)
    const seen = new Set();
    entries = [];
    for (let i = state.activityLog.length - 1; i >= 0 && entries.length < 10; i--) {
      const ev = state.activityLog[i];
      const key = `${ev.tile}-${ev.team_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({ tile: ev.tile, ids: [ev.team_id] });
      }
    }
  } else {
    entries = Object.entries(data.completedByTile || {})
      .filter(([, ids]) => ids.length > 0)
      .map(([tileStr, ids]) => ({ tile: Number(tileStr), ids: ids.map(Number) }))
      .sort((a, b) => b.tile - a.tile)
      .slice(0, 10);
  }

  el.innerHTML = '';
  if (entries.length === 0) {
    const empty = document.createElement('span');
    empty.style.cssText = 'color:var(--text-muted);font-size:11px;';
    empty.textContent = 'No completions yet';
    el.appendChild(empty);
    return;
  }

  entries.forEach(({ tile, ids }) => {
    el.appendChild(buildMiniTile(tile, tileContentMap[tile] || '', ids));
  });
}

function showTeamHistory(teamId, teamName) {
  const data = state.boardData;
  if (!data) return;
  const tileContentMap = data.tileContentMap || {};

  let completed; // tile numbers, newest first

  if (state.activityLog && state.activityLog.length > 0) {
    const seen = new Set();
    completed = [];
    for (let i = state.activityLog.length - 1; i >= 0 && completed.length < 5; i--) {
      const ev = state.activityLog[i];
      if (Number(ev.team_id) === Number(teamId) && !seen.has(ev.tile)) {
        seen.add(ev.tile);
        completed.push(ev.tile);
      }
    }
  } else {
    completed = Object.entries(data.completedByTile || {})
      .filter(([, ids]) => ids.map(Number).includes(Number(teamId)))
      .map(([tileStr]) => Number(tileStr))
      .sort((a, b) => b - a)
      .slice(0, 5);
  }

  document.getElementById('team-history-name').textContent =
    `${getTeamBullet(teamId)} ${teamName}`;

  const tilesEl = document.getElementById('team-history-tiles');
  tilesEl.innerHTML = '';

  if (completed.length === 0) {
    const empty = document.createElement('span');
    empty.style.cssText = 'color:var(--text-muted);font-size:12px;';
    empty.textContent = 'No completions yet';
    tilesEl.appendChild(empty);
  } else {
    completed.forEach(tileNum => {
      const content = (tileContentMap || {})[tileNum] || '';
      tilesEl.appendChild(buildMiniTile(tileNum, content, [teamId]));
    });
  }

  document.getElementById('team-history-modal').classList.remove('hidden');
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
    playSound('assets/audio/old-armadyl-eye-spec-made-with-Voicemod.mp3');
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

  const earlyRow = document.getElementById("early-completion-row");
  if (earlyRow) {
    const showEarly = myTile > 0 && required > 1 && count < required;
    earlyRow.classList.toggle("hidden", !showEarly);
    if (!showEarly) {
      const cb = document.getElementById("early-completion-check");
      if (cb) cb.checked = false;
    }
  }
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
