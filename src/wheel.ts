// src/wheel.ts
// Wheel with curved arc labels, number badges, inner white ring, and radial separators.

const NS = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';

export function drawWheel(
  svg: SVGSVGElement,
  onSelect: (segmentName: string, evt: Event) => void
) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  // Canvas / geometry
  svg.setAttribute('viewBox', '0 0 320 320');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.style.width = '100%';
  svg.style.height = '100%';

  const cx = 160, cy = 160;
  const rOuter = 140;     // outer radius of donut
  const rInner = 82;      // inner radius of donut
  const rCenter = 58;     // center circle radius

  // Label arc positioning
  const labelInset = 12;  // distance inward from outer rim for label path
  const labelPadDeg = 6;  // trim near slice corners so text doesn't crash

  // Badge look/placement
  const badgeRadius = 10;
  const badgeOffset = 6; // distance outside outer rim

  // Segments (keys must match what main.ts expects)
  const segments: { key: string; color: string }[] = [
    { key: 'The organisation',      color: '#6aaf4b' },
    { key: 'Care and services',     color: '#7e5aa2' },
    { key: 'The environment',       color: '#29335c' },
    { key: 'Clinical care',         color: '#29a9c7' },
    { key: 'Food and nutrition',    color: '#f18f01' },
    { key: 'Residential community', color: '#faa916' }
  ];
  const center = { key: '1. The Individual', color: '#e94e77' };

  // --- defs: drop shadow + gradients + label paths container
  const defs = svg.appendChild(el('defs'));

  const drop = el('filter', { id: 'softDrop' });
  drop.innerHTML = `<feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="rgba(0,0,0,.25)" />`;
  defs.appendChild(drop);

  const mkGrad = (id: string, base: string) => {
    const grad = el('linearGradient', { id, x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
    const stop = (o: number, col: string) => {
      const s = el('stop', { offset: `${o * 100}%`, 'stop-color': col });
      grad.appendChild(s);
    };
    stop(0, shade(base, 0.12));
    stop(1, shade(base, -0.08));
    defs.appendChild(grad);
  };
  segments.forEach((s, i) => mkGrad(`segGrad${i}`, s.color));
  mkGrad('centerGrad', center.color);

  // Helpers
  const toRad = (deg: number) => (Math.PI / 180) * deg;
  const polar = (r: number, aDeg: number) => ({ x: cx + r * Math.cos(toRad(aDeg)), y: cy + r * Math.sin(toRad(aDeg)) });

  const arcPath = (r: number, a0: number, a1: number) => {
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    const p0 = polar(r, a0);
    const p1 = polar(r, a1);
    return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  };

  const donutPath = (a0: number, a1: number) => {
    const largeOuter = Math.abs(a1 - a0) > 180 ? 1 : 0;
    const po0 = polar(rOuter, a0);
    const po1 = polar(rOuter, a1);
    const pi0 = polar(rInner, a1);
    const pi1 = polar(rInner, a0);
    return [
      `M ${po0.x.toFixed(2)} ${po0.y.toFixed(2)}`,
      `A ${rOuter} ${rOuter} 0 ${largeOuter} 1 ${po1.x.toFixed(2)} ${po1.y.toFixed(2)}`,
      `L ${pi0.x.toFixed(2)} ${pi0.y.toFixed(2)}`,
      `A ${rInner} ${rInner} 0 ${largeOuter} 0 ${pi1.x.toFixed(2)} ${pi1.y.toFixed(2)}`,
      'Z'
    ].join(' ');
  };

  // Root group
  const g = svg.appendChild(el('g', { filter: 'url(#softDrop)' }));

  // Background: inner white ring (between center and slices)
  const innerRing = el('circle', { cx: String(cx), cy: String(cy), r: String(rInner - 1) });
  innerRing.setAttribute('fill', 'none');
  innerRing.setAttribute('stroke', '#fff');
  innerRing.setAttribute('stroke-width', '12');
  innerRing.style.pointerEvents = 'none';
  g.appendChild(innerRing);

  // Draw 6 equal slices around -90° start (top)
  const start = -90;
  const step = 360 / segments.length;

  segments.forEach((seg, idx) => {
    const a0 = start + idx * step;
    const a1 = a0 + step;
    const mid = (a0 + a1) / 2;

    // Slice
    const slice = el('path', {
      d: donutPath(a0, a1),
      fill: `url(#segGrad${idx})`,
      stroke: 'rgba(255,255,255,0.95)',
      'stroke-width': '1.25',
      tabindex: '0',
      role: 'button',
      'data-name': seg.key,
      'aria-label': seg.key
    });
    slice.style.cursor = 'pointer';
    slice.classList.add('seg');
    slice.addEventListener('click', (evt) => onSelect(seg.key, evt));
    slice.addEventListener('keypress', (evt: any) => {
      if (evt.key === 'Enter' || evt.key === ' ') onSelect(seg.key, evt);
    });
    g.appendChild(slice);

    // Curved label path (always the same direction; we’ll flip the TEXT on bottom half)
    const id = `labelPath${idx}`;
    const labelR = rOuter - labelInset;
    const la0 = a0 + labelPadDeg;
    const la1 = a1 - labelPadDeg;

    const pathForText = el('path', { id, d: arcPath(labelR, la0, la1), fill: 'none', stroke: 'none' });
    defs.appendChild(pathForText);

    // Text-on-a-path centred
    const t = el('text', { class: 'arc-label' });
    const tp = el('textPath', { 'startOffset': '50%' });
    // xlink:href for Safari, href for modern browsers
    (tp as any).setAttributeNS(XLINK, 'xlink:href', `#${id}`);
    tp.setAttribute('href', `#${id}`);
    tp.textContent = seg.key;
    t.appendChild(tp);
    (t as any).style.pointerEvents = 'none'; // let clicks hit the slice

    // Keep text upright: rotate 180° around the label midpoint for the bottom half
    const upsideDown = (mid > 90 && mid < 270);
    if (upsideDown) {
      const m = polar(labelR, mid);
      t.setAttribute('transform', `rotate(180 ${m.x.toFixed(2)} ${m.y.toFixed(2)})`);
    }

    g.appendChild(t);

    // Fit long labels to arc length (reduce font-size down to 8px)
    fitTextToPath(t, pathForText, 10, 8);

    // Number badge 2..7 just outside rim on mid-angle
    const bPos = polar(rOuter + badgeOffset, mid);
    const badge = el('circle', { cx: bPos.x.toFixed(2), cy: bPos.y.toFixed(2), r: String(badgeRadius), class: 'badge' });
    (badge as any).style.pointerEvents = 'none';
    g.appendChild(badge);
    const bText = el('text', { x: bPos.x.toFixed(2), y: bPos.y.toFixed(2), class: 'badge-text' });
    bText.textContent = String(idx + 2);
    (bText as any).style.pointerEvents = 'none';
    g.appendChild(bText);
  });

  // Radial separators (rounded white lines between slices)
  for (let i = 0; i < segments.length; i++) {
    const a = start + i * step;
    const p0 = polar(rInner + 2, a);
    const p1 = polar(rOuter - 2, a);
    const sep = el('line', {
      x1: p0.x.toFixed(2), y1: p0.y.toFixed(2),
      x2: p1.x.toFixed(2), y2: p1.y.toFixed(2),
      class: 'separator'
    });
    sep.style.pointerEvents = 'none';
    g.appendChild(sep);
  }

  // Center circle & label
  const centerCircle = el('circle', {
    cx: String(cx), cy: String(cy), r: String(rCenter),
    fill: 'url(#centerGrad)', stroke: '#fff', 'stroke-width': '1.25'
  });
  centerCircle.style.cursor = 'pointer';
  centerCircle.addEventListener('click', (evt) => onSelect(center.key, evt));
  g.appendChild(centerCircle);

  const cLabel = el('text', { x: String(cx), y: String(cy), class: 'center-label', 'text-anchor': 'middle' });
  cLabel.textContent = 'The Individual';
  (cLabel as any).style.pointerEvents = 'none';
  g.appendChild(cLabel);

  // “1” badge inside center at 12 o’clock
  const cBadgePos = polar(rCenter - 12, -90);
  const cBadge = el('circle', { cx: cBadgePos.x.toFixed(2), cy: cBadgePos.y.toFixed(2), r: '9', class: 'badge' });
  (cBadge as any).style.pointerEvents = 'none';
  g.appendChild(cBadge);
  const cNum = el('text', { x: cBadgePos.x.toFixed(2), y: cBadgePos.y.toFixed(2), class: 'badge-text' });
  cNum.textContent = '1';
  (cNum as any).style.pointerEvents = 'none';
  g.appendChild(cNum);

  // --- helpers ---
  function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string> = {}) {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }

  function shade(hex: string, amt: number) {
    const c = hex.replace('#', '');
    const n = parseInt(c, 16);
    const r = Math.min(255, Math.max(0, ((n >> 16) & 0xff) + Math.round(255 * amt)));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + Math.round(255 * amt)));
    const b = Math.min(255, Math.max(0, (n & 0xff) + Math.round(255 * amt)));
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
  }

  function fitTextToPath(textEl: SVGTextElement, pathEl: SVGPathElement, maxPx = 10, minPx = 8) {
    const pathLen = pathEl.getTotalLength() - 6; // small safety pad
    let size = maxPx;
    (textEl.style as any).fontSize = `${size}px`;
    // If too long, shrink until it fits
    for (let i = 0; i < 8; i++) {
      const tLen = textEl.getComputedTextLength();
      if (tLen <= pathLen || size <= minPx) break;
      size -= 0.5;
      (textEl.style as any).fontSize = `${size}px`;
    }
  }
}
