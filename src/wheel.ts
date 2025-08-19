// src/wheel.ts
// Curved labels (upright), corner triangles with numbers, white inner ring & separators.

const NS    = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';

export function drawWheel(
  svg: SVGSVGElement,
  onSelect: (segmentName: string, evt: Event) => void
) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  // Canvas / geometry
  svg.setAttribute('viewBox', '0 0 320 320');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.style.width  = '100%';
  svg.style.height = '100%';

  const cx = 160, cy = 160;
  const rOuter  = 148; // donut outer radius
  const rInner  = 90;  // donut inner radius
  const rCenter = 66;  // centre circle radius

  // Label path radius control
  const labelInset  = 6;     // base inset from outer rim
  const labelPadDeg = 4;     // angular padding at both ends of label arcs
  // Extra breathing room
  const topRadialFix = 3;    // push top-half labels further inward (px)
  const topPadFixDeg = 2;    // add angular pad on top-half labels

  // Corner triangle sizing
  const triRadialDepth = 14;
  const triSweepDeg    = 10;

  // Segments (keys must match main.ts policiesData keys)
  const segments: { key: string; color: string }[] = [
    { key: 'The Organisation',      color: '#6aaf4b' },
    { key: 'Care and Services',     color: '#7e5aa2' },
    { key: 'The Environment',       color: '#29335c' },
    { key: 'Clinical Care',         color: '#29a9c7' },
    { key: 'Food and Nutrition',    color: '#f18f01' },
    { key: 'Residential Community', color: '#faa916' }
  ];
  const center = { key: '1. The Individual', color: '#e94e77' };

  // Labels to invert along the arc
  const invertLabelByKey: Record<string, boolean> = {
    'The Organisation': false,
    'Care and Services': false,
    'The Environment': true,
    'Clinical Care': true,
    'Food and Nutrition': false,
    'Residential Community': true
  };

  // Extra radial inset for specific labels (moves text away from rim)
  const extraLabelInsetByKey: Record<string, number> = {
    'Residential Community': 6,
    'The Organisation': 6,
    'Care and Services': 6
  };

  // --- defs ---------------------------------------------------------------
  const defs = svg.appendChild(el('defs'));

  // Safe filter region (prevents clipping of slices)
  const drop = el('filter', {
    id: 'softDrop',
    filterUnits: 'userSpaceOnUse',
    x: '0', y: '0', width: '320', height: '320'
  });
  drop.innerHTML = `<feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="rgba(0,0,0,.25)" />`;
  defs.appendChild(drop);

  const mkGrad = (id: string, base: string) => {
    const g = el('linearGradient', { id, x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
    const stop = (o: number, c: string) =>
      g.appendChild(el('stop', { offset: `${o * 100}%`, 'stop-color': c }));
    stop(0, shade(base, 0.12));
    stop(1, shade(base, -0.08));
    defs.appendChild(g);
  };
  segments.forEach((s, i) => mkGrad(`segGrad${i}`, s.color));
  mkGrad('centerGrad', center.color);

  // --- helpers ------------------------------------------------------------
  const toRad = (d: number) => (Math.PI / 180) * d;
  const polar = (r: number, aDeg: number) =>
    ({ x: cx + r * Math.cos(toRad(aDeg)), y: cy + r * Math.sin(toRad(aDeg)) });

  // arc following direction
  const arcPath = (r: number, a0: number, a1: number) => {
    const p0 = polar(r, a0), p1 = polar(r, a1);
    let da = a1 - a0;
    if (da > 360) da -= 360; else if (da < -360) da += 360;
    const large = Math.abs(da) > 180 ? 1 : 0;
    const sweep = da >= 0 ? 1 : 0;
    return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  };

  const donutPath = (a0: number, a1: number) => {
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    const po0 = polar(rOuter, a0), po1 = polar(rOuter, a1);
    const pi0 = polar(rInner, a1), pi1 = polar(rInner, a0);
    return [
      `M ${po0.x.toFixed(2)} ${po0.y.toFixed(2)}`,
      `A ${rOuter} ${rOuter} 0 ${large} 1 ${po1.x.toFixed(2)} ${po1.y.toFixed(2)}`,
      `L ${pi0.x.toFixed(2)} ${pi0.y.toFixed(2)}`,
      `A ${rInner} ${rInner} 0 ${large} 0 ${pi1.x.toFixed(2)} ${pi1.y.toFixed(2)}`,
      'Z'
    ].join(' ');
  };

  function fitTextToPath(textEl: SVGTextElement, pathEl: SVGPathElement, maxPx = 10, minPx = 8) {
    const pathLen = pathEl.getTotalLength() - 6;
    let size = maxPx;
    (textEl.style as any).fontSize = `${size}px`;
    (textEl.style as any).letterSpacing = '0px';
    for (let i = 0; i < 12; i++) {
      const tLen = textEl.getComputedTextLength();
      if (tLen <= pathLen || size <= minPx) break;
      size -= 0.5;
      (textEl.style as any).fontSize = `${size}px`;
    }
    for (let s = 0; s < 8; s++) {
      const tLen = textEl.getComputedTextLength();
      if (tLen <= pathLen) return;
      const cur = parseFloat((textEl.style as any).letterSpacing || '0') || 0;
      (textEl.style as any).letterSpacing = `${cur - 0.1}px`;
    }
    textEl.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    textEl.setAttribute('textLength', Math.max(0, pathLen).toFixed(0));
  }

  // --- root group & layers -----------------------------------------------
  const g = svg.appendChild(el('g', { filter: 'url(#softDrop)' }));
  const gSlices = g.appendChild(el('g')); // wedges + inner ring
  const gSeps   = g.appendChild(el('g')); // white separators
  const gLabels = g.appendChild(el('g')); // labels + triangles + numbers

  // Inner white ring between slices and centre
  const innerRing = el('circle', { cx: String(cx), cy: String(cy), r: String(rInner - 1) });
  innerRing.setAttribute('fill', 'none');
  innerRing.setAttribute('stroke', '#fff');
  innerRing.setAttribute('stroke-width', '8');
  innerRing.style.pointerEvents = 'none';
  gSlices.appendChild(innerRing);

  // --- wedges -------------------------------------------------------------
  const step  = 360 / segments.length;
  const start = -90 - step / 2; // green centred at 12 o’clock

  // Which corner gets the triangle (start boundary or end boundary)
  const cornerSide: ('start' | 'end')[] = ['end', 'end', 'end', 'end', 'end', 'end'];

  segments.forEach((seg, idx) => {
    const a0  = start + idx * step;
    const a1  = a0 + step;
    const mid = (a0 + a1) / 2;
    const side = cornerSide[idx];

    // Slice body
    const slice = el('path', {
      d: donutPath(a0, a1),
      fill: `url(#segGrad${idx})`,
      stroke: '#fff',
      'stroke-width': '1.25',
      tabindex: '0',
      role: 'button',
      'data-name': seg.key,
      'aria-label': seg.key
    });
    slice.style.cursor = 'pointer';
    slice.classList.add('seg');
    slice.addEventListener('click', (evt) => onSelect(seg.key, evt));
    slice.addEventListener('keypress', (evt: any) => { if (evt.key === 'Enter' || evt.key === ' ') onSelect(seg.key, evt); });
    gSlices.appendChild(slice);

    // --- Curved label path ------------------------------------------------
    const topHalf = !(mid > 90 && mid < 270); // compute before use

    // radial position of label baseline
    const extraInset = extraLabelInsetByKey[seg.key] || 0;
    const labelR = rOuter - (labelInset + extraInset + (topHalf ? topRadialFix : 0));

    // extra pad so label avoids the triangle corner
    const EXTRA = 4;
    let padStart = side === 'start' ? labelPadDeg + EXTRA : labelPadDeg;
    let padEnd   = side === 'end'   ? labelPadDeg + EXTRA : labelPadDeg;
    if (topHalf) { padStart += topPadFixDeg; padEnd += topPadFixDeg; }

    // direction to keep text upright
    let forward = topHalf;
    if (invertLabelByKey[seg.key]) forward = !forward;

    // build the arc in the chosen direction
    let L0 = forward ? (a0 + padStart) : (a1 - padEnd);
    let L1 = forward ? (a1 - padEnd)   : (a0 + padStart);

    const pathId = `labelPath${idx}`;
    const labelPath = el('path', {
      id: pathId,
      d: arcPath(labelR, L0, L1),
      fill: 'none',
      stroke: 'none'
    }) as SVGPathElement;
    defs.appendChild(labelPath);

    const t  = el('text', { class: 'arc-label', 'text-anchor': 'middle' }) as SVGTextElement;
    const tp = el('textPath', { startOffset: '50%' }) as SVGTextPathElement;
    (tp as any).setAttributeNS(XLINK, 'xlink:href', `#${pathId}`);
    tp.setAttribute('href', `#${pathId}`);
    tp.textContent = seg.key;
    t.appendChild(tp);
    (t.style as any).pointerEvents = 'none';
    gLabels.appendChild(t);

    // auto-fit
    fitTextToPath(t, labelPath, 10, 7);

    // If still tight, shave some pad and re-fit down to 6px
    const pathLen = labelPath.getTotalLength() - 6;
    if (t.getComputedTextLength() > pathLen) {
      padStart = Math.max(2, padStart - 3);
      padEnd   = Math.max(2, padEnd   - 3);
      L0 = forward ? (a0 + padStart) : (a1 - padEnd);
      L1 = forward ? (a1 - padEnd)   : (a0 + padStart);
      labelPath.setAttribute('d', arcPath(labelR, L0, L1));
      fitTextToPath(t, labelPath, 9, 6);
    }

    // --- Corner triangle with number --------------------------------------
    const cornerAngle   = side === 'start' ? a0 : a1;
    const intoWedgeSign = side === 'start' ? +1 : -1;

    const rimR   = rOuter - 1;
    const innerR = rOuter - triRadialDepth;

    const P0 = polar(rimR,   cornerAngle);
    const P1 = polar(innerR, cornerAngle);
    const P2 = polar(rimR,   cornerAngle + intoWedgeSign * triSweepDeg);

    const tri = document.createElementNS(NS, 'polygon');
    tri.setAttribute('points', `${P0.x.toFixed(2)},${P0.y.toFixed(2)} ${P1.x.toFixed(2)},${P1.y.toFixed(2)} ${P2.x.toFixed(2)},${P2.y.toFixed(2)}`);
    tri.setAttribute('class', 'corner-tri');
    const triFill   = shade(seg.color, 0.20);
    const triStroke = shade(seg.color, -0.10);
    (tri.style as any).fill   = triFill;
    (tri.style as any).stroke = triStroke;
    (tri as any).style.pointerEvents = 'none';
    gLabels.appendChild(tri);

    const tx = (P0.x + P1.x + P2.x) / 3;
    const ty = (P0.y + P1.y + P2.y) / 3;
    const num = document.createElementNS(NS, 'text');
    num.setAttribute('class', 'badge-text');
    num.setAttribute('x', tx.toFixed(2));
    num.setAttribute('y', ty.toFixed(2));
    num.textContent = String(idx + 2); // 2..7
    (num.style as any).fill = contrastColor(triFill);
    (num as any).style.pointerEvents = 'none';
    gLabels.appendChild(num);
  });

  // White separators (drawn above slices, below labels)
  for (let i = 0; i < segments.length; i++) {
    const a  = start + i * step;
    const p0 = polar(rInner + 2, a);
    const p1 = polar(rOuter - 2, a);
    const sep = el('line', {
      x1: p0.x.toFixed(2), y1: p0.y.toFixed(2),
      x2: p1.x.toFixed(2), y2: p1.y.toFixed(2),
      class: 'separator'
    });
    sep.style.pointerEvents = 'none';
    gSeps.appendChild(sep);
  }

  // Centre circle + label
  const centerCircle = el('circle', {
    cx: String(cx), cy: String(cy), r: String(rCenter),
    fill: 'url(#centerGrad)', stroke: '#fff', 'stroke-width': '1.25'
  });
  centerCircle.style.cursor = 'pointer';
  centerCircle.addEventListener('click', (evt) => onSelect(center.key, evt));
  gSlices.appendChild(centerCircle);

  const cLabel = el('text', { x: String(cx), y: String(cy), class: 'center-label', 'text-anchor': 'middle' });
  cLabel.textContent = 'The Individual';
  (cLabel as any).style.pointerEvents = 'none';
  gLabels.appendChild(cLabel);

  // Centre "1" badge (tinted)
  const cPos = polar(rCenter - 12, -90);
  const cBadge = el('circle', { cx: cPos.x.toFixed(2), cy: cPos.y.toFixed(2), r: '9', class: 'badge' });
  const cBadgeFill   = shade(center.color, 0.20);
  const cBadgeStroke = shade(center.color, -0.10);
  (cBadge.style as any).fill   = cBadgeFill;
  (cBadge.style as any).stroke = cBadgeStroke;
  (cBadge as any).style.pointerEvents = 'none';
  gLabels.appendChild(cBadge);

  const cNum = el('text', { x: cPos.x.toFixed(2), y: cPos.y.toFixed(2), class: 'badge-text' });
  cNum.textContent = '1';
  (cNum.style as any).fill = contrastColor(cBadgeFill);
  (cNum as any).style.pointerEvents = 'none';
  gLabels.appendChild(cNum);

  // ---- helpers -----------------------------------------------------------
  function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string> = {}) {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node as SVGElementTagNameMap[K];
  }

  function shade(hex: string, amt: number) {
    const c = hex.replace('#', '');
    const n = parseInt(c, 16);
    const r = Math.min(255, Math.max(0, ((n >> 16) & 0xff) + Math.round(255 * amt)));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + Math.round(255 * amt)));
    const b = Math.min(255, Math.max(0, (n & 0xff) + Math.round(255 * amt)));
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
  }

  function contrastColor(hex: string) {
    const to = (s: string) => parseInt(s, 16) / 255;
    const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const r = lin(to(hex.slice(1, 3)));
    const g = lin(to(hex.slice(3, 5)));
    const b = lin(to(hex.slice(5, 7)));
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return L > 0.55 ? '#333' : '#fff';
  }
}
