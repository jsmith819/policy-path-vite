// src/main.ts
import type { ChangeLogEntry, TokenMap } from './types';
import { loadTokenMap, saveTokenMap, loadChangeLog, saveChangeLog } from './store';
import { checkLogin } from './auth';
import { drawWheel } from './wheel';
import { loadAndRender, renderPolicies, updateLastUpdatedUI } from './ui';
import { indexDocuments, search as searchDocs } from './search';
import { filenameFor } from './api';

let currentUserRole: 'admin' | 'user' | null = null;
let currentUsername: string | null = null;

let tokenMap: TokenMap = loadTokenMap();
let changeLog: ChangeLogEntry[] = loadChangeLog();

(Object.assign(window as any, { tokenMap, changeLog }));

/** Data */
const policiesData: Record<string, string[]> = {
  '1. The Individual': [
    'Commitment Statement',
    '1.1 Person-centred and Culturally Safe Care',
    '1.2 Trauma-aware and Healing-informed Practice',
    '1.3 Diversity, Inclusion and Belonging',
    '1.4 Dignity, Respect and Professional Boundaries',
    '1.5 Privacy, Confidentiality and Communication',
    '1.6 Supported Decision-Making and Informed Consent',
    '1.7 Dignity-of-risk and Positive Risk-taking',
    '1.8 Resident Advocacy and Interpreter Services',
    '1.9 Transparency, Care Agreements and Financial Information',
    '1.10 Resident Engagement and Co-design',
    'All procedures (22)'
  ],
  'The organisation': [
    'Commitment Statement',
    '2.1 Placeholder','2.2 Placeholder','2.3 Placeholder','2.4 Placeholder',
    '2.5 Placeholder','2.6 Placeholder','2.7 Placeholder','2.8 Placeholder',
    '2.9 Placeholder','2.10 Placeholder'
  ],
  'Care and services': ['commitment statement','3.1 Assessment & planning', '3.2 Delivery of services'],
  'The environment': ['commitment statement','4.1a Services in home', '4.1b Services outside home'],
  'Clinical care': ['Clinical governance', 'Infection control'],
  'Food and nutrition': ['6.1 Partnering on food', '6.2 Nutrition assessment'],
  'Residential community': ['7.1 Daily living', '7.2 Transitions']
};

const policyColors: Record<string, string> = {
  '1. The Individual': '#e94e77',
  'The organisation': '#6aaf4b',
  'Care and services': '#7e5aa2',
  'The environment': '#29335c',
  'Clinical care': '#29a9c7',
  'Food and nutrition': '#f18f01',
  'Residential community': '#faa916'
};

/** Doc config (grouped vs standalone + per-doc overrides) */
type DocConfig = {
  standalone: Record<string, boolean>;
  overrides: Record<string, Partial<TokenMap>>;
};
const DOC_CFG_KEY = 'docConfig';
const loadDocConfig = (): DocConfig => {
  try {
    const raw = localStorage.getItem(DOC_CFG_KEY);
    if (!raw) return { standalone: {}, overrides: {} };
    const p = JSON.parse(raw);
    return { standalone: p.standalone || {}, overrides: p.overrides || {} };
  } catch { return { standalone: {}, overrides: {} }; }
};
const saveDocConfig = (cfg: DocConfig) => localStorage.setItem(DOC_CFG_KEY, JSON.stringify(cfg));
let docCfg: DocConfig = loadDocConfig();

/** Current doc context */
let currentSegment: string | null = null;
let currentPolicy: string | null = null;
let currentDocKey: string | null = null;
const isStandalone = (key: string | null) => !!(key && docCfg.standalone[key]);
const effectiveTokensFor = (key: string | null): TokenMap => {
  if (!key) return tokenMap;
  if (!docCfg.standalone[key]) return tokenMap;
  const ov = docCfg.overrides[key] || {};
  return { ...tokenMap, ...ov } as TokenMap;
};

