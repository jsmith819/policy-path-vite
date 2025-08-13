import type { ChangeLogEntry, TokenMap } from './types';
import { filenameFor, fetchDocumentHtml } from './api';
import DOMPurify from 'dompurify';

/** Sanitize any HTML we inject into the page */
export function safeHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'h1','h2','h3','h4','h5','h6','p','strong','em','ul','ol','li',
      'a','br','hr','blockquote','span','div','table','thead','tbody',
      'tr','th','td',
      // allow embedded stylesheet blocks in the document HTML
      'style'
    ],
    // keep class/id (for document CSS selectors) and allow inline styles
    ALLOWED_ATTR: ['href','target','rel','class','id','colspan','rowspan','style'],
    ALLOW_DATA_ATTR: false
  });
}

/** Small helper so we can set text safely */
function setText(el: HTMLElement | null, text: string) {
  if (el) el.textContent = text;
}

/** For plain-text we put into the updates panel */
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function updateLastUpdatedUI(tokenMap: TokenMap) {
  const el = document.getElementById('updateBox');
  if (!el) return;
  el.textContent = tokenMap.updatedAt
    ? 'Last updated: ' + new Date(tokenMap.updatedAt).toLocaleString()
    : 'Last updated: Never';
}

/**
 * Renders the clickable list of policies for a segment.
 * Uses real DOM nodes (not string concat) to avoid accidental HTML injection.
 */
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
    const div = document.createElement('div');
    div.className = 'policy-item';
    div.style.background = color;
    div.textContent = p;
    div.dataset.policy = p;
    div.addEventListener('click', () => onClick(p));
    listEl.appendChild(div);
  });
}

/**
 * Builds the bottom "Updates" panel. We filter the change log to only those
 * fields that appear as tokens in the document (curly or square style).
 */
export function buildUpdatesPanel(html: string, changeLog: ChangeLogEntry[]) {
  const upEl = document.getElementById('updatesContent');
  if (!upEl) return;

  const CURLY  = /{{\s*([\w_]+)\s*}}/g;
  const SQUARE = /\[\s*([\w_]+)\s*('s)?\s*\]/g;

  const tokens = new Set<string>();
  for (const m of html.matchAll(CURLY))  tokens.add((m[1] || '').trim());
  for (const m of html.matchAll(SQUARE)) tokens.add((m[1] || '').trim());

  const relevant = Array.isArray(changeLog)
    ? changeLog.filter(e => tokens.has(e.field))
    : [];

  const updatesHtml = relevant.length
    ? relevant.map(e => {
        const ts = new Date(e.timestamp).toLocaleString();
        return `<p><strong>${esc(ts)}</strong> — ${esc(e.user)} changed <em>${esc(e.field)}</em> from “${esc(e.oldValue)}” to “${esc(e.newValue)}”</p>`;
      }).join('')
    : '<p>No updates for this document.</p>';

  upEl.innerHTML = updatesHtml;
  upEl.classList.add('hidden'); // collapsed initially
}

/**
 * Replace tokens in the document HTML.
 * - Curly tokens: {{ person }}
 * - Square tokens: [person] and [person's]
 */
export function replaceTokens(html: string, tokenMap: TokenMap) {
  const CURLY  = /{{\s*([\w_]+)\s*}}/g;
  const SQUARE = /\[\s*([\w_]+)\s*('s)?\s*\]/g;

  const subst = (key: string) =>
    (tokenMap as any)?.[key.trim()] ?? `[${key.trim()}]`;

  return html
    .replace(CURLY,  (_m, k: string) => subst(k))
    .replace(SQUARE, (_m, k: string, poss: string | undefined) => subst(k) + (poss ?? ''));
}

/**
 * Fetches the HTML for a segment/policy, token-replaces, sanitizes and renders.
 * Also rebuilds the "Updates" panel for this document.
 */
export async function loadAndRender(
  segment: string,
  policy: string,
  tokenMap: TokenMap,
  changeLog: ChangeLogEntry[]
) {
  const docEl = document.getElementById('docContent') as HTMLElement | null;
  setText(docEl, 'Loading…');

  try {
    const fileName  = filenameFor(segment, policy);
    const html      = await fetchDocumentHtml(fileName);
    const tokenised = replaceTokens(html, tokenMap);

    if (docEl) docEl.innerHTML = safeHTML(tokenised);
    buildUpdatesPanel(html, changeLog);
  } catch (err: any) {
    if (docEl) {
      docEl.innerHTML = `<p>Error loading document: ${esc(err?.message || err)}</p>`;
    }
    const upEl = document.getElementById('updatesContent');
    if (upEl) {
      upEl.innerHTML = '<p>No updates for this document.</p>';
      upEl.classList.add('hidden');
    }
  }
}
