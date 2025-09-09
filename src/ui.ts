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

/* ---------------- helpers ---------------- */

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

const FRIENDLY: Record<string, string> = {
  organisation_name:  'Organisation Name',
  organisation_short: 'Short Organisation Name',
  person:             'Person',
  service_type:       'Service Type',
};

function friendlyField(key: string) {
  return FRIENDLY[canonicalKey(key)] || key;
}

function relTime(iso: string) {
  const then = new Date(iso).getTime();
  const now  = Date.now();
  const s = Math.max(1, Math.round((now - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

/* ---------------- policies list renderer ---------------- */

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

/* ---------------- Updates drawer content ---------------- */

export function buildUpdatesPanel(html: string, changeLog: ChangeLogEntry[]) {
  const upEl = document.getElementById('updatesContent');
  if (!upEl) return;

  // Collect token keys present in the document so we only show relevant updates
  const CURLY  = /\{\{\s*([\w_]+)\s*\}\}/gi;
  const SQUARE = /\[\s*([\w_]+)\s*(?:['’]s)?\s*\]/gi;

  const tokens = new Set<string>();
  for (const m of html.matchAll(CURLY))  tokens.add(canonicalKey(m[1] || ''));
  for (const m of html.matchAll(SQUARE)) tokens.add(canonicalKey(m[1] || ''));

  const relevant = Array.isArray(changeLog)
    ? changeLog
        .filter(e => tokens.has(canonicalKey(String(e.field))))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    : [];

  if (!relevant.length) {
    upEl.innerHTML = '<p class="muted">No updates for this document.</p>';
    return; // keep drawer visibility controlled by main.ts
  }

  const uniqueFields = Array.from(new Set(relevant.map(r => canonicalKey(String(r.field)))));
  const latestTs = relevant[0]?.timestamp;

  const summaryHtml = `
    <div class="updates-summary">
      <div><strong>${relevant.length}</strong> change${relevant.length === 1 ? '' : 's'} · ${uniqueFields.length} field${uniqueFields.length === 1 ? '' : 's'}</div>
      <div class="muted">Latest: ${relTime(latestTs)}</div>
    </div>
  `;

  const listHtml = relevant.map(e => {
    const field = friendlyField(String(e.field));
    const oldV  = (e.oldValue ?? '—').toString();
    const newV  = (e.newValue ?? '—').toString();
    const who   = (e.user || 'unknown');
    const when  = relTime(e.timestamp);
    return `
      <li class="update-item">
        <div class="update-head">
          <span class="update-field">${field}</span>
          <span class="update-meta">· ${who} · ${when}</span>
        </div>
        <div class="update-body">
          <span class="delta"><span class="from">“${escapeHtml(oldV)}”</span> → <span class="to">“${escapeHtml(newV)}”</span></span>
        </div>
      </li>
    `;
  }).join('');

  upEl.innerHTML = `${summaryHtml}<ul class="updates-list">${listHtml}</ul>`;
}

// basic HTML escape for values shown in updates
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' } as Record<string,string>)[ch]
  );
}

/* ---------------- token replacement ---------------- */

export function replaceTokens(html: string, tokenMap: TokenMap) {
  const get = (key: string) => (tokenMap as any)[key];
  let out = html;

  const p = String(get('person') || '');
  out = out.replace(/\b123['’]s\b/g, possessive(p));
  out = out.replace(/\b123s\b/g, p ? (p.endsWith('s') ? p : p + 's') : '123s');
  out = out.replace(/\b123\b/g, p || '123');

  out = out.replace(/\[\s*([\w_]+)\s*['’]s\s*\]/gi, (_m, k: string) => {
    const v = get(canonicalKey(k));
    return v ? possessive(String(v)) : `[${k}'s]`;
  });

  out = out.replace(/\[\s*([\w_]+)\s*\]/gi, (_m, k: string) => {
    const v = get(canonicalKey(k));
    return (v ?? `[${k}]`) as string;
  });

  out = out.replace(/\{\{\s*([\w_]+)\s*\}\}/gi, (_m, k: string) => {
    const v = get(canonicalKey(k));
    return (v ?? `{{${k}}}`) as string;
  });

  return out;
}

/* ---------------- load & render document ---------------- */

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
    buildUpdatesPanel(html, changeLog); // fill left drawer with new format
  } catch (err: any) {
    if (docEl) docEl.innerHTML = `<p>Error loading document: ${String(err?.message || err)}</p>`;
    const upEl = document.getElementById('updatesContent');
    if (upEl) upEl.innerHTML = '<p class="muted">No updates for this document.</p>';
  }
}
