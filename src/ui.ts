// src/ui.ts
import type { ChangeLogEntry, TokenMap } from './types';
import { filenameFor, fetchDocumentHtml } from './api';

export function updateLastUpdatedUI(tokenMap: TokenMap) {
  const el = document.getElementById('updateBox');
  if (!el) return;
  el.textContent = tokenMap.updatedAt
    ? 'Last updated: ' + new Date(tokenMap.updatedAt).toLocaleString()
    : 'Last updated: Never';
}

// Helpers
const stripNumberPrefix = (s: string) => s.replace(/^\s*\d+(?:\.\d+)*\s+/, '');
const possessive = (s: string) => (!s ? '' : /s$/i.test(s) ? s + "'" : s + "'s");

// Canonicalise token keys and support aliases (case-insensitive)
function canonicalKey(k: string): string {
  const kk = (k || '').toLowerCase().trim();
  if (kk === 'organisational' || kk === 'organizational') return 'organisation_name';
  if (kk === 'organisation' || kk === 'organization') return 'organisation_name';
  if (kk === 'organisation_name' || kk === 'organization_name' || kk === 'org' || kk === 'org_name')
    return 'organisation_name';
  if (kk === 'organisation_short' || kk === 'org_short') return 'organisation_short';
  if (kk === 'resident' || kk === 'resident_name' || kk === 'consumer') return 'person';
  if (kk === 'person' || kk === 'persons') return 'person';
  if (kk === 'service' || kk === 'service-type' || kk === 'service_type') return 'service_type';
  return kk;
}

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
    const display = stripNumberPrefix(p);
    const div = document.createElement('div');
    div.className = 'policy-item';
    div.style.background = color;
    div.textContent = display;
    div.title = p;
    div.dataset.policy = p;
    div.addEventListener('click', () => onClick(p));
    listEl.appendChild(div);
  });
}

/** Build the Updates drawer content (left side). */
export function buildUpdatesPanel(html: string, changeLog: ChangeLogEntry[]) {
  const upEl = document.getElementById('updatesContent');
  if (!upEl) return;

  // Find all token keys referenced in the document
  const CURLY  = /\{\{\s*([\w_]+)\s*\}\}/gi;
  const SQUARE = /\[\s*([\w_]+)\s*(?:['’]s)?\s*\]/gi;

  const tokens = new Set<string>();
  for (const m of html.matchAll(CURLY))  tokens.add(canonicalKey(m[1] || ''));
  for (const m of html.matchAll(SQUARE)) tokens.add(canonicalKey(m[1] || ''));

  // Filter relevant changelog entries and sort newest first
  const relevant = Array.isArray(changeLog)
    ? changeLog
        .filter(e => tokens.has(canonicalKey(e.field as string)))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    : [];

  if (!relevant.length) {
    upEl.innerHTML = '<p class="muted">No updates for this document.</p>';
    upEl.classList.remove('hidden');
    return;
  }

  const items = relevant.map(e => {
    const ts = new Date(e.timestamp).toLocaleString();
    const field = canonicalKey(String(e.field || ''));
    const oldV = String(e.oldValue ?? '—');
    const newV = String(e.newValue ?? '—');
    const who  = String(e.user || 'unknown');
    return `
      <li class="update-item">
        <div class="update-head"><strong>${ts}</strong> — ${who}</div>
        <div class="update-body">Changed <em>${field}</em><br>
          <span class="delta"><span class="from">“${oldV}”</span> → <span class="to">“${newV}”</span></span>
        </div>
      </li>
    `;
  }).join('');

  upEl.innerHTML = `<ul class="updates-list">${items}</ul>`;
  upEl.classList.remove('hidden'); // ensure visible inside the drawer
}

// Replacement with aliases, possessives, and simple “123/123s/123’s” mapping
export function replaceTokens(html: string, tokenMap: TokenMap) {
  const get = (key: string) => (tokenMap as any)[key];

  let out = html;

  // Handle 123 placeholders used in some docs
  const p = String(get('person') || '');
  out = out.replace(/\b123['’]s\b/g, possessive(p));
  out = out.replace(/\b123s\b/g, p ? (p.endsWith('s') ? p : p + 's') : '123s');
  out = out.replace(/\b123\b/g, p || '123');

  // Possessive bracket tokens: [key's] or [key’s]
  out = out.replace(/\[\s*([\w_]+)\s*['’]s\s*\]/gi, (_m, k: string) => {
    const v = get(canonicalKey(k));
    return v ? possessive(String(v)) : `[${k}'s]`;
  });

  // Non-possessive bracket tokens
  out = out.replace(/\[\s*([\w_]+)\s*\]/gi, (_m, k: string) => {
    const v = get(canonicalKey(k));
    return (v ?? `[${k}]`) as string;
  });

  // Curly tokens
  out = out.replace(/\{\{\s*([\w_]+)\s*\}\}/gi, (_m, k: string) => {
    const v = get(canonicalKey(k));
    return (v ?? `{{${k}}}`) as string;
  });

  return out;
}

export async function loadAndRender(
  segment: string,
  policy: string,
  tokenMap: TokenMap,
  changeLog: ChangeLogEntry[]
) {
  const docEl = document.getElementById('docContent');
  if (docEl) docEl.textContent = 'Loading…';
  try {
    const fileName = filenameFor(segment, policy);
    const html = await fetchDocumentHtml(fileName);
    const tokenised = replaceTokens(html, tokenMap);
    if (docEl) docEl.innerHTML = tokenised;
    buildUpdatesPanel(html, changeLog); // fill left drawer
  } catch (err: any) {
    if (docEl) docEl.innerHTML = `<p>Error loading document: ${String(err?.message || err)}</p>`;
    const upEl = document.getElementById('updatesContent');
    if (upEl) {
      upEl.innerHTML = '<p class="muted">No updates for this document.</p>';
      upEl.classList.remove('hidden');
    }
  }
}
