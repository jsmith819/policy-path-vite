export type WheelSection = { name: string; color: string };
export function drawWheel(svg: SVGSVGElement, onSelect: (name: string, evt: Event) => void) {
  const outer: WheelSection[] = [
    { name: 'The organisation',      color: '#85BF46' },
    { name: 'Care and services',     color: '#9576BB' },
    { name: 'The environment',       color: '#23293C' },
    { name: 'Clinical care',         color: '#33AEBF' },
    { name: 'Food and nutrition',    color: '#F78D1E' },
    { name: 'Residential community', color: '#FBB040' }
  ];
  const cx = 300, cy = 300, rInner = 100, rOuter = 250;
  const slice = Math.PI * 2 / outer.length;
  const start = -Math.PI/2 - slice/2;
  function pathD(a1: number, a2: number) {
    const large = slice > Math.PI ? 1 : 0;
    const x1 = cx + rOuter*Math.cos(a1), y1 = cy + rOuter*Math.sin(a1);
    const x2 = cx + rOuter*Math.cos(a2), y2 = cy + rOuter*Math.sin(a2);
    const x3 = cx + rInner*Math.cos(a2), y3 = cy + rInner*Math.sin(a2);
    const x4 = cx + rInner*Math.cos(a1), y4 = cy + rInner*Math.sin(a1);
    return [`M ${x4},${y4}`, `L ${x1},${y1}`, `A ${rOuter},${rOuter} 0 ${large},1 ${x2},${y2}`, `L ${x3},${y3}`, `A ${rInner},${rInner} 0 ${large},0 ${x4},${y4}`, `Z`].join(' ');
  }
  outer.forEach((sec, i) => {
    const a1 = start + i*slice, a2 = start + (i+1)*slice;
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', pathD(a1, a2));
    path.setAttribute('fill', sec.color);
    (path as any).style.cursor = 'pointer';
    path.addEventListener('click', (evt) => onSelect(sec.name, evt));
    svg.appendChild(path);
    const mid = (a1 + a2) / 2;
    const tx = cx + (rInner + rOuter)/2 * Math.cos(mid);
    const ty = cy + (rInner + rOuter)/2 * Math.sin(mid);
    const txt = document.createElementNS(svg.namespaceURI, 'text');
    txt.setAttribute('x', String(tx));
    txt.setAttribute('y', String(ty));
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('dominant-baseline', 'middle');
    txt.setAttribute('fill', '#fff');
    txt.setAttribute('font-size', '16');
    txt.textContent = sec.name;
    svg.appendChild(txt);
  });
  const c = document.createElementNS(svg.namespaceURI, 'circle');
  c.setAttribute('cx', String(cx)); c.setAttribute('cy', String(cy)); c.setAttribute('r', String(rInner));
  c.setAttribute('fill', '#DF5A72'); (c as any).style.cursor = 'pointer';
  c.addEventListener('click', (evt) => onSelect('1. The Individual', evt));
  svg.appendChild(c);
  const centreTxt = document.createElementNS(svg.namespaceURI, 'text');
  centreTxt.setAttribute('x', String(cx)); centreTxt.setAttribute('y', String(cy));
  centreTxt.setAttribute('text-anchor', 'middle'); centreTxt.setAttribute('dominant-baseline', 'middle');
  centreTxt.setAttribute('fill', '#fff'); centreTxt.setAttribute('font-size', '18');
  centreTxt.textContent = 'The Individual'; svg.appendChild(centreTxt);
}
