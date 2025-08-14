import type { ChangeLogEntry, TokenMap } from './types';
import { filenameFor, fetchDocumentHtml } from './api';

export function updateLastUpdatedUI(tokenMap: TokenMap) {
  const el = document.getElementById('updateBox');
  if (!el) return;
  el.textContent = tokenMap.updatedAt ? 'Last updated: ' + new Date(tokenMap.updatedAt).toLocaleString() : 'Last updated: Never';
}

// At top (near other helpers)
const stripNumberPrefix = (s: string) => s.replace(/^\s*\d+(?:\.\d+)*\s+/, '');

// ...

export function renderPolicies(
  _segmentName: string,
  policies: string[],
  onClick: (policy: string) => void,
  color: string
) {
  const listEl = document.getElementById('policies-list');
  if (!listEl) return;

  listEl.innerHTML = '';
  policies.forEach(p => {
    const display = stripNumberPrefix(p); // <— show without leading numbers
    const div = document.createElement('div');
    div.className = 'policy-item';
    div.style.background = color;
    div.textContent = display;            // <— display label
    div.title = p;                        // tooltip shows the full title
    div.dataset.policy = p;               // keep original for mapping
    div.addEventListener('click', () => onClick(p)); // pass original to loader
    listEl.appendChild(div);
  });
}

export function buildUpdatesPanel(html: string, changeLog: ChangeLogEntry[]) {
  const upEl = document.getElementById('updatesContent');
  if (!upEl) return;

  const CURLY  = /{{\s*([\w_]+)\s*}}/g;
  const SQUARE = /\[\s*([\w_]+)\s*('s)?\s*\]/g;

  const tokens = new Set<string>();
  for (const m of html.matchAll(CURLY))  tokens.add((m[1] || '').trim());
  for (const m of html.matchAll(SQUARE)) tokens.add((m[1] || '').trim());

  const relevant = Array.isArray(changeLog) ? changeLog.filter(e => tokens.has(e.field)) : [];
  upEl.innerHTML = relevant.length
    ? relevant.map(e => {
        const ts = new Date(e.timestamp).toLocaleString();
        return `<p><strong>${ts}</strong> — ${e.user} changed <em>${e.field}</em> from “${e.oldValue}” to “${e.newValue}”</p>`;
      }).join('')
    : '<p>No updates for this document.</p>';

  upEl.classList.add('hidden');
}


export function replaceTokens(html: string, tokenMap: TokenMap) {
  // Curly tokens: {{ person }}
  const CURLY = /{{\s*([\w_]+)\s*}}/g;
  // Square tokens: [person] or [person's]
  //   - Captures the key and an optional "'s"
  const SQUARE = /\[\s*([\w_]+)\s*('s)?\s*\]/g;

  const subst = (key: string) =>
    (tokenMap as any)?.[key.trim()] ?? `[${key.trim()}]`;

  return html
    .replace(CURLY, (_, k: string) => subst(k))
    .replace(SQUARE, (_, k: string, poss: string | undefined) => subst(k) + (poss ?? ''));
}


export async function loadAndRender(segment: string, policy: string, tokenMap: TokenMap, changeLog: ChangeLogEntry[]) {
  const docEl = document.getElementById('docContent');
  if (docEl) docEl.textContent = 'Loading…';
  try {
    const fileName = filenameFor(segment, policy);
    const html = await fetchDocumentHtml(fileName);
    const tokenised = replaceTokens(html, tokenMap);
    if (docEl) docEl.innerHTML = tokenised;
    buildUpdatesPanel(html, changeLog);
  } catch (err: any) {
    if (docEl) docEl.innerHTML = `<p>Error loading document: ${String(err?.message || err)}</p>`;
    const upEl = document.getElementById('updatesContent');
    if (upEl) { upEl.innerHTML = '<p>No updates for this document.</p>'; upEl.classList.add('hidden'); }
  }
}