/** DOM */
const loginScreenEl = document.getElementById('loginScreen')!;
const mainAppEl     = document.getElementById('mainApp')!;
const userField     = document.getElementById('username') as HTMLInputElement;
const passField     = document.getElementById('password') as HTMLInputElement;
const loginErrorEl  = document.getElementById('loginError')!;

const loginBtn      = document.getElementById('loginBtn')! as HTMLButtonElement;
const togglePw      = document.getElementById('togglePw')!;

const adminBtn      = document.getElementById('adminBtn')!;
const adminMenu     = document.getElementById('adminMenu')!;
const ctxSettings   = document.getElementById('ctxSettings')!;
const manageDocs    = document.getElementById('manageDocs')!;
const viewTemplate  = document.getElementById('viewTemplate')!;
const viewUpdates   = document.getElementById('viewUpdates')!;
const trackChanges  = document.getElementById('trackChanges')!;
const demoReset     = document.getElementById('demoReset')!;
const toggleSearchBar = document.getElementById('toggleSearchBar')!;
const logoutBtn     = document.getElementById('logout')!;

const searchContainer = document.getElementById('searchContainer')!;
const searchInput   = document.getElementById('semanticSearch') as HTMLInputElement;
const searchBtn     = document.getElementById('searchBtn')!;
const searchResults = document.getElementById('searchResults')!;
const resultsContent= document.getElementById('resultsContent')!;
const closeResultsBtn = document.getElementById('closeResultsBtn')!;

const svgWheel      = document.getElementById('policy-wheel') as unknown as SVGSVGElement;

/* Drawers */
const adminPopup    = document.getElementById('adminPopup')!;      // Right drawer
const updatesDrawer = document.getElementById('updatesDrawer')!;   // Left drawer
const drawerScrim   = document.getElementById('drawerScrim')!;

const orgShortInput = document.getElementById('orgShortInput') as HTMLInputElement;
const orgInput      = document.getElementById('orgInput') as HTMLInputElement;
const personInput   = document.getElementById('personInput') as HTMLInputElement;
const serviceInput  = document.getElementById('serviceInput') as HTMLInputElement;
const saveTokensBtn = document.getElementById('saveTokensBtn')!;

const updateTabBtn  = document.getElementById('updatesToggle')!;
const updatesContent= document.getElementById('updatesContent')!;
const openContextBtn = document.getElementById('openContextBtn') as HTMLButtonElement;

/* Doc Manager modal */
const docManager      = document.getElementById('docManager')!;
const docManagerList  = document.getElementById('docManagerList')!;
const docManagerSave  = document.getElementById('docManagerSave')!;
const docManagerClose = document.getElementById('docManagerClose')!;

const trackPopup    = document.getElementById('trackPopup')!;
const changeLogContent = document.getElementById('changeLogContent')!;
const closeTrackBtn = document.getElementById('closeTrack')!;

/** Permissions */
function applyPermissions() {
  document.querySelectorAll('#adminMenu li.admin-only').forEach(li => {
    (li as HTMLElement).style.display = (currentUserRole === 'admin') ? 'block' : 'none';
  });
}
function updateLastUpdated() { updateLastUpdatedUI(tokenMap); }

/** Auth */
loginBtn.addEventListener('click', () => {
  const res = checkLogin(userField.value, passField.value);
  if (res.ok) {
    currentUserRole = res.role;
    currentUsername = userField.value.trim();
    loginErrorEl.classList.add('hidden');
    loginScreenEl.classList.add('hidden');
    mainAppEl.classList.remove('hidden');
    applyPermissions();
    updateLastUpdated();
  } else {
    loginErrorEl.classList.remove('hidden');
  }
});
togglePw.addEventListener('click', () => {
  passField.type = (passField.type === 'password') ? 'text' : 'password';
});
logoutBtn.addEventListener('click', () => {
  mainAppEl.classList.add('hidden');
  loginScreenEl.classList.remove('hidden');
  userField.value = '';
  passField.value = '';
  currentUserRole = null;
  currentUsername = null;
});

