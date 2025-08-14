// src/wheel.ts
// Curved labels (upright), numbers inside each slice, white inner ring & separators.

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
  const rOuter  = 140;  // donut outer radius
  const rInner  = 82;   // donut inner radius
  const rCenter = 58;   // center circle radius

  // Label path sits slightly inboard of the outer rim
  const labelInset   = 12;
  // Trim at slice ends so text doesn't hit sharp corners
  const labelPadDeg  = 8;

  // Number badges (inside the slice)
  const badgeRadius  = 10;
  const badgeInboard = 12;  // how far from the outer rim to place badges (inside)

  // Segment colours & keys (must match main.ts)
  const segments: { key: string; color: string }[] = [
    { key: 'The organisation',      color: '#6aaf4b' },
    { key: 'Care and services',     color: '#7e5aa2' },
    { key: 'The environment',       color: '#29335c' },
    { key: 'Clinical care',         color: '#29a9c7' },
    { key: 'Food and nutrition',    color: '#f18f01' },
    { key: 'Residential community', color: '#faa916' }
  ];
  const center = { key: '1. The Individual', color: '#e94e77' };

  // --- defs
  const defs = svg.appendChild(el('defs'));

  const drop = el('filter', { id: 'softDrop' });
  drop.innerHTML = `<feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="rgba(0,0,0,.25)" />`;
  defs.appendChild(drop);

  const mkGrad = (id: string, base: string) => {
    const g = el('linearGradient', { id, x1:'0%', y1:'0%', x2:'100%', y2:'100%' });
    const stop = (o:number,c:string) => g.appendChild(el('stop',{ offset:`${o*100}%`, 'stop-color':c }));
    stop(0, shade(base, 0.12));
    stop(1, shade(base,-0.08));
    defs.appendChild(g);
  };
  segments.forEach((s,i)=>mkGrad(`segGrad${i}`, s.color));
  mkGrad('centerGrad', center.color);

  // Math helpers
  const toRad = (d:number)=> (Math.PI/180)*d;
  const polar = (r:number, aDeg:number)=> ({ x: cx + r*Math.cos(toRad(aDeg)), y: cy + r*Math.sin(toRad(aDeg)) });

  const arcPath = (r:number, a0:number, a1:number) => {
    const large = Math.abs(a1-a0) > 180 ? 1 : 0;
    const p0 = polar(r,a0), p1 = polar(r,a1);
    return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  };

  const donutPath = (a0:number, a1:number) => {
    const large = Math.abs(a1-a0) > 180 ? 1 : 0;
    const po0 = polar(rOuter,a0), po1 = polar(rOuter,a1);
    const pi0 = polar(rInner,a1), pi1 = polar(rInner,a0);
    return [
      `M ${po0.x.toFixed(2)} ${po0.y.toFixed(2)}`,
      `A ${rOuter} ${rOuter} 0 ${large} 1 ${po1.x.toFixed(2)} ${po1.y.toFixed(2)}`,
      `L ${pi0.x.toFixed(2)} ${pi0.y.toFixed(2)}`,
      `A ${rInner} ${rInner} 0 ${large} 0 ${pi1.x.toFixed(2)} ${pi1.y.toFixed(2)}`,
      'Z'
    ].join(' ');
  };

  // Root group
  const g = svg.appendChild(el('g', { filter:'url(#softDrop)' }));

  // Thick white inner ring between slices and the centre
  const innerRing = el('circle', { cx:String(cx), cy:String(cy), r:String(rInner-1) });
  innerRing.setAttribute('fill','none');
  innerRing.setAttribute('stroke','#fff');
  innerRing.setAttribute('stroke-width','14');
  innerRing.style.pointerEvents = 'none';
  g.appendChild(innerRing);

  // Draw wedges
  const start = -90;
  const step  = 360 / segments.length;

  segments.forEach((seg, idx) => {
    const a0  = start + idx*step;
    const a1  = a0 + step;
    const mid = (a0 + a1) / 2;

    // Slice body
    const slice = el('path',{
      d: donutPath(a0,a1),
      fill: `url(#segGrad${idx})`,
      stroke:'#fff', 'stroke-width':'1.25',
      tabindex:'0', role:'button',
      'data-name': seg.key, 'aria-label': seg.key
    });
    slice.style.cursor = 'pointer';
    slice.classList.add('seg');
    slice.addEventListener('click', (evt)=>onSelect(seg.key,evt));
    slice.addEventListener('keypress', (evt:any)=>{ if (evt.key==='Enter'||evt.key===' ') onSelect(seg.key,evt); });
    g.appendChild(slice);

    // Label path: build it so text always reads left-to-right (no rotation hack)
    // Top half (mid in [-90..90] or [270..360]) -> clockwise a0->a1
    // Bottom half (mid in (90..270))             -> reverse a1->a0 (so glyphs stay upright)
    const labelR = rOuter - labelInset;
    const topHalf = !(mid > 90 && mid < 270);
    const L0 = topHalf ? a0 + labelPadDeg : a1 - labelPadDeg;
    const L1 = topHalf ? a1 - labelPadDeg : a0 + labelPadDeg;

    const pathId = `labelPath${idx}`;
    const labelPath = el('path', { id: pathId, d: arcPath(labelR, L0, L1), fill:'none', stroke:'none' });
    defs.appendChild(labelPath);

    const t = el('text', { class: 'arc-label' }) as SVGTextElement;
    const tp = el('textPath', { 'startOffset':'50%' }) as SVGTextPathElement;
    // support Safari + modern
    (tp as any).setAttributeNS(XLINK,'xlink:href', `#${pathId}`);
    tp.setAttribute('href', `#${pathId}`);
    tp.textContent = seg.key;
    t.appendChild(tp);
    (t.style as any).pointerEvents = 'none';
    g.appendChild(t);

    // Fit text to the available arc length (down to 8px if needed)
    fitTextToPath(t, labelPath, 10, 8);

    // Number badge **inside** the slice near the rim
    const bPos = polar(rOuter - badgeInboard, mid);
    const badge = el('circle', {
      cx: bPos.x.toFixed(2), cy: bPos.y.toFixed(2), r: String(badgeRadius), class: 'badge'
    });
    (badge as any).style.pointerEvents = 'none';
    g.appendChild(badge);

    const bText = el('text', { x: bPos.x.toFixed(2), y: bPos.y.toFixed(2), class: 'badge-text' });
    bText.textContent = String(idx + 2); // 2..7
    (bText as any).style.pointerEvents = 'none';
    g.appendChild(bText);
  });

  // White separators between slices (rounded)
  for (let i = 0; i < segments.length; i++) {
    const a = start + i*step;
    const p0 = polar(rInner + 2, a);
    const p1 = polar(rOuter - 2, a);
    const sep = el('line', { x1:p0.x.toFixed(2), y1:p0.y.toFixed(2), x2:p1.x.toFixed(2), y2:p1.y.toFixed(2), class:'separator' });
    sep.style.pointerEvents = 'none';
    g.appendChild(sep);
  }

  // Centre circle + label
  const centerCircle = el('circle', { cx:String(cx), cy:String(cy), r:String(rCenter), fill:'url(#centerGrad)', stroke:'#fff', 'stroke-width':'1.25' });
  centerCircle.style.cursor = 'pointer';
  centerCircle.addEventListener('click', (evt)=>onSelect(center.key,evt));
  g.appendChild(centerCircle);

  const cLabel = el('text', { x:String(cx), y:String(cy), class:'center-label', 'text-anchor':'middle' });
  cLabel.textContent = 'The Individual';
  (cLabel as any).style.pointerEvents = 'none';
  g.appendChild(cLabel);

  // Centre "1" badge at 12 o'clock *inside* the centre
  const cPos = polar(rCenter - 12, -90);
  const cBadge = el('circle', { cx:cPos.x.toFixed(2), cy:cPos.y.toFixed(2), r:'9', class:'badge' });
  (cBadge as any).style.pointerEvents = 'none';
  g.appendChild(cBadge);
  const cNum = el('text', { x:cPos.x.toFixed(2), y:cPos.y.toFixed(2), class:'badge-text' });
  cNum.textContent = '1';
  (cNum as any).style.pointerEvents = 'none';
  g.appendChild(cNum);

  // ---- helpers ----
  function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string,string> = {}) {
    const node = document.createElementNS(NS, name);
    for (const [k,v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }

  function shade(hex:string, amt:number) {
    const c = hex.replace('#',''); const n = parseInt(c,16);
    const r = Math.min(255, Math.max(0, ((n>>16)&0xff) + Math.round(255*amt)));
    const g = Math.min(255, Math.max(0, ((n>>8 )&0xff) + Math.round(255*amt)));
    const b = Math.min(255, Math.max(0, ( n     &0xff) + Math.round(255*amt)));
    return `#${(r<<16 | g<<8 | b).toString(16).padStart(6,'0')}`;
  }

  function fitTextToPath(textEl: SVGTextElement, pathEl: SVGPathElement, maxPx=10, minPx=8) {
    const pathLen = pathEl.getTotalLength() - 6; // small safety margin
    let size = maxPx;
    (textEl.style as any).fontSize = `${size}px`;
    for (let i=0;i<10;i++) {
      const tLen = textEl.getComputedTextLength();
      if (tLen <= pathLen || size <= minPx) break;
      size -= 0.5;
      (textEl.style as any).fontSize = `${size}px`;
    }
  }
}
