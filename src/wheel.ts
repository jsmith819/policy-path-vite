// src/wheel.ts
// Draws the 7-piece wheel with curved text along each slice & small number badges.

const NS = 'http://www.w3.org/2000/svg';

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
  const labelInset = 14;  // pixels inward from outer rim where the label path sits
  const labelPadDeg = 10; // trim degrees at both ends so text doesn't collide with corners

  // Badges (small numbers on slices)
  const badgeRadius = 10;
  const badgeOffset = 6;  // how far outside the rim the badge sits

  // Segments (keep keys exactly matching what main.ts expects)
  const segments: { key: string; color: string }[] = [
    { key: 'The organisation',      color: '#6aaf4b' },
    { key: 'Care and services',     color: '#7e5aa2' },
    { key: 'The environment',       color: '#29335c' },
    { key: 'Clinical care',         color: '#29a9c7' },
    { key: 'Food and nutrition',    color: '#f18f01' },
    { key: 'Residential community', color: '#faa916' }
  ];
  const center = { key: '1. The Individual', color: '#e94e77' };

  // --- defs: drop shadow + gradients + (later) label paths
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

  // Utility fns
  const toRad = (deg: number) => (Math.PI / 180) * deg;
  const polar = (r: number, aDeg: number) =>
    ({ x: cx + r * Math.cos(toRad(aDeg)), y: cy + r * Math.sin(toRad(aDeg)) });

  const arcPath = (r: number, a0: number, a1: number) => {
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    const p0 = polar(r, a0);
    const p1 = polar(r, a1);
    return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  };

  const donutPath = (a0: number, a1: number) => {
    // outer arc (a0->a1), then inner arc back (a1->a0)
    const largeOuter = Math.abs(a1 - a0) > 180 ? 1 : 0;
    const po0 = polar(rOuter, a0);
    const po1 = polar(rOuter, a1);
    const pi0 = polar(rInner, a1);
    const pi1 = polar(rInner, a0);
    const largeInner = largeOuter; // same span
    return [
      `M ${po0.x.toFixed(2)} ${po0.y.toFixed(2)}`,
      `A ${rOuter} ${rOuter} 0 ${largeOuter} 1 ${po1.x.toFixed(2)} ${po1.y.toFixed(2)}`,
      `L ${pi0.x.toFixed(2)} ${pi0.y.toFixed(2)}`,
      `A ${rInner} ${rInner} 0 ${largeInner} 0 ${pi1.x.toFixed(2)} ${pi1.y.toFixed(2)}`,
      'Z'
    ].join(' ');
  };

  // Root group
  const g = svg.appendChild(el('g', { filter: 'url(#softDrop)' }));

  // Draw 6 equal slices around -90° start (12 o'clock)
  const start = -90;
  const step = 360 / segments.length;

  segments.forEach((seg, idx) => {
    const a0 = start + idx * step;
    const a1 = a0 + step;

    // Slice body
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

    // Curved label path in <defs>
    const id = `labelPath${idx}`;
    const mid = (a0 + a1) / 2;
    const labelR = rOuter - labelInset;

    // Trim ends so text doesn't hit the corners
    let la0 = a0 + labelPadDeg;
    let la1 = a1 - labelPadDeg;

    // Keep text upright: if mid-angle upside-down (90..270), reverse path direction
    const upsideDown = (mid > 90 && mid < 270);
    if (upsideDown) [la0, la1] = [la1, la0];

    const pathForText = el('path', {
      id,
      d: arcPath(labelR, la0, la1),
      fill: 'none',
      stroke: 'none'
    });
    defs.appendChild(pathForText);

    // Text-on-a-path (centered)
    const t = el('text', { class: 'arc-label' });
    const tp = el('textPath', {
      href: `#${id}`,
      'startOffset': '50%' // center text on the arc
    });
    tp.textContent = seg.key;
    t.appendChild(tp);
    // Important: let clicks pass through to the slice
    (t as any).style.pointerEvents = 'none';
    g.appendChild(t);

    // Number badge (2..7) near outer rim on mid-angle
    const badgeAngle = mid;
    const bPos = polar(rOuter + badgeOffset, badgeAngle);
    const badge = el('circle', {
      cx: bPos.x.toFixed(2),
      cy: bPos.y.toFixed(2),
      r: String(badgeRadius),
      class: 'badge'
    });
    // No pointer events so slice receives the click
    (badge as any).style.pointerEvents = 'none';
    g.appendChild(badge);

    const bText = el('text', {
      x: bPos.x.toFixed(2),
      y: bPos.y.toFixed(2),
      class: 'badge-text'
    });
    bText.textContent = String(idx + 2); // 2..7
    (bText as any).style.pointerEvents = 'none';
    g.appendChild(bText);
  });

  // Center circle
  const centerCircle = el('circle', {
    cx: String(cx), cy: String(cy), r: String(rCenter),
    fill: 'url(#centerGrad)', stroke: 'white', 'stroke-width': '1.25'
  });
  centerCircle.style.cursor = 'pointer';
  centerCircle.addEventListener('click', (evt) => onSelect(center.key, evt));
  g.appendChild(centerCircle);

  // Center label
  const cLabel = el('text', {
    x: String(cx), y: String(cy),
    class: 'center-label', 'text-anchor': 'middle'
  });
  cLabel.textContent = 'The Individual';
  (cLabel as any).style.pointerEvents = 'none';
  g.appendChild(cLabel);

  // Center badge "1" near the top of the center circle
  const cBadgePos = polar(rCenter - 12, -90); // inside, at 12 o'clock
  const cBadge = el('circle', {
    cx: cBadgePos.x.toFixed(2),
    cy: cBadgePos.y.toFixed(2),
    r: String(9),
    class: 'badge'
  });
  (cBadge as any).style.pointerEvents = 'none';
  g.appendChild(cBadge);

  const cNum = el('text', {
    x: cBadgePos.x.toFixed(2),
    y: cBadgePos.y.toFixed(2),
    class: 'badge-text'
  });
  cNum.textContent = '1';
  (cNum as any).style.pointerEvents = 'none';
  g.appendChild(cNum);

  // --- helpers ---
  function el<K extends keyof SVGElementTagNameMap>(
    name: K,
    attrs: Record<string, string> = {}
  ) {
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
}
