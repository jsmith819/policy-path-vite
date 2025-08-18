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
  const rOuter  = 140; // donut outer radius
  const rInner  = 82;  // donut inner radius
  const rCenter = 58;  // centre circle radius

  // Put label path very close to the rim so it "hugs" the outer curve
  const labelInset  = 6;  // << was 12
  const labelPadDeg = 8;

  // Corner triangle sizing
  const triRadialDepth = 14;
  const triSweepDeg    = 10;

  // Segments (keys must match main.ts)
  const segments: { key: string; color: string }[] = [
    { key: 'The organisation',      color: '#6aaf4b' },
    { key: 'Care and services',     color: '#7e5aa2' },
    { key: 'The environment',       color: '#29335c' },
    { key: 'Clinical care',         color: '#29a9c7' },
    { key: 'Food and nutrition',    color: '#f18f01' },
    { key: 'Residential community', color: '#faa916' }
  ];
  const center = { key: '1. The Individual', color: '#e94e77' };

  // --- defs ---------------------------------------------------------------
  const defs = svg.appendChild(el('defs'));

  const drop = el('filter', { id: 'softDrop' });
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

  // FIXED: compute sweep/large flags from angle direction so we always use the short arc
  const arcPath = (r: number, a0: number, a1: number) => {
    const p0 = polar(r, a0), p1 = polar(r, a1);
    let da = a1 - a0;
    // normalize to [-360, 360] in case of wrap
    if (da > 360) da -= 360; else if (da < -360) da += 360;
    const large = Math.abs(da) > 180 ? 1 : 0;
    const sweep = da >= 0 ? 1 : 0; // positive delta -> sweep=1, negative -> sweep=0
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

  // --- root group & inner ring -------------------------------------------
  const g = svg.appendChild(el('g', { filter: 'url(#softDrop)' }));

  const innerRing = el('circle', { cx: String(cx), cy: String(cy), r: String(rInner - 1) });
  innerRing.setAttribute('fill', 'none');
  innerRing.setAttribute('stroke', '#fff');
  innerRing.setAttribute('stroke-width', '14');
  innerRing.style.pointerEvents = 'none';
  g.appendChild(innerRing);

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
    g.appendChild(slice);

    // Curved label path — always left→right; extra pad on triangle side; hugs outer rim
    const labelR = rOuter - labelInset;
    const topHalf = !(mid > 90 && mid < 270);
    const extraPadAtTriangle = 8;
    const padStart = side === 'start' ? labelPadDeg + extraPadAtTriangle : labelPadDeg;
    const padEnd   = side === 'end'   ? labelPadDeg + extraPadAtTriangle : labelPadDeg;
    const L0 = topHalf ? (a0 + padStart) : (a1 - padEnd);
    const L1 = topHalf ? (a1 - padEnd)   : (a0 + padStart);

    const pathId = `labelPath${idx}`;
    const labelPath = el('path', { id: pathId, d: arcPath(labelR, L0, L1), fill: 'none', stroke: 'none' });
    defs.appendChild(labelPath);

    const t  = el('text', { class: 'arc-label' }) as SVGTextElement;
    const tp = el('textPath', { startOffset: '50%' }) as SVGTextPathElement;
    (tp as any).setAttributeNS(XLINK, 'xlink:href', `#${pathId}`);
    tp.setAttribute('href', `#${pathId}`);
    tp.textContent = seg.key;
    t.appendChild(tp);
    (t.style as any).pointerEvents = 'none';
    g.appendChild(t);

    fitTextToPath(t, labelPath, 10, 8);

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
    g.appendChild(tri);

    const tx = (P0.x + P1.x + P2.x) / 3;
    const ty = (P0.y + P1.y + P2.y) / 3;
    const num = document.createElementNS(NS, 'text');
    num.setAttribute('class', 'badge-text');
    num.setAttribute('x', tx.toFixed(2));
    num.setAttribute('y', ty.toFixed(2));
    num.textContent = String(idx + 2);
    (num.style as any).fill = contrastColor(triFill);
    (num as any).style.pointerEvents = 'none';
    g.appendChild(num);
  });

  // White separators
  for (let i = 0; i < segments.length; i++) {
    const a  = start + i * step;
    const p0 = polar(rInner + 2, a);
    const p1 = polar(rOuter - 2, a);
    const sep = el('line', { x1: p0.x.toFixed(2), y1: p0.y.toFixed(2), x2: p1.x.toFixed(2), y2: p1.y.toFixed(2), class: 'separator' });
    sep.style.pointerEvents = 'none';
    g.appendChild(sep);
  }

  // Centre circle + label
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

  // Centre "1" badge (tinted)
  const cPos = polar(rCenter - 12, -90);
  const cBadge = el('circle', { cx: cPos.x.toFixed(2), cy: cPos.y.toFixed(2), r: '9', class: 'badge' });
  const cBadgeFill   = shade(center.color, 0.20);
  const cBadgeStroke = shade(center.color, -0.10);
  (cBadge.style as any).fill   = cBadgeFill;
  (cBadge.style as any).stroke = cBadgeStroke;
  (cBadge as any).style.pointerEvents = 'none';
  g.appendChild(cBadge);

  const cNum = el('text', { x: cPos.x.toFixed(2), y: cPos.y.toFixed(2), class: 'badge-text' });
  cNum.textContent = '1';
  (cNum.style as any).fill = contrastColor(cBadgeFill);
  (cNum as any).style.pointerEvents = 'none';
  g.appendChild(cNum);

  // ---- helpers -----------------------------------------------------------
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
