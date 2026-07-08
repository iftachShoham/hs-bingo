// ══════════════════════════════════════════════════════
//  PLAYER ACTIONS
// ══════════════════════════════════════════════════════

async function doRoll() {
  // If reroll checkbox is ticked, show confirmation modal instead of rolling
  const rerollCheck = document.getElementById("reroll-check");
  if (rerollCheck && rerollCheck.checked) {
    showRerollConfirmModal();
    return;
  }

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
      if (msg.includes("snake")) {
        showBoardGif("assets/gifs/snake-dance.gif");
      } else if (msg.includes("rat") && result.result?.rat_result) {
        clearInterval(state.pollTimer);
        state.pollTimer = null;
        await spinWheelForRat(result.result.rat_result);
        showBoardGif("assets/gifs/rat-dance.gif");
        state.pollTimer = setInterval(refreshBoard, 6000);
      } else if (msg.includes("rat")) {
        showBoardGif("assets/gifs/rat-dance.gif");
      }

      // Post combined roll message + tile image to the team's Discord webhook.
      // result.result.tile_content is available immediately — no need to wait for refreshBoard.
      if (!state.isAdmin && state.team) {
        const teamData = state.boardData?.teams?.find(
          t => Number(t.team_id) === Number(state.team.team_id)
        );
        const webhookUrl = teamData?.webhook_url;
        // Bug 4 fix: for self-rat the team was moved backward — show the image of where they ended up
        const ratResult = result.result?.rat_result;
        if (webhookUrl) {
          const tileContent = (ratResult?.self_rat)
            ? ratResult.victim_tile_content
            : result.result?.tile_content;
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

        // Bug 1 fix: notify the victim team's Discord channel when ratted (non-self-rat)
        if (ratResult && !ratResult.self_rat && ratResult.victim_notification?.message) {
          const victimTeamData = state.boardData?.teams?.find(
            t => Number(t.team_id) === Number(ratResult.victim_team_id)
          );
          const victimWebhookUrl = victimTeamData?.webhook_url;
          if (victimWebhookUrl) {
            const victimTileContent = ratResult.victim_tile_content;
            const victimImgPath = victimTileContent && state.tileImages
              ? state.tileImages.get(victimTileContent.toLowerCase().trim())
              : null;
            const victimPayload = { content: ratResult.victim_notification.message };
            if (victimImgPath) victimPayload.embeds = [{ image: { url: new URL(victimImgPath, window.location.href).href } }];
            fetch(victimWebhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(victimPayload)
            }).catch(() => {});
          }
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

function spinWheelForRat(ratResult) {
  return new Promise(resolve => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      _showRatWheelResult(ratResult);
      setTimeout(resolve, 2500);
      return;
    }

    const overlay    = document.getElementById("rat-wheel-overlay");
    const canvas     = document.getElementById("rat-wheel-canvas");
    const ctx        = canvas.getContext("2d");
    const reveal     = document.getElementById("rat-wheel-reveal");
    const dismissBtn = document.getElementById("rat-wheel-dismiss-btn");

    reveal.classList.add("hidden");
    dismissBtn.style.display = "none";
    overlay.classList.remove("hidden");

    const teams = (state.boardData?.teams || []).filter(t => Number(t.current_tile) >= 0);
    if (teams.length === 0) {
      _showRatWheelResult(ratResult);
      setTimeout(resolve, 2500);
      return;
    }

    const segmentCount = teams.length;
    const segmentAngle = (2 * Math.PI) / segmentCount;

    const victimIndex = teams.findIndex(t => Number(t.team_id) === Number(ratResult.victim_team_id));
    const targetSegmentIndex = victimIndex >= 0 ? victimIndex : 0;

    function drawWheel(rotationOffset) {
      const cx = canvas.width  / 2;
      const cy = canvas.height / 2;
      const r  = cx - 4;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      teams.forEach((team, i) => {
        const startAngle = rotationOffset + i * segmentAngle - Math.PI / 2;
        const endAngle   = startAngle + segmentAngle;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, startAngle, endAngle);
        ctx.closePath();
        ctx.fillStyle = TEAM_COLORS[Number(team.team_id)] || "#555";
        ctx.fill();
        ctx.strokeStyle = "#1a1a2e";
        ctx.lineWidth = 2;
        ctx.stroke();

        const midAngle = startAngle + segmentAngle / 2;
        const labelR   = r * 0.65;
        const tx = cx + Math.cos(midAngle) * labelR;
        const ty = cy + Math.sin(midAngle) * labelR;
        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(midAngle + Math.PI / 2);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(getTeamBullet(team.team_id), 0, 0);
        ctx.restore();
      });

      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, 2 * Math.PI);
      ctx.fillStyle = "#1a1a2e";
      ctx.fill();
      ctx.strokeStyle = "#c8a84b";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    const finalOffset   = -(targetSegmentIndex * segmentAngle + segmentAngle / 2);
    const totalRotation = finalOffset - 5 * 2 * Math.PI;

    const SPIN_DURATION_MS = 3500;
    const startTime = performance.now();

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    function animate(now) {
      const elapsed  = now - startTime;
      const progress = Math.min(elapsed / SPIN_DURATION_MS, 1);
      const eased    = easeOutCubic(progress);

      drawWheel(totalRotation * eased);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        drawWheel(finalOffset);
        setTimeout(() => {
          _showRatWheelResult(ratResult);
          dismissBtn.style.display = "";
          setTimeout(() => { dismissRatWheel(); resolve(); }, 4000);
        }, 400);
      }
    }

    drawWheel(0);
    requestAnimationFrame(animate);
  });
}