/** Drawers */
const closeAllDrawers = () => {
  adminPopup.classList.remove('open');
  updatesDrawer.classList.remove('open');
  drawerScrim.classList.remove('show');
  updatesContent.classList.add('hidden');
};

const openContextDrawer = () => {
  adminMenu.style.display = 'none';
  orgInput.value      = tokenMap.organisation_name;
  (orgShortInput as HTMLInputElement).value = (tokenMap as any).organisation_short || '';
  personInput.value   = tokenMap.person;
  serviceInput.value  = tokenMap.service_type;
  adminPopup.classList.add('open');
  drawerScrim.classList.add('show');
};

const openUpdatesDrawer = () => {
  updatesContent.classList.remove('hidden');
  updatesDrawer.classList.add('open');
  drawerScrim.classList.add('show');
};

adminBtn.addEventListener('click', () => {
  adminMenu.style.display = (adminMenu.style.display === 'block') ? 'none' : 'block';
});
ctxSettings.addEventListener('click', openContextDrawer);
openContextBtn.addEventListener('click', openContextDrawer);
updateTabBtn.addEventListener('click', openUpdatesDrawer);

drawerScrim.addEventListener('click', closeAllDrawers);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllDrawers(); });

/** Admin menu items */
viewTemplate.addEventListener('click', () => { adminMenu.style.display = 'none'; alert('View Template coming soon.'); });
viewUpdates.addEventListener('click', () => { adminMenu.style.display = 'none'; alert('View Updates coming soon.'); });

demoReset.addEventListener('click', () => {
  adminMenu.style.display = 'none';
  if (!confirm('Really clear all change history?')) return;
  changeLog = [];
  saveChangeLog(changeLog);
  changeLogContent.innerHTML = '<p>No changes yet.</p>';
  updatesContent.innerHTML = '<p>No updates for this document.</p>';
  updatesContent.classList.add('hidden');
});

/** Save contextual settings (global) */
saveTokensBtn.addEventListener('click', () => {
  const oldMap = { ...tokenMap };

  tokenMap.organisation_name  = (orgInput.value || '').trim();
  (tokenMap as any).organisation_short = (orgShortInput.value || '').trim();
  tokenMap.person             = (personInput.value || '').trim();
  tokenMap.service_type       = (serviceInput.value || '').trim();

  const now = new Date().toISOString();
  tokenMap.updatedAt = now;

  (['organisation_name','organisation_short','person','service_type'] as const)
    .forEach((field: any) => {
      if ((tokenMap as any)[field] !== (oldMap as any)[field]) {
        const entry: ChangeLogEntry = {
          field,
          oldValue: (oldMap as any)[field],
          newValue: (tokenMap as any)[field],
          user: currentUsername || 'unknown',
          timestamp: now
        };
        changeLog.push(entry);
      }
    });

  saveTokenMap(tokenMap);
  saveChangeLog(changeLog);

  updateLastUpdated();
  closeAllDrawers();

  // Refresh current doc to reflect new globals (unless standalone overrides shadow them)
  if (currentSegment && currentPolicy) {
    const eff = effectiveTokensFor(currentDocKey);
    loadAndRender(currentSegment, currentPolicy, eff, changeLog);
  }
});

/** Change log modal */
trackChanges.addEventListener('click', () => {
  adminMenu.style.display = 'none';
  if (!changeLog.length) changeLogContent.innerHTML = '<p>No changes yet.</p>';
  else changeLogContent.innerHTML = changeLog.map(e => {
    const ts = new Date(e.timestamp).toLocaleString();
    return `<p><strong>${ts}</strong> — ${e.user} changed <em>${e.field}</em> from “${e.oldValue}” to “${e.newValue}”</p>`;
  }).join('');
  (trackPopup as HTMLElement).style.display = 'block';
});
closeTrackBtn.addEventListener('click', () => { (trackPopup as HTMLElement).style.display = 'none'; });

