// ── How to Play Guide ──

const TOUR_STEPS = [
  {
    targetId: 'side-panel',
    mobileTab: 'play',
    title: 'The Right Panel — Your Control Centre',
    body: 'The panel on the right is where all gameplay actions happen. It is divided into sections: your current task, dice rolling, task completion, team standings, and statistics. Everything you need to play is here.'
  },
  {
    targetId: 'task-section',
    mobileTab: 'play',
    title: '📍 Current Task',
    body: 'This shows your team\'s current tile number and the task description. The status line shows your progress — <em>"1 / 3 completions"</em> means you need to submit valid proof 3 times to fully clear this tile.'
  },
  {
    targetId: 'roll-section',
    mobileTab: 'play',
    title: '🎲 Roll Dice',
    body: 'Roll to move forward on the board. You roll <strong>when first joining</strong> to get onto the board, and again <strong>after completing a task</strong> to advance. Click the purple Roll Dice button — the result appears below it.'
  },
  {
    targetId: 'complete-section',
    mobileTab: 'play',
    title: '✅ Complete a Task',
    body: 'Submit proof of completion here. Click the <strong>📁 file button</strong> to upload an image, paste a <strong>direct image URL</strong> into the field, or drag-and-drop a file onto the dashed area. A preview appears — then hit the green <strong>Complete</strong> button.'
  },
  {
    targetId: 'complete-section',
    mobileTab: 'play',
    title: '⚡ Early Completion',
    body: 'Some tiles that require multiple submissions also offer an <strong>Early Completion</strong> option. When eligible, a checkbox appears just above the Complete button — tick it to claim the full tile in a single submission.'
  },
  {
    targetId: 'reroll-toggle-row',
    mobileTab: 'play',
    title: '⏪ Rollback — Move Backwards',
    body: 'Stuck on a tile? Tick the <strong>⏪ Rollback checkbox</strong> on the left side of the Roll section, then roll — you will move backwards instead of forwards. The gold badge shows how many charges you have left. You earn rollbacks by completing tiles.'
  },
  {
    targetId: 'teams-section',
    mobileTab: 'teams',
    title: '🏆 All Teams',
    body: 'See every team\'s current tile and progress at a glance. The <strong>⚡ Recent Completions</strong> bar at the top shows the latest tiles finished across all teams. Click any team row to open their full completion history with proof images.'
  },
  {
    targetId: 'board-wrapper',
    mobileTab: 'board',
    title: '🗺️ The Board — Snakes &amp; Rats',
    body: 'The 10×10 board has special tiles: <strong>red snake heads</strong> slide you down to a lower tile, <strong>brown rat tiles</strong> are hidden traps that trigger a penalty wheel, <strong>blue</strong> is your current position, and <strong>green</strong> tiles are ones you have completed. Check the legend at the bottom.'
  },
  {
    targetId: 'board-grid',
    mobileTab: 'board',
    title: '🔍 Reading &amp; Clicking Tiles',
    body: 'Small emoji bullets at the bottom of each tile show which teams are standing on it. A green tile means it has been completed. <strong>Click any tile</strong> to open a detail popup showing the full task, submitted proof images, and which teams are currently there.'
  },
  {
    targetId: 'stats-section',
    mobileTab: 'stats',
    title: '📊 Statistics',
    body: 'Track game progress with live charts: <strong>Completions per Day</strong> shows daily activity by team, and <strong>Cumulative Completions</strong> shows running totals over time. The <strong>🏅 Top Players</strong> leaderboard ranks individual completions. Click either chart to zoom in for a larger view.'
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
  const seen   = localStorage.getItem('hs-bingo-guide-seen');
  const desc   = document.getElementById('guide-welcome-desc');
  const tourBtn = document.getElementById('guide-welcome-tour-btn');

  if (seen) {
    desc.textContent    = 'Welcome back! Take the guided tour again or browse the quick reference.';
    tourBtn.textContent = '▶ Take the Tour Again';
  } else {
    desc.innerHTML = 'If this is your first time here, we recommend the <strong>full guided tour</strong> — it walks through every feature with live highlights so you know exactly where to look.';
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
  _showTourStep(_currentStep);
}

function guideTourNext() {
  if (_currentStep < TOUR_STEPS.length - 1) {
    _currentStep++;
    _showTourStep(_currentStep);
  } else {
    _finishTour();
  }
}

function guideTourPrev() {
  if (_currentStep > 0) {
    _currentStep--;
    _showTourStep(_currentStep);
  }
}

function endTour() {
  _tourActive = false;
  _hideTourCard();
  _clearSpotlightRing();
}

function _showTourStep(index) {
  const step  = TOUR_STEPS[index];
  const total = TOUR_STEPS.length;

  // Update card content
  document.getElementById('guide-tour-step-badge').textContent = `Step ${index + 1} of ${total}`;
  document.getElementById('guide-tour-title').textContent = '';
  // Title may contain entities — use innerHTML for the HTML-encoded ones
  const titleEl = document.getElementById('guide-tour-title');
  titleEl.innerHTML = step.title;
  document.getElementById('guide-tour-body').innerHTML = step.body;

  // Progress dots
  const prog = document.getElementById('guide-tour-progress');
  prog.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('span');
    dot.className = 'tour-dot' + (i === index ? ' tour-dot-active' : '');
    prog.appendChild(dot);
  }

  // Prev button state
  document.getElementById('guide-tour-prev-btn').disabled = (index === 0);

  // Next button label
  const nextBtn = document.getElementById('guide-tour-next-btn');
  nextBtn.textContent = index === total - 1 ? 'Finish ✓' : 'Next →';

  // Show/hide skip row (hide on last step)
  document.getElementById('guide-tour-skip-row').style.display = index === total - 1 ? 'none' : '';

  // Switch mobile tab if needed
  if (typeof switchTab === 'function' && window.innerWidth <= 860) {
    switchTab(step.mobileTab);
  }

  // Spotlight the target element
  _spotlightElement(step.targetId);

  // Show the card (after a tick so it renders after spotlight)
  document.getElementById('guide-tour-card').classList.add('visible');
}

function _finishTour() {
  localStorage.setItem('hs-bingo-guide-seen', '1');
  _tourActive = false;
  _clearSpotlightRing();

  // Show completion message in the card
  document.getElementById('guide-tour-step-badge').textContent = 'All done!';
  document.getElementById('guide-tour-title').textContent = '🎉 Tour Complete';
  document.getElementById('guide-tour-body').innerHTML =
    "You now know everything you need to play. Use the <strong>Quick Reference</strong> any time you need a reminder about a specific feature.";
  document.getElementById('guide-tour-progress').innerHTML = '';
  document.getElementById('guide-tour-prev-btn').style.display = 'none';
  document.getElementById('guide-tour-next-btn').textContent = 'Open Quick Reference';
  document.getElementById('guide-tour-next-btn').onclick = () => {
    endTour();
    openQuickReference();
  };
  document.getElementById('guide-tour-skip-row').style.display = 'none';
}

function _hideTourCard() {
  document.getElementById('guide-tour-card').classList.remove('visible');
  // Reset next button in case it was swapped to "Open Quick Reference"
  const nextBtn = document.getElementById('guide-tour-next-btn');
  nextBtn.onclick = guideTourNext;
  nextBtn.textContent = 'Next →';
  document.getElementById('guide-tour-prev-btn').style.display = '';
}

// ── Quick Reference (existing guide modal) ──

function openQuickReference() {
  closeGuideWelcome();
  endTour();
  const modal = document.getElementById('guide-modal');
  modal.classList.remove('hidden');
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
  const target = document.getElementById(elementId);
  if (!target) return;

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

// ── Scroll-sync nav active state ──

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
