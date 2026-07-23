// ══════════════════════════════════════════════════════
//  RAT MATRIX — live "who gets ratted" probability grid
//  Mirrors pickRatVictim() in the Apps Script:
//    • flat 20% self-rat (the diagonal)
//    • remaining 80% split among OTHER teams on the board
//      (current_tile >= 1), weighted by (current_tile + 1)
//  Reads state.boardData.teams — the same live data the board polls.
// ══════════════════════════════════════════════════════

const RAT_SELF_PROBABILITY = 0.20;

// Probability that each team gets hit, given `lander` lands on a rat tile.
// Returns { [team_id]: probability } plus a self flag; null cells => team not on board.
function computeRatRow(lander, teams) {
  const others = teams.filter(t =>
    Number(t.team_id) !== Number(lander.team_id) &&
    Number(t.current_tile) >= 1
  );

  const probs = {};
  teams.forEach(t => { probs[t.team_id] = null; });

  // Lander always keeps its flat 20% self-rat chance.
  probs[lander.team_id] = RAT_SELF_PROBABILITY;

  // No eligible other team on the board -> code falls back to 100% self-rat.
  if (others.length === 0) {
    probs[lander.team_id] = 1;
    return probs;
  }

  const totalWeight = others.reduce((a, t) => a + (Number(t.current_tile) + 1), 0);
  others.forEach(t => {
    probs[t.team_id] = (1 - RAT_SELF_PROBABILITY) * ((Number(t.current_tile) + 1) / totalWeight);
  });

  return probs;
}

function _ratHeatColor(p) {
  // Amber -> red heat ramp for "risk". p in [0,1].
  const alpha = Math.min(0.9, 0.12 + p * 1.15);
  return `rgba(192, 48, 16, ${alpha.toFixed(3)})`;
}

function renderRatMatrix() {
  const body = document.getElementById('rat-matrix-body');
  if (!body) return;

  const teams = (state.boardData && Array.isArray(state.boardData.teams))
    ? state.boardData.teams
        .filter(t => t.team_id !== '' && t.team_id !== null)
        .slice()
        .sort((a, b) => Number(a.team_id) - Number(b.team_id))
    : [];

  if (teams.length === 0) {
    body.innerHTML = '<div class="rat-matrix-empty">No team data loaded yet. Give the board a moment to sync.</div>';
    return;
  }

  // Compute every row once so we can reuse for observations.
  const rows = teams.map(lander => ({ lander, probs: computeRatRow(lander, teams) }));

  // ── Legend ──
  let html = '<div class="rat-matrix-legend">';
  teams.forEach(t => {
    const onBoard = Number(t.current_tile) >= 1;
    html += `<span class="rat-legend-item">
      <span class="rat-legend-dot" style="background:${TEAM_COLORS[Number(t.team_id)] || '#fff'}"></span>
      ${_esc(t.team_name)} <span class="rat-legend-tile">${onBoard ? 'tile ' + Number(t.current_tile) : 'not on board'}</span>
    </span>`;
  });
  html += '</div>';

  // ── Table ──
  html += '<div class="rat-matrix-scroll"><table class="rat-matrix-table"><thead><tr>';
  html += '<th class="rat-corner">Hits rat ↓ / Gets hit →</th>';
  teams.forEach(t => {
    html += `<th><span class="rat-th-dot" style="background:${TEAM_COLORS[Number(t.team_id)] || '#fff'}"></span>${_esc(t.team_name)}</th>`;
  });
  html += '</tr></thead><tbody>';

  rows.forEach(({ lander, probs }) => {
    html += '<tr>';
    html += `<th class="rat-row-head"><span class="rat-th-dot" style="background:${TEAM_COLORS[Number(lander.team_id)] || '#fff'}"></span>${_esc(lander.team_name)} hits rat</th>`;
    teams.forEach(t => {
      const p = probs[t.team_id];
      const isSelf = Number(t.team_id) === Number(lander.team_id);
      if (p === null) {
        html += '<td class="rat-cell rat-cell-na">—</td>';
      } else {
        const pct = (p * 100).toFixed(2) + '%';
        const cls = 'rat-cell' + (isSelf ? ' rat-cell-self' : '');
        const bg = isSelf ? 'background:rgba(90,64,21,0.35);' : `background:${_ratHeatColor(p)};`;
        html += `<td class="${cls}" style="${bg}">${pct}</td>`;
      }
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  // ── Observations ──
  html += _buildRatObservations(teams, rows);

  body.innerHTML = html;
}

function _buildRatObservations(teams, rows) {
  const onBoard = teams.filter(t => Number(t.current_tile) >= 1);
  const offBoard = teams.filter(t => Number(t.current_tile) < 1);

  const notes = [];

  // Average chance each team is hit by OTHERS (exclude self-rat rows).
  if (onBoard.length >= 2) {
    const avgHit = {};
    onBoard.forEach(victim => {
      let sum = 0, n = 0;
      rows.forEach(({ lander, probs }) => {
        if (Number(lander.team_id) === Number(victim.team_id)) return; // skip self-rat
        const p = probs[victim.team_id];
        if (p !== null) { sum += p; n++; }
      });
      avgHit[victim.team_id] = n ? sum / n : 0;
    });

    const sorted = onBoard.slice().sort((a, b) => avgHit[b.team_id] - avgHit[a.team_id]);
    const most = sorted[0];
    const least = sorted[sorted.length - 1];

    const leader = onBoard.slice().sort((a, b) => Number(b.current_tile) - Number(a.current_tile))[0];

    notes.push(`<strong>${_esc(leader.team_name)}</strong> is furthest ahead (tile ${Number(leader.current_tile)}), giving it the heaviest weight to be targeted.`);
    notes.push(`When another team hits a rat, <strong>${_esc(most.team_name)}</strong> is the most likely victim (~${(avgHit[most.team_id] * 100).toFixed(1)}% on average).`);
    notes.push(`<strong>${_esc(least.team_name)}</strong> is the safest — lowest chance of being picked by another team.`);
  }

  notes.push(`Every landing team always keeps a fixed <strong>20%</strong> self-rat chance, regardless of position.`);

  if (offBoard.length > 0) {
    const names = offBoard.map(t => _esc(t.team_name)).join(', ');
    notes.push(`${names} ${offBoard.length === 1 ? 'is' : 'are'} still on tile 0, so ${offBoard.length === 1 ? 'it' : 'they'} cannot be ratted by other teams yet (shown as “—”).`);
  }

  let out = '<div class="rat-matrix-observations"><div class="rat-obs-title">Observations</div><ul>';
  notes.forEach(n => { out += `<li>${n}</li>`; });
  out += '</ul></div>';
  return out;
}

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Open / close ──
function openRatMatrix() {
  renderRatMatrix();
  document.getElementById('rat-matrix-modal').classList.remove('hidden');
}

function closeRatMatrix() {
  document.getElementById('rat-matrix-modal').classList.add('hidden');
}

// Re-render live while the modal is open (called from the board poll).
function renderRatMatrixIfOpen() {
  const modal = document.getElementById('rat-matrix-modal');
  if (modal && !modal.classList.contains('hidden')) renderRatMatrix();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeRatMatrix();
});
