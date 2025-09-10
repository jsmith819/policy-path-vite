// src/main.ts
import type { ChangeLogEntry, TokenMap } from './types';
import { loadTokenMap, saveTokenMap, loadChangeLog, saveChangeLog } from './store';
import { checkLogin } from './auth';
import { drawWheel } from './wheel';
import { loadAndRender, renderPolicies, updateLastUpdatedUI } from './ui';
import { indexDocuments, search as searchDocs } from './search';

/* ----------------- Globals & helpers ----------------- */

type TokenKey = keyof TokenMap;
type DocKey = string;

let currentUserRole: 'admin' | 'user' | null = null;
let currentUsername: string | null = null;

let tokenMap: TokenMap = loadTokenMap();
let changeLog: ChangeLogEntry[] = loadChangeLog();

(Object.assign(window as any, { tokenMap, changeLog }));

const STANDALONE_KEY = 'pp_standalone_docs';
const OVERRIDES_KEY  = 'pp_doc_overrides';
const CONFIRMED_KEYS_KEY = 'pp_confirmed_keys';
const PENDING_KEYS_KEY   = 'pp_pending_keys';

type DocOverrides = Record<DocKey, Partial<TokenMap>>;
type StringArrayMap = Record<DocKey, string[]>;

const loadJSON = <T>(k: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(k) || '') as T; }
  catch { return fallback; }
};
const saveJSON = (k: string, v: any) => localStorage.setItem(k, JSON.stringify(v));

let standaloneDocs = new Set<string>(loadJSON<string[]>(STANDALONE_KEY, []));
let docOverrides: DocOverrides = loadJSON<DocOverrides>(OVERRIDES_KEY, {});
let confirmedKeysByDoc: StringArrayMap = loadJSON<StringArrayMap>(CONFIRMED_KEYS_KEY, {});
let pendingKeysByDoc  : StringArrayMap = loadJSON<StringArrayMap>(PENDING_KEYS_KEY, {});

const saveStandalone = () => saveJSON(STANDALONE_KEY, [...standaloneDocs]);
const saveOverrides  = () => saveJSON(OVERRIDES_KEY, docOverrides);
const saveConfirmed  = () => saveJSON(CONFIRMED_KEYS_KEY, confirmedKeysByDoc);
const savePending    = () => saveJSON(PENDING_KEYS_KEY,   pendingKeysByDoc);

let currentSegment: string | null = null;
let currentPolicy : string | null = null;
let currentDocKey : DocKey | null = null;

const keyFor = (segment: string, policy: string): DocKey => `${segment}::${policy}`;
const getEffectiveMap = (docKey: DocKey | null): TokenMap =>
  ({ ...(tokenMap || {}), ...(docKey ? (docOverrides[docKey] || {}) : {}) } as TokenMap);

const getConfirmedSet = (docKey: DocKey | null) => new Set<string>(docKey ? (confirmedKeysByDoc[docKey] || []) : []);
const getPendingSet   = (docKey: DocKey | null) => new Set<string>(docKey ? (pendingKeysByDoc[docKey] || []) : []);
const setConfirmedSet = (docKey: DocKey, s: Set<string>) => { confirmedKeysByDoc[docKey] = [...s]; saveConfirmed(); };
const setPendingSet   = (docKey: DocKey, s: Set<string>) => { pendingKeysByDoc[docKey]   = [...s]; savePending(); };

/* ----------------- Data (policy catalog) ----------------- */

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

/* ----------------- DOM ----------------- */

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
const viewTemplate  = document.getElementById('viewTemplate')!;
const viewUpdates   = document.getElementById('viewUpdates')!;
const trackChanges  = document.getElementById('trackChanges')!;
const demoReset     = document.getElementById('demoReset')!;
const toggleSearchBar = document.getElementById('toggleSearchBar')!;
const logoutBtn     = document.getElementById('logout')!;

