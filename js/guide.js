// ── How to Play Guide ──

const TOUR_STEPS = [
  {
    targetId: 'side-panel',
    mobileTab: 'play',
    cardPos: 'center',
    title: 'The Right Panel — Your Control Centre',
    body: 'The panel on the right is where all gameplay actions happen. It is divided into sections: your current task, dice rolling, task completion, team standings, and statistics. Everything you need to play is here.'
  },
  {
    targetId: 'task-section',
    mobileTab: 'play',
    cardPos: 'center',
    title: '📍 Current Task',
    body: 'This shows your team\'s current tile number and the task you need to complete. The status line shows your progress — <em>"1 / 3 completions"</em> means you need to submit valid proof 3 times to fully clear this tile.'
  },
  {
    targetId: 'roll-section',
    mobileTab: 'play',
    cardPos: 'center',
    title: '🎲 Roll Dice',
    body: 'Roll to move forward on the board. You roll <strong>when first joining</strong> to get onto the board, and again <strong>after completing a task</strong> to advance. Click the purple Roll Dice button — the result appears below it.'
  },
  {
    targetId: 'complete-section',
    mobileTab: 'play',
    cardPos: 'center',
    title: '✅ Complete a Task',
    body: 'Submit proof of completion here. Click the <strong>📷 Photo / File button</strong> to upload an image, paste a <strong>direct image URL</strong> into the field, or drag-and-drop a file onto the dashed area. A preview appears — then hit the green <strong>Complete</strong> button.'
  },
  {
    targetId: 'complete-section',
    mobileTab: 'play',
    cardPos: 'center',
    title: '⚡ Early Completion',
    body: 'Some tiles require multiple qualifying drops, while some can be completed early by obtaining a specific big drop or multiple smaller drops. For example, a tile requiring 10 Dagannoth Rings or a pet can be completed immediately if you obtain the pet — simply tick the <strong>Early Completion</strong> checkbox before submitting.<br><br><strong>Important:</strong> Pets are single-use. If a pet is used for Early Completion, it cannot also be claimed as a Pet Reroll.'
  },
  {
    targetId: 'reroll-toggle-row',
    mobileTab: 'play',
    cardPos: 'center',
    title: '⏪ Rollback — Move Backwards',
    body: 'If your team is stuck on a tile, you can use a <strong>Rollback</strong> to move backwards and land somewhere new instead.<br><br>'
      + 'Tick the <strong>⏪ Rollback checkbox</strong> on the left side of the Roll Dice section, then click Roll — you will move <em>backwards</em> rather than forwards. A confirmation dialog appears before the move is committed.<br><br>'
      + 'The <strong>gold badge</strong> next to the checkbox shows how many rollback charges your team currently has.'
  },
  {
    targetId: 'pet-reroll-row',
    mobileTab: 'play',
    cardPos: 'center',
    title: '🐾 Earning Rollbacks',
    body: 'There are two ways to earn rollback charges:<br><br>'
      + '<strong>1. Pass Tile 40</strong> — your team automatically receives 1 free rollback charge when you advance past tile 40.<br><br>'
      + '<strong>2. Trade a Pet</strong> — if you obtained a pet while working on the current tile, tick <em>"Trade pet for Rollback"</em> and click <strong>Complete Task</strong> as normal. The tile will <strong>not</strong> be marked complete — your rollback count increases by 1 instead.<br><br>'
      + 'A pet can only serve one purpose: tile completion <em>or</em> rollback credit — not both.'
  },
  {
    targetId: 'teams-section',
    mobileTab: 'teams',
    cardPos: 'center',
    title: '🏆 All Teams',
    body: 'See every team\'s current tile and progress at a glance. The <strong>⚡ Recent Completions</strong> bar at the top shows the latest tiles finished across all teams. Click any team row to open their full completion history with proof images.'
  },
  {
    targetId: 'board-wrapper',
    mobileTab: 'board',
    cardPos: 'right',
    title: '🗺️ The Board — Snakes &amp; Rats',
    body: 'The 10×10 board has special tiles that change your position. <strong>Red snake heads</strong> slide you down to a lower tile when landed on. <strong>Brown rat tiles</strong> are hidden traps — a penalty wheel spins to pick a team when triggered.<br><br>'
      + '<strong>Blue</strong> is your current tile, <strong>green</strong> means you\'ve completed it. The <strong>colour legend at the bottom of the board</strong> labels every tile type — check there any time you\'re unsure what a colour means.'
  },
  {
    targetId: 'board-grid',
    mobileTab: 'board',
    cardPos: 'right',
    title: '🔍 Reading &amp; Clicking Tiles',
    body: 'Small emoji bullets at the bottom of each tile show which teams are <strong>currently standing</strong> on it. A green tile means it has been completed by at least one team. A progress bar shows completions on multi-step tiles.<br><br>'
      + '<strong>Click any tile</strong> to open a detail popup with the full task description, submitted proof images, and which teams are currently there.'
  },
  {
    targetId: 'stats-section',
    mobileTab: 'stats',
    cardPos: 'center',
    title: '📊 Statistics',
    body: 'The Statistics section gives you a live picture of the competition:<br><br>'
      + '<strong>Completions per Day</strong> (bar chart) — how many tiles each team completed each day, colour-coded by team. Good for spotting who had a strong session.<br><br>'
      + '<strong>Cumulative Completions</strong> (line chart) — each team\'s running total over time. Use this to see who is pulling ahead and who is catching up.<br><br>'
      + '<strong>🏅 Top Players</strong> leaderboard — ranks individual players by personal tile completions, not team totals.<br><br>'
      + 'The colour legend below the charts maps each colour to a team. Click any chart to open a larger zoomed-in view.'
  }
];