function _showRatWheelResult(ratResult) {
  const reveal   = document.getElementById("rat-wheel-reveal");
  const nameEl   = document.getElementById("rat-wheel-victim-name");
  const detailEl = document.getElementById("rat-wheel-victim-detail");

  if (ratResult.self_rat) {
    nameEl.textContent   = `😱 ${ratResult.victim_team_name}`;
    detailEl.textContent = "You ratted yourselves! Rolled " + ratResult.die_roll +
      " backwards: " + ratResult.victim_from + " → " + ratResult.victim_to;
  } else {
    nameEl.textContent   = `🐀 ${ratResult.victim_team_name} got ratted!`;
    detailEl.textContent = "Rolled " + ratResult.die_roll +
      " backwards: " + ratResult.victim_from + " → " + ratResult.victim_to;
  }

  reveal.classList.remove("hidden");
}

function dismissRatWheel() {
  document.getElementById("rat-wheel-overlay").classList.add("hidden");
}

async function doComplete() {
  // Pet mechanic: if "use as reroll" is ticked, gain a reroll instead of completing
  const petCheck = document.getElementById("pet-reroll-check");
  if (petCheck && petCheck.checked) {
    petCheck.checked = false;
    await doRerollGain();
    return;  // tile completion does NOT happen
  }

  const proofUrl = document.getElementById("proof-url").value.trim();
  const hasFile  = !!state.proofFile;

  if (!hasFile && !proofUrl) {
    setCompleteResult("❌ Add a photo or paste a proof URL first.");
    return;
  }

  const isEarlyCompletion = document.getElementById("early-completion-check")?.checked === true;

  const btn = document.getElementById("btn-complete");
  setBusy(btn, true, "✅ Submitting…");
  setCompleteResult("✅ Submitting…");

  try {
    let finalUrl = proofUrl;

    if (hasFile) {
      setCompleteResult("📤 Uploading image…");
      finalUrl = await uploadProofImage(state.proofFile);
    }

    const result = await apiCommand("complete", {
      proof_url:        finalUrl,
      username:         state.playerName || "",
      early_completion: isEarlyCompletion
    });
    setCompleteResult(result.message || JSON.stringify(result));

    addFeedEvent(result.success ? "ok" : "err", result.message || "Complete done.");

    if (result.success) {
      playSound('assets/audio/task_completed.mp3');
      clearProof();
      document.getElementById("proof-url").value = "";
      const cb = document.getElementById("early-completion-check");
      if (cb) cb.checked = false;
      if (isEarlyCompletion) {
        setCompleteResult("🏆 Early completion! Tile fully completed — you can roll!");
      }
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

// ── Reroll: pet mechanic — gain a reroll instead of completing the tile ──

async function doRerollGain() {
  const btn = document.getElementById("btn-complete");
  setBusy(btn, true, "⏪ Gaining reroll…");
  setCompleteResult("⏪ Converting tile to reroll…");
  try {
    const extra = !state.isAdmin ? { source: "web-client" } : {};
    const result = await apiCommand("reroll_gain", { username: state.playerName || "", ...extra });
    setCompleteResult(result.message || JSON.stringify(result));
    addFeedEvent(result.success ? "ok" : "err", result.message || "Rollback gained.");
    if (result.success) {
      if (!state.isAdmin && state.team) {
        const teamData = state.boardData?.teams?.find(
          t => Number(t.team_id) === Number(state.team.team_id)
        );
        const webhookUrl = teamData?.webhook_url;
        if (webhookUrl) {
          const credit = state.playerName ? ` *(${state.playerName} via web)*` : " *(via web)*";
          fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: (result.message || "") + credit })
          }).catch(() => {});
        }
      }
      await refreshBoard();
    }
  } catch (err) {
    setCompleteResult("❌ " + err.message);
    addFeedEvent("err", err.message);
  } finally {
    setBusy(btn, false, "✅ Complete Task");
  }
}