/* Optional doc manager elements (guarded) */
const manageDocsBtn = document.getElementById('manageDocs');
const docMgrMenu    = document.getElementById('docMgrMenu');
const docMgrClose   = document.getElementById('docMgrClose');
const docMgrList    = document.getElementById('docMgrList');

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

/* Context fields */
const orgShortInput = document.getElementById('orgShortInput') as HTMLInputElement;
const orgInput      = document.getElementById('orgInput') as HTMLInputElement;
const personInput   = document.getElementById('personInput') as HTMLInputElement;
const serviceInput  = document.getElementById('serviceInput') as HTMLInputElement;
const saveTokensBtn = document.getElementById('saveTokensBtn')!;

/* Updates */
const updateTabBtn  = document.getElementById('updatesToggle')!;
const updatesContent= document.getElementById('updatesContent')!;

/* Doc footer (confirm pending -> green) */
const docFooter     = document.getElementById('docFooter')!;
const confirmBox    = document.getElementById('confirmChanges') as HTMLInputElement;

const openContextBtn = document.getElementById('openContextBtn') as HTMLButtonElement;

const trackPopup    = document.getElementById('trackPopup')!;
const changeLogContent = document.getElementById('changeLogContent')!;
const closeTrackBtn = document.getElementById('closeTrack')!;

/* ----------------- Permissions & UI bits ----------------- */

function applyPermissions() {
  document.querySelectorAll('#adminMenu li.admin-only').forEach(li => {
    (li as HTMLElement).style.display = (currentUserRole === 'admin') ? 'block' : 'none';
  });
}
function updateLastUpdated() { updateLastUpdatedUI(tokenMap); }

/* ----------------- Auth ----------------- */

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

/* ----------------- Drawers ----------------- */

const closeAllDrawers = () => {
  adminPopup.classList.remove('open');
  updatesDrawer.classList.remove('open');
  drawerScrim.classList.remove('show');
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
  updatesDrawer.classList.add('open');
  drawerScrim.classList.add('show');
};

adminBtn.addEventListener('click', () => {
  const show = adminMenu.style.display !== 'block';
  adminMenu.style.display = show ? 'block' : 'none';
  if (!show) hideDocMgr();
});
ctxSettings.addEventListener('click', openContextDrawer);
openContextBtn.addEventListener('click', openContextDrawer);
updateTabBtn.addEventListener('click', openUpdatesDrawer);

drawerScrim.addEventListener('click', () => { closeAllDrawers(); adminMenu.style.display = 'none'; hideDocMgr(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeAllDrawers(); adminMenu.style.display = 'none'; hideDocMgr(); } });

/* ----------------- Admin menu items ----------------- */

viewTemplate.addEventListener('click', () => { adminMenu.style.display = 'none'; alert('View Template coming soon.'); });
viewUpdates.addEventListener('click', () => { adminMenu.style.display = 'none'; alert('View Updates coming soon.'); });

demoReset.addEventListener('click', () => {
  adminMenu.style.display = 'none';
  if (!confirm('Really clear all change history?')) return;
  changeLog = [];
  saveChangeLog(changeLog);
  changeLogContent.innerHTML = '<p>No changes yet.</p>';
  updatesContent.innerHTML = '<p>No updates for this document.</p>';
});

/* ----------------- Save contextual settings ----------------- */

