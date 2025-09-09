// src/ui.ts
import type { ChangeLogEntry, TokenMap } from './types';
import { filenameFor, fetchDocumentHtml } from './api';

/* ---------------- Last-updated badge ---------------- */
export function updateLastUpdatedUI(tokenMap: TokenMap) {
  const el = document.getElementById('updateBox');
  if (!el) return;
  el.textContent = tokenMap.updatedAt
    ? 'Last updated: ' + new Date(tokenMap.updatedAt).toLocaleString()
    : 'Last updated: Never';
}

/* ---------------- Helpers ---------------- */
const stripNumberPrefix = (s: string) => s.replace(/^\s*\d+(?:\.\d+)*\s+/, '');
const possessive = (s: string) => (!s ? '' : /s$/i.test(s) ? s + "'" : s + "'s");

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

function escHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]
  );
}

/** Wrap a token value in an editable span with shading. */
function tokenSpan(key: string, value: string, savedKeys?: Set<string>): string {
  const k = canonicalKey(key);
  const savedCls = savedKeys && savedKeys.has(k) ? ' token-saved' : '';
  // NB: margins avoid “glued” words when authors omit spaces around tokens
  return `<span class="token-edit${savedCls}" data-key="${k}" contenteditable="true" spellcheck="false">${escHtml(
    value ?? ''
  )}</span>`;
}

/* ---------------- Policy list ---------------- */
export function renderPolicies(
  _segmentName: string,
  policies: string[],
  onClick: (policy: string) => void,
  color: string
) {
  const listEl = document.getElementById('policies-list');
  if (!listEl) return;

  listEl.innerHTML = '';
  for (const p of policies) {
    const display = stripNumberPrefix(p);
    const div = document.createElement('div');
    div.className = 'policy-item';
    div.style.background = color;
    div.textContent = display;
    div.title = p;
    div.dataset.policy = p;
    div.addEventListener('click', () => onClick(p));
    listEl.appendChild(div);
  }
}

/* ---------------- Updates drawer content ---------------- */
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
    const ts   = new Date(e.timestamp).toLocaleString();
    const who  = escHtml(String(e.user || 'unknown'));
    const fld  = escHtml(canonicalKey(String(e.field || '')));
    const oldV = escHtml(String(e.oldValue ?? '—'));
    const newV = escHtml(String(e.newValue ?? '—'));
    return `
      <li class="update-item">
        <div class="update-head"><strong>${ts}</strong> — ${who}</div>
        <div class="update-body">Changed <em>${fld}</em><br>
          <span class="delta"><span class="from">“${oldV}”</span> → <span class="to">“${newV}”</span></span>
        </div>
      </li>
    `;
  }).join('');

  upEl.innerHTML = `<ul class="updates-list">${items}</ul>`;
}

/* ---------------- Token replacement (INLINE EDITABLE) ---------------- */
/**
 * Replace tokens with editable spans:
 *  - 123 / 123s / 123’s → person/persons/person’s
 *  - [key] / [key’s] / {{ key }}
 */
export function replaceTokens(
  html: string,
  tokenMap: TokenMap,
  savedKeys?: Set<string>
) {
  const get = (key: string) => (tokenMap as any)[key];
  let out = html;

  // 123-family (maps to person)
  const p = String(get('person') || '');
  out = out.replace(/\b123['’]s\b/g, tokenSpan('person', possessive(p), savedKeys));
  out = out.replace(/\b123s\b/g, tokenSpan('person', p ? (p.endsWith('s') ? p : p + 's') : '', savedKeys));
  out = out.replace(/\b123\b/g, tokenSpan('person', p, savedKeys));

  // [key’s] first (possessive)
  out = out.replace(/\[\s*([\w_]+)\s*['’]s\s*\]/gi, (_m, k: string) => {
    const kk = canonicalKey(k);
    const v = get(kk);
    return tokenSpan(kk, v ? possessive(String(v)) : `[${k}'s]`, savedKeys);
  });

  // [key]
  out = out.replace(/\[\s*([\w_]+)\s*\]/gi, (_m, k: string) => {
    const kk = canonicalKey(k);
    const v = get(kk);
    return tokenSpan(kk, (v ?? `[${k}]`) as string, savedKeys);
  });

  // {{ key }}
  out = out.replace(/\{\{\s*([\w_]+)\s*\}\}/gi, (_m, k: string) => {
    const kk = canonicalKey(k);
    const v = get(kk);
    return tokenSpan(kk, (v ?? `{{${k}}}`) as string, savedKeys);
  });

  return out;
}

/* ---------------- Load + render doc ---------------- */
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

    // Any key ever changed becomes “saved” (green) on render
    const savedKeys = new Set<string>(
      (changeLog || []).map(e => canonicalKey(String(e.field || '')))
    );

    const tokenised = replaceTokens(html, tokenMap, savedKeys);
    if (docEl) docEl.innerHTML = tokenised;

    buildUpdatesPanel(html, changeLog);
  } catch (err: any) {
    if (docEl) docEl.innerHTML = `<p>Error loading document: ${escHtml(err?.message || String(err))}</p>`;
    const upEl = document.getElementById('updatesContent');
    if (upEl) upEl.innerHTML = '<p class="muted">No updates for this document.</p>';
  }
}
