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
    if (e.key === "Escape") { closeTileModal(); closeTeamHistoryModal(); cancelReroll(); document.getElementById("reroll-help-popup")?.classList.add("hidden"); document.getElementById("pet-reroll-help-popup")?.classList.add("hidden"); }
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

  // Pause polling when tab is hidden; resume immediately when user comes back
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearInterval(state.pollTimer);
      clearInterval(state.activityPollTimer);
      state.pollTimer = null;
      state.activityPollTimer = null;
    } else if (state.channelId) {
      // Tab is visible again and user is logged in — fetch right away, then restart intervals
      refreshBoard();
      refreshActivityLog();
      state.pollTimer = setInterval(refreshBoard, 10000);
      state.activityPollTimer = setInterval(refreshActivityLog, 30000);
    }
  });

  // Auto-login from localStorage
  const saved    = localStorage.getItem("hs_cid");
  const savedPwh = localStorage.getItem("hs_pwh");
  if (saved) {
    document.getElementById("team-code-input").value = saved;
    if (savedPwh) state.playerPasswordHash = savedPwh;
    login();
  }
});