/** Wheel + navigation */
const policiesDataLocal = policiesData;
const policyColorsLocal = policyColors;

function resolveSegmentKey(name: string): string {
  const norm = (s: string) => s.toLowerCase().trim();
  const match = Object.keys(policiesDataLocal).find(k => norm(k) === norm(name));
  return match || name;
}

function selectSegment(segmentOrKey: string, evt: Event) {
  const [incomingName, policyId] = segmentOrKey.split('::');
  const segmentName = resolveSegmentKey(incomingName);

  document.querySelectorAll('#policy-wheel path, #policy-wheel circle')
    .forEach(el => el.classList.remove('active'));

  const segEl = Array.from(document.querySelectorAll('#policy-wheel .seg'))
    .find(el => (el as HTMLElement).getAttribute('data-name')?.toLowerCase() === incomingName.toLowerCase());
  if (segEl) segEl.classList.add('active');
  else (evt.currentTarget as Element)?.classList.add('active');

  const policies = getPolicies(segmentName);
  const color = policyColorsLocal[segmentName] || '#1c2b4a';

  function getPolicies(segmentName: string): string[] {
    const target = segmentName.toLowerCase();
    for (const key of Object.keys(policiesDataLocal)) {
      if (key.toLowerCase() === target) return policiesDataLocal[key];
    }
    return [];
  }

  renderPolicies(
    segmentName,
    policies,
    (policy) => {
      if (/^2\.\d+\s+Placeholder$/i.test(policy)) {
        const docEl = document.getElementById('docContent');
        if (docEl) docEl.textContent = 'Placeholder — rename and link later.';
        return;
      }
      // load first-class click
      openDoc(segmentName, policy);
    },
    color
  );

  // Choose initial policy
  let initial = policies[0];
  if (policyId) {
    const m = policies.find(p => p.startsWith(`${policyId} `) || p === policyId);
    if (m) initial = m;
  }

  if (!initial || /^2\.\d+\s+Placeholder$/i.test(initial)) {
    const docEl = document.getElementById('docContent');
    if (docEl) docEl.textContent = 'Select a policy';
    return;
  }

  openDoc(segmentName, initial);
}

function openDoc(segment: string, policy: string) {
  currentSegment = segment;
  currentPolicy  = policy;
  currentDocKey  = filenameFor(segment, policy);
  const docEl = document.getElementById('docContent');
  if (docEl) docEl.textContent = 'Loading…';
  const eff = effectiveTokensFor(currentDocKey);
  loadAndRender(segment, policy, eff, changeLog);
}

drawWheel(svgWheel, selectSegment);

/** Inline token editing -> route to global or doc override; turn green after save */
function enableInlineTokenEditing() {
  const root = document.getElementById('docContent');
  if (!root) return;

  root.addEventListener('paste', (e: any) => {
    const t = (e.target as HTMLElement)?.closest('.token-edit');
    if (!t) return;
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  });

  root.addEventListener('input', (e: any) => {
    const el = (e.target as HTMLElement)?.closest('.token-edit') as HTMLElement | null;
    if (!el) return;

    const key   = el.dataset.key!;
    const typed = (el.textContent || '').trim();

    // Decide target: doc override if standalone, else global
    const keyDoc = currentDocKey || '';
    if (isStandalone(keyDoc)) {
      const oldVal = (docCfg.overrides[keyDoc]?.[key] ?? (tokenMap as any)[key] ?? '') as string;
      // write override
      const ov = docCfg.overrides[keyDoc] || {};
      (ov as any)[key] = typed;
      docCfg.overrides[keyDoc] = ov;
      saveDocConfig(docCfg);

      // log
      const now = new Date().toISOString();
      changeLog.push({
        field: key as any,
        oldValue: String(oldVal),
        newValue: typed,
        user: currentUsername || 'unknown',
        timestamp: now
      });
      saveChangeLog(changeLog);
      tokenMap.updatedAt = now;
      updateLastUpdatedUI(tokenMap);
    } else {
      const oldVal = (tokenMap as any)[key] ?? '';
      if (typed !== oldVal) {
        (tokenMap as any)[key] = typed;
        const now = new Date().toISOString();
        tokenMap.updatedAt = now;
        changeLog.push({
          field: key as any,
          oldValue: String(oldVal),
          newValue: typed,
          user: currentUsername || 'unknown',
          timestamp: now
        });
        saveTokenMap(tokenMap);
        saveChangeLog(changeLog);
        updateLastUpdatedUI(tokenMap);
      }
    }

    // mark all occurrences as saved (green)
    document.querySelectorAll<HTMLElement>(`.token-edit[data-key="${key}"]`).forEach(span => {
      if (span !== el) span.textContent = typed;
      span.classList.add('token-saved');
      span.classList.remove('token-pending');
    });
  });
}

