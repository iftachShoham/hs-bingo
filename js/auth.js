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
      state.isSpectator = false;
      state.team       = null;
      state.playerName = playerName || null;
      localStorage.setItem("hs_cid", code);
      if (playerName) localStorage.setItem("hs_player", playerName);
      enterGame();
      return;
    }

    // Spectator shortcut — read-only ghost mode, no server lookup needed
    if (code === CONFIG.SPECTATOR_CODE) {
      state.channelId   = code;
      state.isSpectator = true;
      state.isAdmin     = false;
      state.team        = null;
      state.playerName  = playerName || null;
      // Not persisted to localStorage — spectators must re-enter each session
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

    // Password check: skip if auto-login already pre-set the verified hash
    if (match.player_password_hash && match.player_password_hash !== "") {
      if (state.playerPasswordHash && state.playerPasswordHash === match.player_password_hash) {
        // Hash already verified from localStorage — skip re-prompt
      } else {
        const passwordInput = document.getElementById("player-password-input");
        const passwordValue = passwordInput ? passwordInput.value : "";

        if (!passwordValue) {
          if (passwordInput) passwordInput.focus();
          showLoginError("This team requires a password. Enter it and try again.");
          return;
        }

        const encoder = new TextEncoder();
        const hashBuf = await crypto.subtle.digest("SHA-256", encoder.encode(passwordValue));
        const hashHex = Array.from(new Uint8Array(hashBuf))
                            .map(b => b.toString(16).padStart(2, "0"))
                            .join("");

        if (hashHex !== match.player_password_hash) {
          showLoginError("Incorrect password. Try again.");
          return;
        }

        state.playerPasswordHash = hashHex;
        localStorage.setItem("hs_pwh", hashHex);
      }
    } else {
      state.playerPasswordHash = null;
      localStorage.removeItem("hs_pwh");
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
  clearInterval(state.activityPollTimer);
  Object.assign(state, { channelId: null, team: null, isAdmin: false, isSpectator: false, boardData: null, pollTimer: null, playerName: null, proofFile: null, prevTaskContent: null, playerPasswordHash: null, activityLog: null, activityPollTimer: null, boardFailCount: 0 });
  localStorage.removeItem("hs_cid");
  localStorage.removeItem("hs_pwh");
  document.getElementById("game-screen").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("team-code-input").value = "";
  document.getElementById("roll-result").classList.add("hidden");
  document.getElementById("complete-result").classList.add("hidden");
  // Reset reroll UI
  const rc = document.getElementById("reroll-check");
  if (rc) { rc.checked = false; rc.disabled = false; }
  const pc = document.getElementById("pet-reroll-check");
  if (pc) { pc.checked = false; pc.disabled = false; }
  document.getElementById("reroll-modal")?.classList.add("hidden");
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
  } else if (state.isSpectator) {
    nameBadge.textContent    = state.playerName ? `👁 ${state.playerName}` : "👁 Spectator";
    nameBadge.style.borderColor = "#888";
  } else {
    const nameLabel = state.playerName ? ` · ${state.playerName}` : "";
    nameBadge.textContent    = `${getTeamBullet(state.team.team_id)} ${state.team.team_name}${nameLabel}`;
    nameBadge.style.borderColor = TEAM_COLORS[state.team.team_id] || "#555";
  }

  const roleLabel = state.isAdmin ? "Game Master" : state.isSpectator ? "Spectator" : state.team.team_name;
  const whoLabel = state.playerName ? `${state.playerName} (${roleLabel})` : roleLabel;
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

  // Load tile images once, then kick off polling.
  // Jitter spreads clients across the interval so they don't all hit Apps Script simultaneously.
  loadTileImages().then(() => {
    refreshBoard().then(() => {
      const jitter = Math.random() * 1000 - 500; // ±500ms
      state.pollTimer = setInterval(refreshBoard, 10000 + jitter);
    });
  });

  // Activity log: initial fetch + 30s poll (with jitter)
  refreshActivityLog();
  const logJitter = Math.random() * 2000 - 1000; // ±1s
  state.activityPollTimer = setInterval(refreshActivityLog, 30000 + logJitter);
}
