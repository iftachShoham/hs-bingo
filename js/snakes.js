// ══════════════════════════════════════════════════════
//  SNAKE DRAWING — SVG overlay on the board grid
// ══════════════════════════════════════════════════════

function svgPath(d, stroke, width, linecap) {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d); p.setAttribute('stroke', stroke);
  p.setAttribute('stroke-width', width); p.setAttribute('fill', 'none');
  if (linecap) p.setAttribute('stroke-linecap', linecap);
  return p;
}

function drawSnakeShape(g, hx, hy, tx, ty, pal, cellSize, idx) {
  const dx = tx - hx, dy = ty - hy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 2) return;

  const thickness = cellSize * 0.16;

  // Perpendicular unit vector — alternating side per snake gives space between them
  const sign = (idx % 2 === 0) ? 1 : -1;
  const px = (-dy / dist) * sign;
  const py = ( dx / dist) * sign;
  const amp = Math.min(dist * 0.32, cellSize * 2.2);

  // Cubic bezier control points for S-curve body
  const cp1x = hx + dx * 0.3 + px * amp;
  const cp1y = hy + dy * 0.3 + py * amp;
  const cp2x = hx + dx * 0.7 - px * amp;
  const cp2y = hy + dy * 0.7 - py * amp;

  const pathD = `M${hx},${hy} C${cp1x},${cp1y} ${cp2x},${cp2y} ${tx},${ty}`;

  // ── Drop shadow ──
  g.appendChild(svgPath(pathD, 'rgba(0,0,0,0.5)', thickness + 4, 'round'));

  // ── Main body ──
  const body = svgPath(pathD, pal.body, thickness, 'round');
  body.setAttribute('opacity', '0.9');
  g.appendChild(body);

  // ── Scale texture: dark dashes along the body ──
  const scales = svgPath(pathD, 'rgba(0,0,0,0.25)', thickness * 0.82, 'round');
  scales.setAttribute('stroke-dasharray', `${thickness * 0.5} ${thickness * 0.5}`);
  g.appendChild(scales);

  // ── Belly stripe (lighter centre) ──
  const belly = svgPath(pathD, pal.hi, thickness * 0.28, 'round');
  belly.setAttribute('opacity', '0.55');
  g.appendChild(belly);

  // ── Head oval (slightly wider, tilted toward the body) ──
  const headAngle = Math.atan2(hx - cp1x, hy - cp1y) - Math.PI / 2;  // head faces away from body
  const headR = thickness * 0.82;
  const headOval = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  headOval.setAttribute('cx', hx); headOval.setAttribute('cy', hy);
  headOval.setAttribute('rx', headR * 1.3); headOval.setAttribute('ry', headR * 0.92);
  headOval.setAttribute('fill', pal.dark);
  headOval.setAttribute('transform', `rotate(${headAngle * 180 / Math.PI},${hx},${hy})`);
  headOval.setAttribute('opacity', '0.95');
  g.appendChild(headOval);

  // ── Eyes ──
  const perpAngle = headAngle + Math.PI / 2;
  const eyeDist = headR * 0.38;
  const eyeFwd  = headR * 0.28;
  const eyeR    = headR * 0.24;

  [1, -1].forEach(side => {
    const ex = hx + Math.cos(perpAngle) * eyeDist * side + Math.cos(headAngle) * eyeFwd;
    const ey = hy + Math.sin(perpAngle) * eyeDist * side + Math.sin(headAngle) * eyeFwd;

    // Iris
    const iris = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    iris.setAttribute('cx', ex); iris.setAttribute('cy', ey);
    iris.setAttribute('r', eyeR); iris.setAttribute('fill', '#f9e44a');
    g.appendChild(iris);

    // Vertical-slit pupil (snake-like)
    const pupil = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    pupil.setAttribute('cx', ex); pupil.setAttribute('cy', ey);
    pupil.setAttribute('rx', eyeR * 0.28); pupil.setAttribute('ry', eyeR * 0.78);
    pupil.setAttribute('fill', '#0d0500');
    pupil.setAttribute('transform', `rotate(${headAngle * 180 / Math.PI},${ex},${ey})`);
    g.appendChild(pupil);
  });

  // ── Forked tongue ──
  const tongueBase = {
    x: hx + Math.cos(headAngle) * headR * 1.15,
    y: hy + Math.sin(headAngle) * headR * 1.15,
  };
  const tongueTip = {
    x: tongueBase.x + Math.cos(headAngle) * headR * 1.1,
    y: tongueBase.y + Math.sin(headAngle) * headR * 1.1,
  };
  const forkLen = headR * 0.55;
  const forkAng = 0.42;

  const tongue = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  tongue.setAttribute('d', [
    `M${tongueBase.x},${tongueBase.y} L${tongueTip.x},${tongueTip.y}`,
    `M${tongueTip.x},${tongueTip.y}`,
    `L${tongueTip.x + Math.cos(headAngle - forkAng) * forkLen},${tongueTip.y + Math.sin(headAngle - forkAng) * forkLen}`,
    `M${tongueTip.x},${tongueTip.y}`,
    `L${tongueTip.x + Math.cos(headAngle + forkAng) * forkLen},${tongueTip.y + Math.sin(headAngle + forkAng) * forkLen}`,
  ].join(' '));
  tongue.setAttribute('stroke', '#e53935');
  tongue.setAttribute('stroke-width', headR * 0.16);
  tongue.setAttribute('fill', 'none');
  tongue.setAttribute('stroke-linecap', 'round');
  g.appendChild(tongue);

  // ── Tail tip: small pointed arrow showing destination ──
  const tailAngle = Math.atan2(ty - cp2y, tx - cp2x);
  const arrowLen  = cellSize * 0.28;
  const tailArrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  tailArrow.setAttribute('d', [
    `M${tx + Math.cos(tailAngle + 2.5) * arrowLen},${ty + Math.sin(tailAngle + 2.5) * arrowLen}`,
    `L${tx},${ty}`,
    `L${tx + Math.cos(tailAngle - 2.5) * arrowLen},${ty + Math.sin(tailAngle - 2.5) * arrowLen}`,
  ].join(' '));
  tailArrow.setAttribute('stroke', pal.hi);
  tailArrow.setAttribute('stroke-width', thickness * 0.35);
  tailArrow.setAttribute('fill', 'none');
  tailArrow.setAttribute('stroke-linecap', 'round');
  tailArrow.setAttribute('stroke-linejoin', 'round');
  tailArrow.setAttribute('opacity', '0.85');
  g.appendChild(tailArrow);
}

