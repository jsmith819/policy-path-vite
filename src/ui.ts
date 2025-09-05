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
const esc = (s: string) => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!));

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
        <div class="update-body">Changed <em>${field}</em><br>
          <span class="delta"><span class="from">“${esc(oldV)}”</span> → <span class="to">“${esc(newV)}”</span></span>
        </div>
      </li>
    `;
  }).join('');

  upEl.innerHTML = `<ul class="updates-list">${items}</ul>`;
}

/** Replacement with inline editable spans + aliases + 123 shims */
export function replaceTokens(html: string, tokenMap: TokenMap) {
  const get = (key: string) => (tokenMap as any)[key] ?? '';
  const span = (key: string, val: string, form: 'base'|'poss'|'plural'='base') => {
    const v = esc(val || '');
    if (form === 'poss') {
      return `<span class="token-edit" data-key="${key}" data-form="poss" contenteditable="true">${v}</span><span class="token-suffix">'s</span>`;
    }
    if (form === 'plural') {
      return `<span class="token-edit" data-key="${key}" data-form="plural" contenteditable="true">${v}</span><span class="token-suffix">s</span>`;
    }
    return `<span class="token-edit" data-key="${key}" contenteditable="true">${v}</span>`;
  };

  let out = html;

  // Legacy 123 shims -> editable person
  const personVal = String(get('person'));
  out = out.replace(/\b123['’]s\b/g, () => span('person', personVal, 'poss'));
  out = out.replace(/\b123s\b/g,    () => span('person', personVal, 'plural'));
  out = out.replace(/\b123\b/g,     () => span('person', personVal, 'base'));

  // [key's] or [key’s] -> editable base + suffix
  out = out.replace(/\[\s*([\w_]+)\s*['’]s\s*\]/gi, (_m, k) => {
    const key = canonicalKey(k);
    return span(key, String(get(key)), 'poss');
  });

  // [key] -> editable
  out = out.replace(/\[\s*([\w_]+)\s*\]/gi, (_m, k) => {
    const key = canonicalKey(k);
    return span(key, String(get(key)), 'base');
  });

  // {{ key }} -> editable
  out = out.replace(/\{\{\s*([\w_]+)\s*\}\}/gi, (_m, k) => {
    const key = canonicalKey(k);
    return span(key, String(get(key)), 'base');
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
    buildUpdatesPanel(html, changeLog); // populate left drawer
  } catch (err: any) {
    if (docEl) docEl.innerHTML = `<p>Error loading document: ${String(err?.message || err)}</p>`;
    const upEl = document.getElementById('updatesContent');
    if (upEl) upEl.innerHTML = '<p class="muted">No updates for this document.</p>';
  }
}
