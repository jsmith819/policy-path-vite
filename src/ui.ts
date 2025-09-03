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

// Map bracket variants to canonical token keys
function canonicalKey(k: string): string {
  const kk = (k || '').toLowerCase().trim();
  if (kk === 'organisation' || kk === 'organization' || kk === 'organisation_name' || kk === 'organization_name')
    return 'organisation_name';
  if (kk === 'resident' || kk === 'resident_name') return 'person';
  if (kk === 'person' || kk === 'persons') return 'person';
  if (kk === 'service' || kk === 'service-type' || kk === 'service_type') return 'service_type';
  return kk; // fall through (works for {{organisation_name}}, etc.)
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

export function buildUpdatesPanel(html: string, changeLog: ChangeLogEntry[]) {
  const upEl = document.getElementById('updatesContent');
  if (!upEl) return;

  const CURLY  = /\{\{\s*([\w_]+)\s*\}\}/gi;
  const SQUARE = /\[\s*([\w_]+)\s*(?:['’]s)?\s*\]/gi;

  const tokens = new Set<string>();
  for (const m of html.matchAll(CURLY))  tokens.add(canonicalKey(m[1] || ''));
  for (const m of html.matchAll(SQUARE)) tokens.add(canonicalKey(m[1] || ''));

  const relevant = Array.isArray(changeLog)
    ? changeLog.filter(e => tokens.has(canonicalKey(e.field as string)))
    : [];

  upEl.innerHTML = relevant.length
    ? relevant.map(e => {
        const ts = new Date(e.timestamp).toLocaleString();
        return `<p><strong>${ts}</strong> — ${e.user} changed <em>${e.field}</em> from “${e.oldValue}” to “${e.newValue}”</p>`;
      }).join('')
    : '<p>No updates for this document.</p>';

  upEl.classList.add('hidden');
}

// Token replacement with aliases and correct possessives
export function replaceTokens(html: string, tokenMap: TokenMap) {
  let out = html;

  // 1) Possessive bracket tokens first: [person's], [resident's], etc.
  out = out.replace(/\[\s*([\w_]+)\s*['’]s\s*\]/gi, (_m, k: string) => {
    const key = canonicalKey(k);
    const val = (tokenMap as any)[key];
    return val ? possessive(String(val)) : `[${k}'s]`;
  });

  // 2) Non-possessive bracket tokens: [Organisation_name], [resident], [organisation], etc.
  out = out.replace(/\[\s*([\w_]+)\s*\]/gi, (_m, k: string) => {
    const key = canonicalKey(k);
    const val = (tokenMap as any)[key];
    return (val ?? `[${k}]`) as string;
  });

  // 3) Curly tokens: {{ organisation_name }}, {{ service_type }}, etc.
  out = out.replace(/\{\{\s*([\w_]+)\s*\}\}/gi, (_m, k: string) => {
    const key = canonicalKey(k);
    const val = (tokenMap as any)[key];
    return (val ?? `{{${k}}}`) as string;
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
    buildUpdatesPanel(html, changeLog);
  } catch (err: any) {
    if (docEl) docEl.innerHTML = `<p>Error loading document: ${String(err?.message || err)}</p>`;
    const upEl = document.getElementById('updatesContent');
    if (upEl) { upEl.innerHTML = '<p>No updates for this document.</p>'; upEl.classList.add('hidden'); }
  }
}