function drawSnakes(snakes) {
  const grid = document.getElementById('board-grid');
  if (!grid || !snakes) return;

  const old = document.getElementById('snake-svg');
  if (old) old.remove();

  const entries = Object.entries(snakes).filter(([, t]) => t);
  if (!entries.length) return;

  grid.style.position = 'relative';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'snake-svg';
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:20;overflow:hidden;';
  grid.appendChild(svg);

  const gridRect = grid.getBoundingClientRect();
  const W = gridRect.width, H = gridRect.height;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // Clip everything to the grid bounds so curves never overflow
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const clipEl = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
  clipEl.id = 'snake-board-clip';
  const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  clipRect.setAttribute('width', W); clipRect.setAttribute('height', H);
  clipEl.appendChild(clipRect); defs.appendChild(clipEl); svg.appendChild(defs);

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('clip-path', 'url(#snake-board-clip)');
  svg.appendChild(g);

  const PALETTES = [
    { body: '#2e7d32', hi: '#81c784', dark: '#1b5e20' },
    { body: '#558b2f', hi: '#aed581', dark: '#33691e' },
    { body: '#00695c', hi: '#80cbc4', dark: '#004d40' },
    { body: '#4527a0', hi: '#b39ddb', dark: '#1a0072' },
    { body: '#ad1457', hi: '#f48fb1', dark: '#78002e' },
    { body: '#e65100', hi: '#ffcc80', dark: '#ac1900' },
  ];

  entries.forEach(([headStr, tailStr], idx) => {
    const headTile = Number(headStr);
    const tailTile = Number(tailStr);

    const headEl = grid.querySelector(`[data-tile="${headTile}"]`);
    const tailEl = grid.querySelector(`[data-tile="${tailTile}"]`);
    if (!headEl || !tailEl) return;

    const hRect = headEl.getBoundingClientRect();
    const tRect = tailEl.getBoundingClientRect();

    const hx = hRect.left - gridRect.left + hRect.width  / 2;
    const hy = hRect.top  - gridRect.top  + hRect.height / 2;
    const tx = tRect.left - gridRect.left + tRect.width  / 2;
    const ty = tRect.top  - gridRect.top  + tRect.height / 2;

    const cellSize = Math.min(hRect.width, hRect.height);
    const pal = PALETTES[idx % PALETTES.length];
    drawSnakeShape(g, hx, hy, tx, ty, pal, cellSize, idx);
  });
}
