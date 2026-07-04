// ── How to Play Guide ──

let _spotlightTimer = null;

function openGuide(sectionId) {
  document.getElementById('guide-modal').classList.remove('hidden');
  if (sectionId) {
    setTimeout(() => guideJumpTo(sectionId), 60);
  } else {
    const body = document.getElementById('guide-body');
    if (body) body.scrollTop = 0;
  }
  _updateGuideNavActive(null);
}

function closeGuide() {
  document.getElementById('guide-modal').classList.add('hidden');
}

function guideJumpTo(sectionId) {
  // Ensure guide is open
  document.getElementById('guide-modal').classList.remove('hidden');

  const section = document.getElementById(sectionId);
  const body    = document.getElementById('guide-body');
  if (!section || !body) return;

  // Scroll the section to the top of the guide body
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

// ── Spotlight feature ──

function guideSpotlight(elementId) {
  const target = document.getElementById(elementId);
  if (!target) return;

  // Close the guide while spotlighting
  document.getElementById('guide-modal').classList.add('hidden');

  // Position the ring over the target
  const ring    = document.getElementById('guide-spotlight-ring');
  const rect    = target.getBoundingClientRect();
  const pad     = 6;
  ring.style.top    = (rect.top  - pad) + 'px';
  ring.style.left   = (rect.left - pad) + 'px';
  ring.style.width  = (rect.width  + pad * 2) + 'px';
  ring.style.height = (rect.height + pad * 2) + 'px';
  ring.style.display = 'block';

  // Scroll the element into view if needed
  target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Show the back button
  document.getElementById('guide-back-btn').style.display = 'block';

  // Auto-resume after 8 seconds
  clearTimeout(_spotlightTimer);
  _spotlightTimer = setTimeout(resumeGuide, 8000);
}

function _clearSpotlight() {
  const ring = document.getElementById('guide-spotlight-ring');
  if (ring) ring.style.display = 'none';
  const btn = document.getElementById('guide-back-btn');
  if (btn) btn.style.display = 'none';
  clearTimeout(_spotlightTimer);
}

function resumeGuide() {
  _clearSpotlight();
  document.getElementById('guide-modal').classList.remove('hidden');
}

// ── Sync active nav pill while user scrolls guide body ──

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
