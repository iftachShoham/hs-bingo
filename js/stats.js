// ══════════════════════════════════════════════════════
//  STATS — activity log fetch + canvas charts + leaderboard
// ══════════════════════════════════════════════════════

async function refreshActivityLog() {
  try {
    const data = await apiFetchActivityLog();
    if (!data || !Array.isArray(data.events)) return;

    const newLen = data.events.length;
    const oldLen = state.activityLog?.length ?? -1;

    // Nothing changed — skip all rendering work
    if (newLen === oldLen) return;

    state.activityLog = data.events;

    if (state.boardData) renderCompletionsBar(state.boardData);
    renderStats();
    renderEventsOverview();
  } catch (e) {
    console.warn('[activity-log]', e.message);
  }
}

function renderStats() {
  renderCompletionsPerDayChart();
  renderRunningTotalChart();
  renderPlayerLeaderboard();
  renderChartLegend();
}

// ── Helpers ──────────────────────────────────────────

function _canvasSetup(canvas, h) {
  const dpr = window.devicePixelRatio || 1;
  // Subtract 2 to account for 1px border on each side, preventing overflow
  const W   = Math.max(0, Math.floor(canvas.parentElement.getBoundingClientRect().width) - 2);
  if (W < 20) return null; // canvas is hidden or not yet laid out
  canvas.width        = W * dpr;
  canvas.height       = h * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#0d0a04';
  ctx.fillRect(0, 0, W, h);
  return { ctx, W, H: h };
}

function _drawGrid(ctx, ml, mr, mt, mb, W, H, maxVal) {
  const chartW = W - ml - mr;
  const chartH = H - mt - mb;
  const steps  = Math.min(maxVal, 5);
  ctx.strokeStyle = 'rgba(90,64,21,0.35)';
  ctx.lineWidth   = 0.5;
  for (let i = 0; i <= steps; i++) {
    const y = mt + chartH - (i / steps) * chartH;
    ctx.beginPath();
    ctx.moveTo(ml, y);
    ctx.lineTo(ml + chartW, y);
    ctx.stroke();
    ctx.fillStyle   = '#4a3010';
    ctx.font        = '9px sans-serif';
    ctx.textAlign   = 'right';
    ctx.fillText(Math.round((i / steps) * maxVal), ml - 3, y + 3);
  }
  return { chartW, chartH };
}

function _noData(ctx, W, H) {
  ctx.fillStyle = '#4a3010';
  ctx.font      = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('No data yet', W / 2, H / 2 + 4);
}

// ── Chart Zoom Modal ──────────────────────────────────

function openChartModal(type) {
  const modal    = document.getElementById('chart-modal');
  const titleEl  = document.getElementById('chart-modal-title');
  const canvas   = document.getElementById('chart-modal-canvas');
  const legendEl = document.getElementById('chart-modal-legend');

  titleEl.textContent = type === 'per-day' ? 'Completions per Day' : 'Cumulative Completions';

  const teams     = (state.boardData?.teams) || [];
  const teamNames = {};
  teams.forEach(t => { teamNames[Number(t.team_id)] = t.team_name; });
  legendEl.innerHTML = '';
  [1, 2, 3, 4].forEach(id => {
    const item   = document.createElement('span');
    item.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = TEAM_COLORS[id];
    const label = document.createElement('span');
    label.textContent = teamNames[id] || `Team ${id}`;
    item.appendChild(swatch);
    item.appendChild(label);
    legendEl.appendChild(item);
  });

  modal.classList.remove('hidden');

  requestAnimationFrame(() => {
    if (type === 'per-day') renderCompletionsPerDayChart(canvas, 340);
    else renderRunningTotalChart(canvas, 300);
  });
}

function closeChartModal() {
  document.getElementById('chart-modal').classList.add('hidden');
}

// ── Completions per Day — grouped bar chart ───────────

function renderCompletionsPerDayChart(targetCanvas, targetHeight) {
  const canvas = targetCanvas || document.getElementById('chart-per-day');
  if (!canvas) return;
  const setup = _canvasSetup(canvas, targetHeight || 170);
  if (!setup) return;
  const { ctx, W, H } = setup;

  const events = state.activityLog || [];
  if (events.length === 0) { _noData(ctx, W, H); return; }

  // Group by date + team
  const byDate = {};
  events.forEach(ev => {
    if (!ev.timestamp) return;
    const date = ev.timestamp.substring(0, 10);
    if (!byDate[date]) byDate[date] = { 1: 0, 2: 0, 3: 0, 4: 0 };
    byDate[date][ev.team_id] = (byDate[date][ev.team_id] || 0) + 1;
  });

  const dates  = Object.keys(byDate).sort();
  const maxVal = Math.max(1, ...dates.flatMap(d => [1,2,3,4].map(id => byDate[d][id] || 0)));

  const ml = 28, mr = 8, mt = 12, mb = 28;
  const { chartW, chartH } = _drawGrid(ctx, ml, mr, mt, mb, W, H, maxVal);

  // Bars
  const groupW    = chartW / dates.length;
  const innerPad  = Math.max(2, groupW * 0.08);
  const totalBarW = groupW - innerPad * 2;
  const barGap    = 1;
  const barW      = Math.max(2, (totalBarW - barGap * 3) / 4);

  dates.forEach((date, di) => {
    const gx = ml + di * groupW + innerPad;
    [1, 2, 3, 4].forEach((id, ti) => {
      const val = byDate[date][id] || 0;
      if (val === 0) return;
      const bh = (val / maxVal) * chartH;
      const bx = gx + ti * (barW + barGap);
      ctx.fillStyle = TEAM_COLORS[id];
      ctx.fillRect(bx, mt + chartH - bh, barW, bh);
    });

    // Date label
    const d     = new Date(date + 'T12:00:00');
    const label = d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
    ctx.fillStyle   = '#907040';
    ctx.font        = '8px sans-serif';
    ctx.textAlign   = 'center';
    ctx.fillText(label, ml + di * groupW + groupW / 2, H - 4);
  });
}