saveTokensBtn.addEventListener('click', () => {
  const oldMap = { ...tokenMap };

  tokenMap.organisation_name  = (orgInput.value || '').trim();
  (tokenMap as any).organisation_short = (orgShortInput.value || '').trim();
  tokenMap.person             = (personInput.value || '').trim();
  tokenMap.service_type       = (serviceInput.value || '').trim();

  const now = new Date().toISOString();
  tokenMap.updatedAt = now;

  (['organisation_name','organisation_short','person','service_type'] as TokenKey[])
    .forEach((field) => {
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
});

/* ----------------- Change log modal ----------------- */

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

/* ----------------- Wheel + navigation ----------------- */

const policiesDataLocal = policiesData;
const policyColorsLocal = policyColors;

function resolveSegmentKey(name: string): string {
  const norm = (s: string) => s.toLowerCase().trim();
  const match = Object.keys(policiesDataLocal).find(k => norm(k) === norm(name));
  return match || name;
}

function renderDoc(segmentName: string, policy: string) {
  currentSegment = segmentName;
  currentPolicy  = policy;
  currentDocKey  = keyFor(segmentName, policy);

  const eff = getEffectiveMap(currentDocKey);
  const confirmed = getConfirmedSet(currentDocKey);
  const pending   = getPendingSet(currentDocKey);

  const docEl = document.getElementById('docContent');
  if (docEl) docEl.textContent = 'Loading…';
  loadAndRender(segmentName, policy, eff, changeLog, { confirmed, pending })
    .then(() => updateConfirmUI());
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
      renderDoc(segmentName, policy);
    },
    color
  );

  // initial
  let initial = policies[0];
  if (policyId) {
    const m = policies.find(p => p.startsWith(`${policyId} `) || p === policyId);
    if (m) initial = m;
  }
  if (initial && !/^2\.\d+\s+Placeholder$/i.test(initial)) {
    renderDoc(segmentName, initial);
  } else {
    const docEl = document.getElementById('docContent');
    if (docEl) docEl.textContent = 'Select a policy';
  }
}

drawWheel(svgWheel, selectSegment);

/* ----------------- Inline token editing ----------------- */

function pushChangeLog(field: TokenKey, oldValue: string, newValue: string) {
  const entry: ChangeLogEntry = {
    field,
    oldValue,
    newValue,
    user: currentUsername || 'unknown',
    timestamp: new Date().toISOString()
  };
  changeLog.push(entry);
  saveChangeLog(changeLog);
}

function markAllOccurrences(key: string, classToAdd: string, classToRemove?: string) {
  document.querySelectorAll<HTMLElement>(`.token-edit[data-key="${key}"]`).forEach(span => {
    if (classToRemove) span.classList.remove(classToRemove);
    span.classList.add(classToAdd);
  });
}

function updateConfirmUI() {
  if (!currentDocKey) { docFooter.classList.add('hidden'); return; }
  const pending = getPendingSet(currentDocKey);
  if (pending.size > 0) {
    docFooter.classList.remove('hidden');
    if (confirmBox) confirmBox.checked = false;
  } else {
    docFooter.classList.add('hidden');
    if (confirmBox) confirmBox.checked = false;
  }
}

function enableInlineTokenEditing() {
  const root = document.getElementById('docContent');
  if (!root) return;

  // plain-text paste only
  root.addEventListener('paste', (e: any) => {
    const t = (e.target as HTMLElement)?.closest('.token-edit');
    if (!t) return;
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  });

  root.addEventListener('input', (e: any) => {
    const el = (e.target as HTMLElement)?.closest('.token-edit') as HTMLElement | null;
    if (!el || !currentDocKey) return;

    const key   = el.dataset.key as TokenKey;
    const typed = (el.textContent || '').trim();

    // Decide where to save: per-doc if standalone, else global
    if (standaloneDocs.has(currentDocKey)) {
      const ov = (docOverrides[currentDocKey] ||= {});
      const before = String((ov[key] ?? tokenMap[key] ?? '') as any);
      ov[key] = typed as any;
      saveOverrides();
      pushChangeLog(key, before, typed);
    } else {
      const before = String((tokenMap[key] ?? '') as any);
      (tokenMap as any)[key] = typed;
      tokenMap.updatedAt = new Date().toISOString();
      saveTokenMap(tokenMap);
      pushChangeLog(key, before, typed);
    }

    updateLastUpdatedUI(tokenMap);

    // Mark as PENDING (amber) for this document
    const pend = getPendingSet(currentDocKey);
    pend.add(key as string);
    setPendingSet(currentDocKey, pend);

    // UI: amber now; remove green if present
    markAllOccurrences(key as string, 'token-pending', 'token-saved');

    updateConfirmUI();
  });
}

