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

function setBusy(btn, busy, label) {
  btn.disabled = busy;
  btn.classList.toggle("busy", busy);
  btn.textContent = label;
}

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

function showSpectatorToast() {
  let toast = document.getElementById("spectator-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "spectator-toast";
    toast.textContent = "👁 Spectator mode — watch only";
    document.body.appendChild(toast);
  }
  toast.classList.remove("spectator-toast-show");
  void toast.offsetWidth;
  toast.classList.add("spectator-toast-show");
}

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
  if (name === 'stats') renderStats();
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
    teams: ['teams-section', 'admin-section'],
    stats: ['stats-section']
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

function closeTeamHistoryModal() {
  document.getElementById('team-history-modal').classList.add('hidden');
}