// ── Reroll: spend a reroll — show modal, then execute ──

function showRerollConfirmModal() {
  const myTeam = state.boardData?.teams?.find(
    t => Number(t.team_id) === Number(state.team?.team_id)
  );
  const rerollsUsed  = myTeam?.rerolls_used  || 0;
  const rerollsAvail = myTeam?.rerolls_available || 0;

  // Guard against stale UI state
  if (rerollsAvail < 1) {
    const rc = document.getElementById("reroll-check");
    if (rc) { rc.checked = false; rc.disabled = true; }
    setRollResult("❌ No rollbacks available.");
    updateRerollUI();
    return;
  }

  let explanation;
  if (rerollsUsed === 0) {
    explanation = "1st rollback: you will move <strong>backwards 1–3 tiles</strong> (random).";
  } else if (rerollsUsed === 1) {
    explanation = "2nd rollback: you will roll a <strong>d6 backwards</strong> (1–6 tiles).";
  } else {
    explanation = `${rerollsUsed + 1}th rollback: roll two d6, move back by the <strong>higher result</strong> (worst of two dice).`;
  }

  document.getElementById("reroll-modal-body").innerHTML =
    `<p><strong>Rollbacks available:</strong> ${rerollsAvail}</p>` +
    `<p><strong>Rollbacks used so far:</strong> ${rerollsUsed}</p>` +
    `<p class="reroll-modal-rule">${explanation}</p>` +
    `<p class="reroll-modal-warning">⚠️ Your team will move backwards. This cannot be undone.</p>`;

  document.getElementById("reroll-modal").classList.remove("hidden");
}

function cancelReroll() {
  document.getElementById("reroll-modal").classList.add("hidden");
}

async function confirmReroll() {
  document.getElementById("reroll-modal").classList.add("hidden");
  const btn = document.getElementById("btn-roll");
  setBusy(btn, true, "⏪ Rolling back…");
  setRollResult("⏪ Using rollback…");
  try {
    const result = await apiCommand("roll", { use_reroll: true, source: "web-client" });
    setRollResult(result.message || JSON.stringify(result));
    addFeedEvent(result.success ? "ok" : "err", result.message || "Rollback done.");
    if (result.success) {
      const rc = document.getElementById("reroll-check");
      if (rc) rc.checked = false;

      if (!state.isAdmin && state.team) {
        const teamData = state.boardData?.teams?.find(
          t => Number(t.team_id) === Number(state.team.team_id)
        );
        const webhookUrl = teamData?.webhook_url;
        if (webhookUrl) {
          const credit = state.playerName ? ` *(${state.playerName} via web)*` : " *(via web)*";
          fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: (result.message || "") + credit })
          }).catch(() => {});
        }
      }

      await refreshBoard();
    }
  } catch (err) {
    setRollResult("❌ " + err.message);
    addFeedEvent("err", err.message);
  } finally {
    setBusy(btn, false, "🎲 Roll Dice");
  }
}

function onEarlyCompletionChange() {
  const ec = document.getElementById("early-completion-check");
  if (ec?.checked) {
    const pr = document.getElementById("pet-reroll-check");
    if (pr) pr.checked = false;
  }
}

function onPetRerollChange() {
  const pr = document.getElementById("pet-reroll-check");
  if (pr?.checked) {
    const ec = document.getElementById("early-completion-check");
    if (ec) ec.checked = false;
  }
}

function onRerollCheckChange() {
  const myTeam = state.boardData?.teams?.find(
    t => Number(t.team_id) === Number(state.team?.team_id)
  );
  const available = myTeam?.rerolls_available || 0;
  const rc = document.getElementById("reroll-check");
  if (rc?.checked && available < 1) {
    rc.checked = false;
  }
}

function toggleRerollHelp(e) {
  e.preventDefault();
  e.stopPropagation();
  const popup = document.getElementById("reroll-help-popup");
  if (popup) popup.classList.toggle("hidden");
}

function togglePetRerollHelp(e) {
  e.preventDefault();
  e.stopPropagation();
  const popup = document.getElementById("pet-reroll-help-popup");
  if (popup) popup.classList.toggle("hidden");
}

// Close help popups when clicking outside
document.addEventListener("click", (e) => {
  const pairs = [
    ["reroll-help-popup", "reroll-toggle-row"],
    ["pet-reroll-help-popup", "pet-reroll-row"],
  ];
  for (const [popupId, rowId] of pairs) {
    const popup = document.getElementById(popupId);
    if (!popup || popup.classList.contains("hidden")) continue;
    const row = document.getElementById(rowId);
    if (row && !row.contains(e.target)) popup.classList.add("hidden");
  }
});
