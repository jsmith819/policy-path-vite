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

// helpers
const stripNumberPrefix = (s: string) => s.replace(/^\s*\d+(?:\.\d+)*\s+/, '');
const possessive = (s: string) => (!s ? '' : /s$/i.test(s) ? s + "'" : s + "'s");
const escHtml = (s: string) =>
  String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c as '&'|'<'|'>'|'"'|"'"]!));

export function canonicalKey(k: string): string {
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
    const oldV = escHtml(String(e.oldValue ?? '—'));
    const newV = escHtml(String(e.newValue ?? '—'));
    const who  = escHtml(String(e.user || 'unknown'));
    return `
      <li class="update-item" style="padding:.5rem 0;border-bottom:1px solid #eee;">
        <div class="update-head" style="font-size:.9rem;color:#333;"><strong>${ts}</strong> — ${who}</div>
        <div class="update-body" style="font-size:.9rem;color:#444;">Changed <em>${field}</em><br>
          <span class="delta"><span class="from">“${oldV}”</span> → <span class="to">“${newV}”</span></span>
        </div>
      </li>
    `;
  }).join('');

  upEl.innerHTML = `<ul class="updates-list" style="margin:0;padding:0 0 .5rem 0;list-style:none;">${items}</ul>`;
}

/* ----- token replacement with status classes ----- */
type ReplaceOpts = { savedKeys?: Set<string>; pendingKeys?: Set<string> };

function tokenSpan(key: string, value: string, opts?: ReplaceOpts): string {
  const k = canonicalKey(key);
  const saved   = opts?.savedKeys?.has(k);
  const pending = opts?.pendingKeys?.has(k);
  const cls = `token-edit${saved ? ' token-saved' : pending ? ' token-pending' : ''}`;
  return `<span class="${cls}" data-key="${k}" contenteditable="true" spellcheck="false">${escHtml(value ?? '')}</span>`;
}

export function replaceTokens(html: string, tokenMap: TokenMap, opts?: ReplaceOpts) {
  const get = (key: string) => (tokenMap as any)[key];
  let out = html;

  // support "123" -> person
  const p = String(get('person') || '');
  out = out.replace(/\b123['’]s\b/g, tokenSpan('person', possessive(p), opts));
  out = out.replace(/\b123s\b/g, tokenSpan('person', p ? (p.endsWith('s') ? p : p + 's') : '', opts));
  out = out.replace(/\b123\b/g, tokenSpan('person', p, opts));

  // [key's] or [key’s]
  out = out.replace(/\[\s*([\w_]+)\s*['’]s\s*\]/gi, (_m, k: string) => {
    const kk = canonicalKey(k);
    const v = get(kk);
    return tokenSpan(kk, v ? possessive(String(v)) : `[${k}'s]`, opts);
  });

  // [key]
  out = out.replace(/\[\s*([\w_]+)\s*\]/gi, (_m, k: string) => {
    const kk = canonicalKey(k);
    const v = get(kk);
    return tokenSpan(kk, (v ?? `[${k}]`) as string, opts);
  });

  // {{ key }}
  out = out.replace(/\{\{\s*([\w_]+)\s*\}\}/gi, (_m, k: string) => {
    const kk = canonicalKey(k);
    const v = get(kk);
    return tokenSpan(kk, (v ?? `{{${k}}}`) as string, opts);
  });

  return out;
}

/** Load + render with status: amber (pending) vs green (saved upon confirm) */
export async function loadAndRender(
  segment: string,
  policy: string,
  tokenMap: TokenMap,
  changeLog: ChangeLogEntry[],
  docKey?: string
) {
  const docEl = document.getElementById('docContent');
  if (docEl) docEl.textContent = 'Loading…';
  try {
    const fileName = filenameFor(segment, policy);
    const html = await fetchDocumentHtml(fileName);

    // tokens present in the doc
    const CURLY  = /\{\{\s*([\w_]+)\s*\}\}/gi;
    const SQUARE = /\[\s*([\w_]+)\s*(?:['’]s)?\s*\]/gi;
    const present = new Set<string>();
    for (const m of html.matchAll(CURLY))  present.add(canonicalKey(m[1] || ''));
    for (const m of html.matchAll(SQUARE)) present.add(canonicalKey(m[1] || ''));

    // which keys have been edited globally
    const changed = new Set<string>((changeLog || []).map(e => canonicalKey(String(e.field || ''))));
    const changedInDoc = new Set([...present].filter(k => changed.has(k)));

    // has this doc been confirmed/approved?
    let acked = false;
    try {
      const m = JSON.parse(localStorage.getItem('pp_doc_ack') || '{}') as Record<string, boolean>;
      if (docKey) acked = !!m[docKey];
    } catch {}

    const opts: ReplaceOpts = acked
      ? { savedKeys: changedInDoc }
      : { pendingKeys: changedInDoc };

    const tokenised = replaceTokens(html, tokenMap, opts);
    if (docEl) docEl.innerHTML = tokenised;

    buildUpdatesPanel(html, changeLog);
  } catch (err: any) {
    if (docEl) docEl.innerHTML = `<p>Error loading document: ${escHtml(err?.message || String(err))}</p>`;
    const upEl = document.getElementById('updatesContent');
    if (upEl) upEl.innerHTML = '<p class="muted">No updates for this document.</p>';
  }
}
