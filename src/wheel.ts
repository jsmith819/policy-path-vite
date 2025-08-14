// src/wheel.ts
export function drawWheel(
  svg: SVGSVGElement,
  onSelect: (segmentName: string, evt: Event) => void
) {
  // Wipe previous drawing
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  // Consistent canvas
  svg.setAttribute('viewBox', '0 0 320 320');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.style.width = '100%';
  svg.style.height = '100%';

  const cx = 160, cy = 160;
  const rOuter = 140;
  const rInner = 82;          // donut thickness
  const rCenter = 58;

  // Segment palette (keeps your existing colours)
  const segments: { key: string; color: string }[] = [
    { key: 'The organisation',          color: '#6aaf4b' },
    { key: 'Care and services',         color: '#7e5aa2' },
    { key: 'The environment',           color: '#29335c' },
    { key: 'Clinical care',             color: '#29a9c7' },
    { key: 'Food and nutrition',        color: '#f18f01' },
    { key: 'Residential community',     color: '#faa916' }
  ];
  const center = { key: '1. The Individual', color: '#e94e77' };

  // --- defs: gradients + soft shadow
  const defs = svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'defs'));

  const drop = document.createElementNS(svg.namespaceURI, 'filter');
  drop.setAttribute('id', 'softDrop');
  drop.innerHTML = `
    <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="rgba(0,0,0,.25)" />
  `;
  defs.appendChild(drop);

  const mkGrad = (id: string, base: string) => {
    const grad = document.createElementNS(svg.namespaceURI, 'linearGradient');
    grad.setAttribute('id', id);
    grad.setAttribute('x1', '0%');
    grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '100%');
    grad.setAttribute('y2', '100%');
    const stop = (o: number, col: string) => {
      const s = document.createElementNS(svg.namespaceURI, 'stop');
      s.setAttribute('offset', `${o * 100}%`);
      s.setAttribute('stop-color', col);
      grad.appendChild(s);
    };
    stop(0, shade(base, 0.12));
    stop(1, shade(base, -0.08));
    defs.appendChild(grad);
  };

  segments.forEach((s, i) => mkGrad(`segGrad${i}`, s.color));
  mkGrad('centerGrad', center.color);

  // Root group with a little breathing room
  const g = svg.appendChild(document.createElementNS(svg.namespaceURI, 'g'));
  g.setAttribute('filter', 'url(#softDrop)');

  // Helpers
  const toRad = (deg: number) => (Math.PI / 180) * deg;
  const arc = (
    r: number,
    a0: number,
    a1: number
  ) => {
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    const p0 = { x: cx + r * Math.cos(toRad(a0)), y: cy + r * Math.sin(toRad(a0)) };
    const p1 = { x: cx + r * Math.cos(toRad(a1)), y: cy + r * Math.sin(toRad(a1)) };
    return { p0, p1, large };
  };
  const donutPath = (a0: number, a1: number) => {
    // outer arc (a0->a1), then inner arc back (a1->a0)
    const o = arc(rOuter, a0, a1);
    const i = arc(rInner, a1, a0);
    return [
      `M ${o.p0.x.toFixed(2)} ${o.p0.y.toFixed(2)}`,
      `A ${rOuter} ${rOuter} 0 ${o.large} 1 ${o.p1.x.toFixed(2)} ${o.p1.y.toFixed(2)}`,
      `L ${i.p0.x.toFixed(2)} ${i.p0.y.toFixed(2)}`,
      `A ${rInner} ${rInner} 0 ${i.large} 0 ${i.p1.x.toFixed(2)} ${i.p1.y.toFixed(2)}`,
      'Z'
    ].join(' ');
  };

  // Draw 6 equal segments around -90° start (top)
  const start = -90;
  const step = 360 / segments.length;

  segments.forEach((seg, idx) => {
    const a0 = start + idx * step;
    const a1 = a0 + step;

    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', donutPath(a0, a1));
    path.setAttribute('fill', `url(#segGrad${idx})`);
    path.setAttribute('stroke', 'rgba(255,255,255,0.95)');
    path.setAttribute('stroke-width', '1.25');
    path.classList.add('seg');
    path.setAttribute('tabindex', '0');
    path.setAttribute('role', 'button');
    path.setAttribute('data-name', seg.key);
    path.setAttribute('aria-label', seg.key);
    path.style.cursor = 'pointer';

    path.addEventListener('click', (evt) => onSelect(seg.key, evt));
    path.addEventListener('keypress', (evt: any) => {
      if (evt.key === 'Enter' || evt.key === ' ') onSelect(seg.key, evt);
    });

    g.appendChild(path);

    // Label at mid-angle
    const mid = (a0 + a1) / 2;
    const rx = cx + ((rInner + rOuter) / 2) * Math.cos(toRad(mid));
    const ry = cy + ((rInner + rOuter) / 2) * Math.sin(toRad(mid));

    const label = document.createElementNS(svg.namespaceURI, 'text');
    label.setAttribute('x', rx.toFixed(2));
    label.setAttribute('y', ry.toFixed(2));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.classList.add('seg-label');
    label.textContent = seg.key;
    // rotate legibility: keep upright-ish
    const rot = mid + 90;
    label.setAttribute('transform', `rotate(${rot.toFixed(1)} ${rx.toFixed(2)} ${ry.toFixed(2)})`);
    g.appendChild(label);
  });

  // Center circle
  const c = document.createElementNS(svg.namespaceURI, 'circle');
  c.setAttribute('cx', String(cx));
  c.setAttribute('cy', String(cy));
  c.setAttribute('r', String(rCenter));
  c.setAttribute('fill', 'url(#centerGrad)');
  c.setAttribute('stroke', 'white');
  c.setAttribute('stroke-width', '1.25');
  c.style.cursor = 'pointer';
  c.addEventListener('click', (evt) => onSelect(center.key, evt));
  g.appendChild(c);

  const cLabel = document.createElementNS(svg.namespaceURI, 'text');
  cLabel.setAttribute('x', String(cx));
  cLabel.setAttribute('y', String(cy));
  cLabel.setAttribute('text-anchor', 'middle');
  cLabel.setAttribute('dominant-baseline', 'middle');
  cLabel.classList.add('center-label');
  cLabel.textContent = 'The Individual';
  g.appendChild(cLabel);

  // Small utility: lighten/darken a hex
  function shade(hex: string, amt: number) {
    const c = hex.replace('#', '');
    const n = parseInt(c, 16);
    const r = Math.min(255, Math.max(0, ((n >> 16) & 0xff) + Math.round(255 * amt)));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + Math.round(255 * amt)));
    const b = Math.min(255, Math.max(0, (n & 0xff) + Math.round(255 * amt)));
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
  }
}