let _currentStep  = 0;
let _tourActive   = false;
let _spotlightTimer = null;

// ── Entry point ──

function openGuide() {
  _showWelcome();
}

function _showWelcome() {
  const seen    = localStorage.getItem('hs-bingo-guide-seen');
  const desc    = document.getElementById('guide-welcome-desc');
  const tourBtn = document.getElementById('guide-welcome-tour-btn');

  if (seen) {
    desc.textContent    = 'Welcome back! Take the guided tour again or browse the quick reference.';
    tourBtn.textContent = '▶ Take the Tour Again';
  } else {
    desc.innerHTML      = 'If this is your first time here, we recommend the <strong>full guided tour</strong> — it walks through every feature with live highlights so you know exactly where to look.';
    tourBtn.textContent = '▶ Start Guided Tour';
  }

  document.getElementById('guide-welcome').classList.remove('hidden');
}

function closeGuideWelcome() {
  document.getElementById('guide-welcome').classList.add('hidden');
}

// ── Guided Tour ──

function startGuidedTour() {
  closeGuideWelcome();
  _currentStep = 0;
  _tourActive  = true;
  _renderTourStep(_currentStep);
}

function guideTourNext() {
  if (_currentStep < TOUR_STEPS.length - 1) {
    _currentStep++;
    _advanceTourStep();
  } else {
    _finishTour();
  }
}

function guideTourPrev() {
  if (_currentStep > 0) {
    _currentStep--;
    _advanceTourStep();
  }
}

// Fade out → update → fade in (prevents position jump flicker)
function _advanceTourStep() {
  const card = document.getElementById('guide-tour-card');
  card.classList.remove('visible');
  setTimeout(() => _renderTourStep(_currentStep), 210);
}

function endTour() {
  _tourActive = false;
  const card = document.getElementById('guide-tour-card');
  card.classList.remove('visible');
  setTimeout(() => {
    card.classList.remove('pos-center', 'pos-right');
    const nextBtn = document.getElementById('guide-tour-next-btn');
    nextBtn.onclick  = guideTourNext;
    nextBtn.textContent = 'Next →';
    document.getElementById('guide-tour-prev-btn').style.display = '';
    document.getElementById('guide-tour-cta-btn').style.display = 'none';
  }, 220);
  _clearSpotlightRing();
}

function _renderTourStep(index) {
  const step  = TOUR_STEPS[index];
  const total = TOUR_STEPS.length;
  const card  = document.getElementById('guide-tour-card');

  // Update text content
  document.getElementById('guide-tour-step-badge').textContent = `Step ${index + 1} of ${total}`;
  document.getElementById('guide-tour-title').innerHTML = step.title;
  document.getElementById('guide-tour-body').innerHTML  = step.body;

  // Progress dots
  const prog = document.getElementById('guide-tour-progress');
  prog.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('span');
    dot.className = 'tour-dot' + (i === index ? ' tour-dot-active' : '');
    prog.appendChild(dot);
  }

  // Hide completion CTA during normal steps
  document.getElementById('guide-tour-cta-btn').style.display = 'none';

  // Button states
  document.getElementById('guide-tour-prev-btn').disabled = (index === 0);
  const nextBtn = document.getElementById('guide-tour-next-btn');
  nextBtn.textContent = (index === total - 1) ? 'Finish ✓' : 'Next →';
  document.getElementById('guide-tour-skip-row').style.display = (index === total - 1) ? 'none' : '';

  // Card position
  card.classList.remove('pos-center', 'pos-right');
  card.classList.add(step.cardPos === 'right' ? 'pos-right' : 'pos-center');

  // Mobile tab switch
  if (typeof switchTab === 'function' && window.innerWidth <= 860) {
    switchTab(step.mobileTab);
  }

  // Spotlight target
  _spotlightElement(step.targetId);

  // Fade card in (double rAF ensures class applies before transition runs)
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('visible')));
}

