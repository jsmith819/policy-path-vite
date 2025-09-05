// src/ui.ts
import type { ChangeLogEntry, TokenMap } from './types';
import { filenameFor, fetchDocumentHtml } from './api';

/** Header “last updated” */
export function updateLastUpdatedUI(tokenMap: TokenMap) {
  const el = document.getElementById('updateBox');
  if (!el) return;
  el.textContent = tokenMap.updatedAt
    ? 'Last updated: ' + new Date(tokenMap.updatedAt).toLocaleString()
    : 'Last updated: Never';
}

/* ----------------- helpers ----------------- */

const stripNumberPrefix = (s: string) => s.replace(/^\s*\d+(?:\.\d+)*\s+/, '');
const possessive = (s: string) => (!s ? '' : /s$/i.test(s) ? s + "'" : s + "'s");

function canonicalKey(k: string): string {
  const kk = (k || '').toLowerCase().trim();
  if (kk === 'organisational' || kk === 'organizational') return 'organisation_name';
  if (kk === 'organisation'   || kk === 'organization')   return 'organisation_name';
  if (kk === 'organisation_name' || kk === 'organization_name' || kk === 'org' || kk === 'org_name')
    return 'organisation_name';
  if (kk === 'organisation_short' || kk === 'org_short')   return 'organisation_short';
  if (kk === 'resident' || kk === 'resident_name' || kk === 'consumer') return 'person';
  if (kk === 'person' || kk === 'persons') return 'person';
  if (kk === 'service' || kk === 'service-type' || kk === 'service_type') return 'service_type';
  return kk;
}

/** clickable policy pills */
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

/** LEFT drawer content (updates) */
export function buildUpdatesPanel(html: string, changeLog: ChangeLogEntry[]) {
  const upEl = document.getElementById('updatesContent');
  if (!upEl) return;

  const CURLY  = /\{\{\s*([\w_]+)\s*\}\}/gi;
  const SQUARE = /\[\s*([\w_]+)\s*(?:['’]s)?\s*\]/gi;

  const tokens = new Set<string>();
  for (const m of html.matchAll(CURLY))  tokens.add(canonicalKey(m[1] || ''));
  for (const m of html.matchAll(SQUARE)) tokens.add(canonicalKey(m[1] || ''));

  const relevant = Array.isArray(changeLog)
    ? changeLog
        .filter(e => tokens.has(canonicalKey(e.field as string)))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    : [];

  if (!relevant.length) {
    upEl.innerHTML = '<p class="muted">No updates for this document.</p>';
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
        <div class="update-body">
          Changed <em>${field}</em><br>
          <span class="delta"><span class="from">“${oldV}”</span> → <span class="to">“${newV}”</span></span>
        </div>
      </li>
    `;
  }).join('');

  upEl.innerHTML = `<ul class="updates-list">${items}</ul>`;
}

/* ---------- token replacement with inline editing ---------- */

function wrapEditableToken(key: string, value: string) {
  // contentEditable span with a little built‑in margin to avoid “glued” words
  const safeVal = value || '';
  const label = key.replace(/_/g, ' ');
  return `<span class="token-edit"
               contenteditable="true"
               data-key="${key}"
               role="textbox"
               aria-label="${label}">${safeVal}</span>`;
}

export function replaceTokens(html: string, tokenMap: TokenMap) {
  const get = (key: string) => (tokenMap as any)[key];

  let out = html;

  // 123 placeholders occasionally used for the person token
  const p = String(get('person') || '');
  out = out.replace(/\b123['’]s\b/g, wrapEditableToken('person', possessive(p)));
  out = out.replace(/\b123s\b/g, wrapEditableToken('person', p ? (p.endsWith('s') ? p : p + 's') : ''));
  out = out.replace(/\b123\b/g, wrapEditableToken('person', p));

  // [key's] / [key’s] (possessive)
  out = out.replace(/\[\s*([\w_]+)\s*['’]s\s*\]/gi, (_m, k: string) => {
    const key = canonicalKey(k);
    const v = (get(key) ?? '') as string;
    return wrapEditableToken(key, possessive(String(v)));
  });

  // [key]
  out = out.replace(/\[\s*([\w_]+)\s*\]/gi, (_m, k: string) => {
    const key = canonicalKey(k);
    const v = (get(key) ?? '') as string;
    return wrapEditableToken(key, v);
  });

  // {{ key }}
  out = out.replace(/\{\{\s*([\w_]+)\s*\}\}/gi, (_m, k: string) => {
    const key = canonicalKey(k);
    const v = (get(key) ?? '') as string;
    return wrapEditableToken(key, v);
  });

  return out;
}

/** Load, tokenise, render */
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
    if (docEl) {
      docEl.innerHTML = tokenised;
      // All tokens start “unsaved” (red). main.ts toggles .token-saved to green on change.
      docEl.querySelectorAll('.token-edit').forEach(el => el.classList.remove('token-saved'));
    }
    buildUpdatesPanel(html, changeLog);
  } catch (err: any) {
    if (docEl) docEl.innerHTML = `<p>Error loading document: ${String(err?.message || err)}</p>`;
    const upEl = document.getElementById('updatesContent');
    if (upEl) upEl.innerHTML = '<p class="muted">No updates for this document.</p>';
  }
}