/** Document Manager */
manageDocs.addEventListener('click', () => {
  adminMenu.style.display = 'none';
  renderDocManager();
  (docManager as HTMLElement).style.display = 'block';
  drawerScrim.classList.add('show');
});
docManagerClose.addEventListener('click', () => {
  (docManager as HTMLElement).style.display = 'none';
  drawerScrim.classList.remove('show');
});
docManagerSave.addEventListener('click', () => {
  const rows = docManagerList.querySelectorAll<HTMLInputElement>('input.dm-standalone');
  const next: DocConfig = { standalone: {}, overrides: { ...docCfg.overrides } };
  rows.forEach(cb => { next.standalone[cb.dataset.dockey!] = cb.checked; });
  docCfg = next;
  saveDocConfig(docCfg);
  (docManager as HTMLElement).style.display = 'none';
  drawerScrim.classList.remove('show');

  // If current doc changed mode, refresh with effective tokens
  if (currentSegment && currentPolicy) {
    const eff = effectiveTokensFor(currentDocKey);
    loadAndRender(currentSegment, currentPolicy, eff, changeLog);
  }
});

function renderDocManager() {
  const items: string[] = [];
  Object.keys(policiesData).forEach(segment => {
    policiesData[segment].forEach(policy => {
      // Skip placeholders
      if (/^2\.\d+\s+Placeholder$/i.test(policy)) return;
      const key = filenameFor(segment, policy);
      const checked = !!docCfg.standalone[key];
      items.push(`
        <div class="doc-row" style="padding:.5rem 0; border-bottom:1px solid #eee;">
          <div style="font-weight:600;">${segment}</div>
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div>${policy}</div>
            <label style="white-space:nowrap;">
              <input type="checkbox" class="dm-standalone" data-dockey="${key}" ${checked ? 'checked' : ''} />
              Standalone
            </label>
          </div>
        </div>
      `);
    });
  });
  docManagerList.innerHTML = items.join('') || '<p>No documents found.</p>';
}

/** Search */
searchBtn.addEventListener('click', () => {
  const q = searchInput.value.toLowerCase().trim();
  const matches = searchDocs(q);
  resultsContent.innerHTML = '';
  if (!q) resultsContent.innerHTML = '<p>Please enter a search term.</p>';
  else if (matches.length === 0) resultsContent.innerHTML = '<p>No results found.</p>';
  else {
    for (const doc of matches) {
      const div = document.createElement('div');
      div.style.padding = '10px 0';
      div.innerHTML = `<strong>${doc.title}</strong><br><button style="margin-top:5px;">View Document</button>`;
      const btn = div.querySelector('button')!;
      btn.addEventListener('click', () => { openDoc(doc.segment, doc.policy); });
      resultsContent.appendChild(div);
    }
  }
  searchResults.classList.remove('hidden');
});
closeResultsBtn.addEventListener('click', () => { searchResults.classList.add('hidden'); });

/** Boot */
window.addEventListener('DOMContentLoaded', () => {
  indexDocuments();
  enableInlineTokenEditing();
});
