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
  const saved    = localStorage.getItem("hs_cid");
  const savedPwh = localStorage.getItem("hs_pwh");
  if (saved) {
    document.getElementById("team-code-input").value = saved;
    if (savedPwh) state.playerPasswordHash = savedPwh;
    login();
  }
});
