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

async function doRevertComplete() {
  const targetChannelId = document.getElementById("admin-target").value;
  if (!targetChannelId) { setRevertResult("❌ Select a team first."); return; }

  const tileInput = document.getElementById("admin-revert-tile").value.trim();
  const tile = tileInput ? Number(tileInput) : null;

  const teamOption = document.querySelector(`#admin-target option[value="${targetChannelId}"]`);
  const teamLabel  = teamOption ? teamOption.textContent : targetChannelId;
  const tileLabel  = tile ? `tile ${tile}` : "their current tile";

  if (!confirm(`Remove the most recent completion entry for ${teamLabel} on ${tileLabel}?`)) return;

  setRevertResult("↩️ Reverting…");

  try {
    const extra  = tile ? { channel_id: targetChannelId, tile } : { channel_id: targetChannelId };
    const result = await apiCommand("revert_complete", extra);

    const el = document.getElementById("admin-revert-result");
    if (el) { el.textContent = result.message || JSON.stringify(result); el.classList.remove("hidden"); }

    addFeedEvent(result.success ? "sys" : "err", result.message || "Revert done.");
    if (result.success) refreshBoard();
  } catch (err) {
    setRevertResult("❌ " + err.message);
    addFeedEvent("err", err.message);
  }
}

function setRevertResult(text) {
  const el = document.getElementById("admin-revert-result");
  if (el) { el.textContent = text; el.classList.remove("hidden"); }
}

async function doSetPassword() {
  const targetChannelId = document.getElementById("admin-target").value;
  if (!targetChannelId) {
    const el = document.getElementById("admin-password-result");
    if (el) { el.textContent = "❌ Select a team first."; el.classList.remove("hidden"); }
    return;
  }

  const rawPassword = document.getElementById("admin-password-input").value;

  let hashHex = "";
  if (rawPassword) {
    const encoder = new TextEncoder();
    const hashBuf = await crypto.subtle.digest("SHA-256", encoder.encode(rawPassword));
    hashHex = Array.from(new Uint8Array(hashBuf))
                   .map(b => b.toString(16).padStart(2, "0"))
                   .join("");
  }

  const action = hashHex ? "set password" : "remove password";
  if (!confirm(`${action} for selected team?`)) return;

  try {
    const result = await apiCommand("set_password", {
      channel_id:           targetChannelId,
      player_password_hash: hashHex
    });
    const el = document.getElementById("admin-password-result");
    if (el) { el.textContent = result.message || JSON.stringify(result); el.classList.remove("hidden"); }
    addFeedEvent(result.success ? "sys" : "err", result.message || "Password update done.");
  } catch (err) {
    const el = document.getElementById("admin-password-result");
    if (el) { el.textContent = "❌ " + err.message; el.classList.remove("hidden"); }
    addFeedEvent("err", err.message);
  }
}