function _finishTour() {
  localStorage.setItem('hs-bingo-guide-seen', '1');
  _tourActive = false;
  _clearSpotlightRing();

  document.getElementById('guide-tour-step-badge').textContent = 'Tour Complete!';
  document.getElementById('guide-tour-title').textContent = '🎉 You\'re Ready to Play';
  document.getElementById('guide-tour-body').innerHTML =
    'You now know everything there is to know. Jump straight into the game, or open the <strong>Quick Reference</strong> any time you need a reminder about a specific feature.';
  document.getElementById('guide-tour-progress').innerHTML = '';
  document.getElementById('guide-tour-prev-btn').style.display = 'none';
  document.getElementById('guide-tour-skip-row').style.display = 'none';

  const nextBtn = document.getElementById('guide-tour-next-btn');
  nextBtn.textContent = 'Open Quick Reference';
  nextBtn.onclick = () => { endTour(); openQuickReference(); };

  document.getElementById('guide-tour-cta-btn').style.display = 'block';
}

// ── Quick Reference (existing guide modal) ──

function openQuickReference() {
  closeGuideWelcome();
  endTour();
  document.getElementById('guide-modal').classList.remove('hidden');
  const body = document.getElementById('guide-body');
  if (body) body.scrollTop = 0;
  _updateGuideNavActive(null);
}

function closeGuide() {
  document.getElementById('guide-modal').classList.add('hidden');
}

function guideJumpTo(sectionId) {
  document.getElementById('guide-modal').classList.remove('hidden');
  const section = document.getElementById(sectionId);
  const body    = document.getElementById('guide-body');
  if (!section || !body) return;
  body.scrollTo({ top: section.offsetTop, behavior: 'smooth' });
  _updateGuideNavActive(sectionId);
}

function _updateGuideNavActive(activeSectionId) {
  document.querySelectorAll('.guide-nav-btn').forEach(btn => {
    const onclick = btn.getAttribute('onclick') || '';
    const match   = onclick.match(/'(guide-s\d+)'/);
    btn.classList.toggle('active', !!match && match[1] === activeSectionId);
  });
}

// ── Spotlight helpers ──

function _spotlightElement(elementId) {
  const target = document.getElementById(elementId);
  const ring   = document.getElementById('guide-spotlight-ring');
  if (!target || !ring) return;
  const rect = target.getBoundingClientRect();
  const pad  = 6;
  ring.style.top    = (rect.top    - pad) + 'px';
  ring.style.left   = (rect.left   - pad) + 'px';
  ring.style.width  = (rect.width  + pad * 2) + 'px';
  ring.style.height = (rect.height + pad * 2) + 'px';
  ring.style.display = 'block';
  target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _clearSpotlightRing() {
  const ring = document.getElementById('guide-spotlight-ring');
  if (ring) ring.style.display = 'none';
}

// ── Quick-reference "Highlight in UI" buttons ──

function guideSpotlight(elementId) {
  document.getElementById('guide-modal').classList.add('hidden');
  _spotlightElement(elementId);
  document.getElementById('guide-back-btn').style.display = 'block';
  clearTimeout(_spotlightTimer);
  _spotlightTimer = setTimeout(resumeGuide, 8000);
}

function _clearSpotlight() {
  _clearSpotlightRing();
  const btn = document.getElementById('guide-back-btn');
  if (btn) btn.style.display = 'none';
  clearTimeout(_spotlightTimer);
}

function resumeGuide() {
  _clearSpotlight();
  document.getElementById('guide-modal').classList.remove('hidden');
}

// ── Q&A Tile modal ──

function openQaTile() {
  document.getElementById('qa-tile-modal').classList.remove('hidden');
}

function closeQaTile() {
  document.getElementById('qa-tile-modal').classList.add('hidden');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeQaTile();
});

// ── Scroll-sync nav active state in quick reference ──

document.addEventListener('DOMContentLoaded', () => {
  const body = document.getElementById('guide-body');
  if (!body) return;
  body.addEventListener('scroll', () => {
    const sections = body.querySelectorAll('.guide-section');
    let current = null;
    sections.forEach(sec => {
      if (sec.offsetTop - body.scrollTop <= 40) current = sec.id;
    });
    _updateGuideNavActive(current);
  }, { passive: true });
});
