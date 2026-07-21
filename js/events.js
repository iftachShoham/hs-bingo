// ══════════════════════════════════════════════════════
//  EVENTS — snake bite + rat trigger overview
//  Reads state.activityLog (same data as the Stats tab).
// ══════════════════════════════════════════════════════

function _teamNameMap() {
  const map = {};
  (state.boardData?.teams || []).forEach(t => {
    map[Number(t.team_id)] = t.team_name;
  });
  return map;
}

function _teamPill(id, name) {
  const color = TEAM_COLORS[Number(id)] || '#888';
  const label = name || (`Team ${id}`);
  return `<span class="ev-pill" style="background:${color};">${getTeamBullet(id)} ${label}</span>`;
}

// "18-7-2026 10:03:19"  →  "18 Jul, 10:03"
function _fmtTime(ts) {
  if (!ts) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // ISO first (endpoint may return either format)
  let d = new Date(ts);
  if (isNaN(d)) {
    const m = ts.match(/(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (m) d = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
  }
  if (isNaN(d)) return ts;
  const day = d.getDate();
  const hh  = String(d.getHours()).padStart(2, '0');
  const mm  = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${months[d.getMonth()]}, ${hh}:${mm}`;
}

function renderEventsOverview() {
  const host = document.getElementById('events-overview');
  if (!host) return;

  const log = state.activityLog;
  if (!log || !log.length) {
    host.innerHTML = `<p class="ev-empty">No events yet — no snakes bitten and no rats sprung.</p>`;
    return;
  }

  const names = _teamNameMap();

  // ── Snake bites ──
  // A snake bite is a ROLL whose details mention a snake and whose to_tile < from_tile.
  const snakes = log
    .filter(ev => ev.event_type === 'ROLL'
              && /snake/i.test(ev.details || '')
              && Number(ev.to_tile) < Number(ev.from_tile))
    .map(ev => {
      // details like "🐍 Snake bite! 16 → 6" carries the true head tile
      const m = (ev.details || '').match(/(\d+)\s*[→\-]+>?\s*(\d+)/);
      const head = m ? +m[1] : Number(ev.from_tile);
      const tail = m ? +m[2] : Number(ev.to_tile);
      return { ts: ev.timestamp, id: ev.team_id, name: names[Number(ev.team_id)] || ev.team_name,
               head, tail, lost: head - tail };
    });

  // ── Rat triggers ── pair each RAT_TRIGGERED with its RAT_VICTIM row.
  const rats = log
    .filter(ev => ev.event_type === 'RAT_TRIGGERED')
    .map(trig => {
      const victim = log.find(v => v.event_type === 'RAT_VICTIM'
                                && v.timestamp === trig.timestamp);
      return {
        ts: trig.timestamp,
        ratTile: Number(trig.to_tile),
        causerId: trig.team_id,
        causerName: names[Number(trig.team_id)] || trig.team_name,
        victimId: victim ? victim.team_id : null,
        victimName: victim ? (names[Number(victim.team_id)] || victim.team_name) : '?',
        from: victim ? Number(victim.from_tile) : null,
        to: victim ? Number(victim.to_tile) : null
      };
    });

  let html = '';

  // Snakes
  html += `<div class="ev-group-title">🐍 Snake bites <span class="ev-count">${snakes.length}</span></div>`;
  if (!snakes.length) {
    html += `<p class="ev-empty">None yet.</p>`;
  } else {
    snakes.forEach(s => {
      html += `
        <div class="ev-card ev-snake">
          <div class="ev-card-top">
            <span class="ev-time">${_fmtTime(s.ts)}</span>
            <span class="ev-badge ev-badge-snake">−${s.lost} tiles</span>
          </div>
          <div class="ev-card-body">
            ${_teamPill(s.id, s.name)}
            <span class="ev-move">tile <b>${s.head}</b> → tile <b>${s.tail}</b></span>
          </div>
        </div>`;
    });
  }

  // Rats
  html += `<div class="ev-group-title" style="margin-top:14px;">🐀 Rat triggers <span class="ev-count">${rats.length}</span></div>`;
  if (!rats.length) {
    html += `<p class="ev-empty">None yet.</p>`;
  } else {
    rats.forEach(r => {
      const back = (r.from != null && r.to != null) ? `${r.from} → ${r.to}` : '';
      html += `
        <div class="ev-card ev-rat">
          <div class="ev-card-top">
            <span class="ev-time">${_fmtTime(r.ts)}</span>
            <span class="ev-badge ev-badge-rat">rat tile ${r.ratTile}</span>
          </div>
          <div class="ev-card-body ev-rat-body">
            ${_teamPill(r.causerId, r.causerName)}
            <span class="ev-arrow">triggered →</span>
            ${_teamPill(r.victimId, r.victimName)}
            ${back ? `<span class="ev-move">${back}</span>` : ''}
          </div>
        </div>`;
    });
  }

  host.innerHTML = html;
}

// Keep the tab live when new events arrive on the 6-second poll.
function refreshEventsOverviewIfActive() {
  if (state.activeTab === 'events') renderEventsOverview();
}
