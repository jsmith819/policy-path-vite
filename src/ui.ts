// src/ui.ts
import type { ChangeLogEntry, TokenMap } from './types';
import { filenameFor, fetchDocumentHtml } from './api';

/* ----------------- Small UI helpers ----------------- */

export function updateLastUpdatedUI(tokenMap: TokenMap) {
  const el = document.getElementById('updateBox');
  if (!el) return;
  el.textContent = tokenMap.updatedAt
    ? 'Last updated: ' + new Date(tokenMap.updatedAt).toLocaleString()
    : 'Last updated: Never';
}

const stripNumberPrefix = (s: string) => s.replace(/^\s*\d+(?:\.\d+)*\s+/, '');
const possessive = (s: string) => (!s ? '' : /s$/i.test(s) ? s + "'" : s + "'s");

export function canonicalKey(k: string): string {
  const kk = (k || '').toLowerCase().trim();
  if (kk === 'organisational' || kk === 'organizational') return 'organisation_name';
  if (kk === 'organisation'   || kk === 'organization')   return 'organisation_name';
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

function tokenSpan(key: string, value: string, savedKeys?: Set<string>): string {
  const k = canonicalKey(key);
  const savedCls = savedKeys && savedKeys.has(k) ? ' token-saved' : '';
  // NOTE: class 'token-edit' is what main.ts listens for (input->pending, confirm->saved)
  return `<span class="token-edit${savedCls}" data-key="${k}" contenteditable="true" spellcheck="false">${escHtml(
    value ?? ''
  )}</span>`;
}

/* ----------------- Public render helpers ----------------- */

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
    const oldV = escHtml(String(e.oldValue ?? '—'));
    const newV = escHtml(String(e.newValue ?? '—'));
    const who  = escHtml(String(e.user || 'unknown'));
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
}

/** Replacement with aliases, possessives, and simple “123/123s/123’s” mapping; returns HTML. */
export function replaceTokens(
  html: string,
  tokenMap: TokenMap,
  savedKeys?: Set<string>
) {
  const get = (key: string) => (tokenMap as any)[key];
  let out = html;

  // Handle 123 placeholders used in some docs (mapped to 'person')
  const p = String(get('person') || '');
  out = out.replace(/\b123['’]s\b/g, tokenSpan('person', possessive(p), savedKeys));
  out = out.replace(/\b123s\b/g, tokenSpan('person', p ? (p.endsWith('s') ? p : p + 's') : '', savedKeys));
  out = out.replace(/\b123\b/g, tokenSpan('person', p, savedKeys));

  // Possessive bracket tokens: [key's] or [key’s]
  out = out.replace(/\[\s*([\w_]+)\s*['’]s\s*\]/gi, (_m, k: string) => {
    const kk = canonicalKey(k);
    const v = get(kk);
    return tokenSpan(kk, v ? possessive(String(v)) : `[${k}'s]`, savedKeys);
  });

  // Non-possessive bracket tokens: [Organisational], [resident], etc.
  out = out.replace(/\[\s*([\w_]+)\s*\]/gi, (_m, k: string) => {
    const kk = canonicalKey(k);
    const v = get(kk);
    return tokenSpan(kk, (v ?? `[${k}]`) as string, savedKeys);
  });

  // Curly tokens: {{ organisation_name }}, etc.
  out = out.replace(/\{\{\s*([\w_]+)\s*\}\}/gi, (_m, k: string) => {
    const kk = canonicalKey(k);
    const v = get(kk);
    return tokenSpan(kk, (v ?? `{{${k}}}`) as string, savedKeys);
  });

  return out;
}

/* Footer with confirm toggle (appended to every rendered document) */
function makeConfirmFooter(): HTMLElement {
  const footer = document.createElement('div');
  footer.className = 'doc-footer';
  footer.innerHTML = `
    <label class="confirm-changes">
      <input type="checkbox" id="confirmBox" />
      Confirm changes (turn amber to green)
    </label>`;
  return footer;
}

/** Fetch document, tokenise, render, updates panel, then notify main.ts via a custom event. */
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

    // Tokens that have been changed at least once (stay green on first render)
    const savedKeys = new Set<string>((changeLog || []).map(e => canonicalKey(String(e.field || ''))));

    const tokenised = replaceTokens(html, tokenMap, savedKeys);

    if (docEl) {
      docEl.innerHTML = tokenised;
      docEl.appendChild(makeConfirmFooter());
    }

    buildUpdatesPanel(html, changeLog);

    // Let main.ts hook events AFTER the content is in the DOM
    window.dispatchEvent(new CustomEvent('pp:doc-rendered'));
  } catch (err: any) {
    if (docEl) docEl.innerHTML = `<p>Error loading document: ${escHtml(err?.message || String(err))}</p>`;
    const upEl = document.getElementById('updatesContent');
    if (upEl) upEl.innerHTML = '<p class="muted">No updates for this document.</p>';
    window.dispatchEvent(new CustomEvent('pp:doc-rendered')); // still allow main to clear handlers
  }
}