// ── Cumulative completions — line chart ───────────────

function renderRunningTotalChart(targetCanvas, targetHeight) {
  const canvas = targetCanvas || document.getElementById('chart-running');
  if (!canvas) return;
  const setup = _canvasSetup(canvas, targetHeight || 150);
  if (!setup) return;
  const { ctx, W, H } = setup;

  const events = (state.activityLog || []).slice()
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  if (events.length === 0) { _noData(ctx, W, H); return; }

  const ml = 28, mr = 8, mt = 12, mb = 14;

  // Build cumulative series per team
  const cum    = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const series = { 1: [], 2: [], 3: [], 4: [] };
  const t0     = new Date(events[0].timestamp).getTime();
  const t1     = new Date(events[events.length - 1].timestamp).getTime();
  const tSpan  = t1 - t0 || 1;

  [1,2,3,4].forEach(id => series[id].push({ x: 0, y: 0 }));
  events.forEach(ev => {
    cum[ev.team_id]++;
    const x = (new Date(ev.timestamp).getTime() - t0) / tSpan;
    series[ev.team_id].push({ x, y: cum[ev.team_id] });
  });

  const maxVal    = Math.max(1, ...Object.values(cum));
  const { chartW, chartH } = _drawGrid(ctx, ml, mr, mt, mb, W, H, maxVal);

  // Lines
  [1, 2, 3, 4].forEach(id => {
    const pts = series[id];
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = TEAM_COLORS[id];
    ctx.lineWidth   = 1.8;
    ctx.lineJoin    = 'round';
    pts.forEach(({ x, y }, i) => {
      const px = ml + x * chartW;
      const py = mt + chartH - (y / maxVal) * chartH;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke();
    // Endpoint dot
    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.fillStyle = TEAM_COLORS[id];
    ctx.arc(ml + last.x * chartW, mt + chartH - (last.y / maxVal) * chartH, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ── Chart legend (HTML, shared by both charts) ────────

function renderChartLegend() {
  const el = document.getElementById('chart-legend');
  if (!el) return;
  const teams     = state.boardData?.teams || [];
  const teamNames = {};
  teams.forEach(t => { teamNames[Number(t.team_id)] = t.team_name; });

  el.innerHTML = '';
  [1, 2, 3, 4].forEach(id => {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = TEAM_COLORS[id];
    const label = document.createElement('span');
    label.textContent = teamNames[id] || `Team ${id}`;
    item.appendChild(swatch);
    item.appendChild(label);
    el.appendChild(item);
  });
}

// ── Team tile completions leaderboard ─────────────────

function renderPlayerLeaderboard() {
  const el = document.getElementById('player-leaderboard');
  if (!el) return;

  const completedByTile = state.boardData?.completedByTile || {};
  const teams = state.boardData?.teams || [];
  const teamNames = {};
  teams.forEach(t => { teamNames[Number(t.team_id)] = t.team_name; });

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  Object.values(completedByTile).forEach(ids => {
    ids.forEach(id => {
      const tid = Number(id);
      if (counts[tid] !== undefined) counts[tid]++;
    });
  });

  const rows = [1, 2, 3, 4]
    .map(id => ({ id, count: counts[id], name: teamNames[id] || `Team ${id}` }))
    .sort((a, b) => b.count - a.count);

  el.innerHTML = '';

  rows.forEach(({ id, count, name }) => {
    const row = document.createElement('div');
    row.className = 'lb-row';

    const bullet = document.createElement('span');
    bullet.className = 'lb-medal';
    bullet.textContent = getTeamBullet(id);
    bullet.style.color = TEAM_COLORS[id];

    const nameEl = document.createElement('span');
    nameEl.className = 'lb-name';
    nameEl.textContent = name;

    const cnt = document.createElement('span');
    cnt.className = 'lb-count';
    cnt.textContent = `${count}`;

    row.appendChild(bullet);
    row.appendChild(nameEl);
    row.appendChild(cnt);
    el.appendChild(row);
  });
}

// ── Redraw charts on resize (debounced) ───────────────

let _statsResizeTimer = null;
window.addEventListener('resize', () => {
  if (state.activeTab !== 'stats' || !state.activityLog) return;
  clearTimeout(_statsResizeTimer);
  _statsResizeTimer = setTimeout(renderStats, 120);
});

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeChartModal();
});