/* Confirm pending -> saved (amber -> green) */
if (confirmBox) {
  confirmBox.addEventListener('change', () => {
    if (!currentDocKey) return;
    if (!confirmBox.checked) return; // only act on check

    const pend = getPendingSet(currentDocKey);
    if (pend.size === 0) { confirmBox.checked = false; return; }

    const conf = getConfirmedSet(currentDocKey);
    pend.forEach(k => conf.add(k));
    setConfirmedSet(currentDocKey, conf);
    setPendingSet(currentDocKey, new Set<string>()); // clear all pending

    // UI: switch amber -> green
    pend.forEach(k => markAllOccurrences(k, 'token-saved', 'token-pending'));

    // reset checkbox and footer visibility
    confirmBox.checked = false;
    updateConfirmUI();
  });
}

/* ----------------- Document Manager (nested drop-down) ----------------- */

function buildDocMgrMenu() {
  if (!docMgrList) return;
  docMgrList.innerHTML = '';

  for (const segment of Object.keys(policiesData)) {
    const section = document.createElement('div');
    section.className = 'dm-section';

    const segTitle = document.createElement('div');
    segTitle.className = 'dm-seg';
    segTitle.textContent = segment;
    section.appendChild(segTitle);

    for (const policy of policiesData[segment]) {
      const docKey = keyFor(segment, policy);
      const row = document.createElement('label');
      row.className = 'dm-row';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = standaloneDocs.has(docKey);
      cb.dataset.doc = docKey;

      const title = document.createElement('span');
      title.className = 'dm-title';
      title.textContent = policy;

      const tag = document.createElement('span');
      tag.className = 'dm-tag';
      tag.textContent = cb.checked ? 'Standalone' : 'Grouped';

      cb.addEventListener('change', () => {
        const checked = cb.checked;
        if (checked) {
          standaloneDocs.add(docKey);
          docOverrides[docKey] ||= {};
        } else {
          standaloneDocs.delete(docKey);
          delete docOverrides[docKey];
        }
        tag.textContent = checked ? 'Standalone' : 'Grouped';
        saveStandalone();
        saveOverrides();

        // re-render effective map
        if (currentDocKey === docKey && currentSegment && currentPolicy) {
          renderDoc(currentSegment, currentPolicy);
        }
      });

      row.appendChild(cb);
      row.appendChild(title);
      row.appendChild(tag);
      section.appendChild(row);
    }

    docMgrList.appendChild(section);
  }
}

function showDocMgr() {
  if (!manageDocsBtn || !docMgrMenu) return;
  const top = (manageDocsBtn as HTMLElement).offsetTop;
  (docMgrMenu as HTMLElement).style.top = `${top}px`;
  buildDocMgrMenu();
  docMgrMenu.classList.add('show');
}
function hideDocMgr() {
  if (!docMgrMenu) return;
  docMgrMenu.classList.remove('show');
}

if (manageDocsBtn) {
  manageDocsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!docMgrMenu) return;
    const open = !docMgrMenu.classList.contains('show');
    if (open) showDocMgr(); else hideDocMgr();
  });
}
if (docMgrClose) {
  docMgrClose.addEventListener('click', (e) => { e.stopPropagation(); hideDocMgr(); });
}
document.addEventListener('click', (e) => {
  const inside = (e.target as Node) && (adminMenu.contains(e.target as Node) || (docMgrMenu?.contains(e.target as Node) ?? false));
  if (!inside) { hideDocMgr(); adminMenu.style.display = 'none'; }
});

/* ----------------- Search ----------------- */

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
      btn.addEventListener('click', () => {
        renderDoc(doc.segment, doc.policy);
      });
      resultsContent.appendChild(div);
    }
  }
  searchResults.classList.remove('hidden');
});
closeResultsBtn.addEventListener('click', () => { searchResults.classList.add('hidden'); });

/* ----------------- Boot ----------------- */

window.addEventListener('DOMContentLoaded', () => {
  indexDocuments();
  enableInlineTokenEditing();
});
