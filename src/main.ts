// src/main.ts
import type { ChangeLogEntry, TokenMap } from './types';
import { loadTokenMap, saveTokenMap, loadChangeLog, saveChangeLog } from './store';
import { checkLogin } from './auth';
import { drawWheel } from './wheel';
import { loadAndRender, renderPolicies, updateLastUpdatedUI, canonicalKey } from './ui';
import { indexDocuments, search as searchDocs } from './search';

/* ----------------- Global state ----------------- */

type DocKey = string;
type TokenKey = keyof TokenMap;

let currentUserRole: 'admin' | 'user' | null = null;
let currentUsername: string | null = null;

let tokenMap: TokenMap = loadTokenMap();
let changeLog: ChangeLogEntry[] = loadChangeLog();

// For per-document overrides & standalone grouping
const STANDALONE_KEY = 'pp_standalone_docs';
const OVERRIDES_KEY  = 'pp_doc_overrides';
type DocOverrides = Record<DocKey, Partial<TokenMap>>;

const loadStandalone = (): Set<DocKey> => {
  try { return new Set(JSON.parse(localStorage.getItem(STANDALONE_KEY) || '[]')); }
  catch { return new Set(); }
};
const saveStandalone = (s: Set<DocKey>) => {
  localStorage.setItem(STANDALONE_KEY, JSON.stringify([...s]));
};

const loadOverrides = (): DocOverrides => {
  try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}') as DocOverrides; }
  catch { return {}; }
};
const persistOverrides = (m: DocOverrides) => {
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(m));
};

let standaloneDocs = loadStandalone();
let docOverrides: DocOverrides = loadOverrides();

let currentSegment: string | null = null;
let currentPolicy : string | null = null;
let currentDocKey : DocKey   | null = null;

// token values used for rendering (global + per-doc override)
const keyFor = (segment: string, policy: string): DocKey => `${segment}::${policy}`;
const getEffectiveMap = (docKey: DocKey | null): TokenMap =>
  ({ ...(tokenMap || {}), ...(docKey ? (docOverrides[docKey] || {}) : {}) } as TokenMap);

// keys edited since last render (amber) waiting for confirmation
let pendingKeys = new Set<string>();

/* ----------------- Policy catalogue ----------------- */

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

// Manage Documents submenu
const manageDocsBtn = document.getElementById('manageDocs')!;
const docMgrMenu    = document.getElementById('docMgrMenu')!;
const docMgrClose   = document.getElementById('docMgrClose')!;
const docMgrList    = document.getElementById('docMgrList')!;

const searchContainer = document.getElementById('searchContainer')!;
const searchInput   = document.getElementById('semanticSearch') as HTMLInputElement;
const searchBtn     = document.getElementById('searchBtn')!;
const searchResults = document.getElementById('searchResults')!;
const resultsContent= document.getElementById('resultsContent')!;
const closeResultsBtn = document.getElementById('closeResultsBtn')!;

const svgWheel      = document.getElementById('policy-wheel') as unknown as SVGSVGElement;

const adminPopup    = document.getElementById('adminPopup')!;      // Right drawer
const updatesDrawer = document.getElementById('updatesDrawer')!;   // Left drawer
const drawerScrim   = document.getElementById('drawerScrim')!;

const orgShortInput = document.getElementById('orgShortInput') as HTMLInputElement;
const orgInput      = document.getElementById('orgInput') as HTMLInputElement;
const personInput   = document.getElementById('personInput') as HTMLInputElement;
const serviceInput  = document.getElementById('serviceInput') as HTMLInputElement;
const saveTokensBtn = document.getElementById('saveTokensBtn')!;

const updateTabBtn  = document.getElementById('updatesToggle')!;
const openContextBtn= document.getElementById('openContextBtn') as HTMLButtonElement;

const trackPopup    = document.getElementById('trackPopup')!;
const changeLogContent = document.getElementById('changeLogContent')!;
const closeTrackBtn = document.getElementById('closeTrack')!;

/* ----------------- Permissions & small UI ----------------- */

function applyPermissions() {
  document.querySelectorAll('#adminMenu li.admin-only').forEach(li => {
    (li as HTMLElement).style.display = (currentUserRole === 'admin') ? 'block' : 'none';
  });
}
function refreshLastUpdated() { updateLastUpdatedUI(tokenMap); }

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
    refreshLastUpdated();
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
  orgInput.value      = tokenMap.organisation_name || '';
  (orgShortInput as HTMLInputElement).value = (tokenMap as any).organisation_short || '';
  personInput.value   = tokenMap.person || '';
  serviceInput.value  = tokenMap.service_type || '';
  adminPopup.classList.add('open');
  drawerScrim.classList.add('show');
};
const openUpdatesDrawer = () => {
  updatesDrawer.classList.add('open');
  drawerScrim.classList.add('show');
};

adminBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const show = adminMenu.style.display !== 'block';
  adminMenu.style.display = show ? 'block' : 'none';
  if (!show) hideDocMgr();
});
document.addEventListener('click', (e) => {
  if (!adminMenu.contains(e.target as Node) && e.target !== adminBtn) {
    adminMenu.style.display = 'none';
    hideDocMgr();
  }
});

ctxSettings.addEventListener('click', openContextDrawer);
openContextBtn.addEventListener('click', openContextDrawer);
updateTabBtn.addEventListener('click', openUpdatesDrawer);

drawerScrim.addEventListener('click', closeAllDrawers);
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
});

toggleSearchBar.addEventListener('click', () => {
  searchContainer.classList.toggle('hidden');
  adminMenu.style.display = 'none';
});

/* ----------------- Save contextual settings (drawer) ----------------- */

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

  refreshLastUpdated();
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

/* ----------------- Manage Documents submenu ----------------- */

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
        saveStandalone(standaloneDocs);
        persistOverrides(docOverrides);

        // If current doc toggled, re-render with effective map
        if (currentDocKey === docKey && currentSegment && currentPolicy) {
          const eff = getEffectiveMap(currentDocKey);
          loadAndRender(currentSegment, currentPolicy, eff, changeLog);
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
  const top = (manageDocsBtn as HTMLElement).offsetTop;
  (docMgrMenu as HTMLElement).style.top = `${top}px`;
  buildDocMgrMenu();
  docMgrMenu.classList.add('show');
}
function hideDocMgr() { docMgrMenu.classList.remove('show'); }

manageDocsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = !docMgrMenu.classList.contains('show');
  if (open) showDocMgr(); else hideDocMgr();
});
docMgrClose.addEventListener('click', (e) => { e.stopPropagation(); hideDocMgr(); });

/* ----------------- Wheel + navigation ----------------- */

const policiesDataLocal = policiesData;
const policyColorsLocal = policyColors;

function resolveSegmentKey(name: string): string {
  const norm = (s: string) => s.toLowerCase().trim();
  const match = Object.keys(policiesDataLocal).find(k => norm(k) === norm(name));
  return match || name;
}

async function selectSegment(segmentOrKey: string, evt: Event) {
  const [incomingName, policyId] = segmentOrKey.split('::');
  const segmentName = resolveSegmentKey(incomingName);

  document.querySelectorAll('#policy-wheel path, #policy-wheel circle')
    .forEach(el => el.classList.remove('active'));

  const segEl = Array.from(document.querySelectorAll('#policy-wheel .seg'))
    .find(el => (el as HTMLElement).getAttribute('data-name')?.toLowerCase() === incomingName.toLowerCase());
  if (segEl) segEl.classList.add('active');
  else (evt.currentTarget as Element)?.classList.add('active');

  const getPolicies = (seg: string) => {
    const target = seg.toLowerCase();
    for (const key of Object.keys(policiesDataLocal)) {
      if (key.toLowerCase() === target) return policiesDataLocal[key];
    }
    return [];
  };

  const policies = getPolicies(segmentName);
  const color = policyColorsLocal[segmentName] || '#1c2b4a';

  renderPolicies(
    segmentName,
    policies,
    async (policy) => {
      if (/^2\.\d+\s+Placeholder$/i.test(policy)) {
        const docEl = document.getElementById('docContent');
        if (docEl) docEl.textContent = 'Placeholder — rename and link later.';
        return;
      }
      currentSegment = segmentName;
      currentPolicy  = policy;
      currentDocKey  = keyFor(segmentName, policy);
      pendingKeys.clear();
      const eff = getEffectiveMap(currentDocKey);
      await loadAndRender(segmentName, policy, eff, changeLog);
    },
    color
  );

  let initial = policies[0];
  if (policyId) {
    const m = policies.find(p => p.startsWith(`${policyId} `) || p === policyId);
    if (m) initial = m;
  }

  const docEl = document.getElementById('docContent');
  const isPlaceholder = initial ? /^2\.\d+\s+Placeholder$/i.test(initial) : false;
  if (!initial || isPlaceholder) {
    if (docEl) docEl.textContent = 'Select a policy';
    return;
  }

  currentSegment = segmentName;
  currentPolicy  = initial;
  currentDocKey  = keyFor(segmentName, initial);
  pendingKeys.clear();
  const eff = getEffectiveMap(currentDocKey);
  if (docEl) docEl.textContent = 'Loading…';
  await loadAndRender(segmentName, initial, eff, changeLog);
}

drawWheel(svgWheel, selectSegment);

/* ----------------- Inline token editing & confirm ----------------- */

/** As user types in a token, keep values in sync and mark as pending (amber). */
function wireInlineEditing() {
  const root = document.getElementById('docContent');
  if (!root) return;

  // Plain-text paste only inside tokens
  root.addEventListener('paste', (e: ClipboardEvent) => {
    const t = (e.target as HTMLElement)?.closest('.token-edit');
    if (!t) return;
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  });

  // Mark as pending, mirror to all occurrences of the same key
  root.addEventListener('input', (e: Event) => {
    const el = (e.target as HTMLElement)?.closest('.token-edit') as HTMLElement | null;
    if (!el) return;

    const key   = canonicalKey(el.dataset.key || '');
    const typed = (el.textContent || '').trim();

    pendingKeys.add(key);

    // Any saved class should be dropped while pending edits exist
    document.querySelectorAll<HTMLElement>(`.token-edit[data-key="${key}"]`).forEach(span => {
      if (span !== el) span.textContent = typed;
      span.classList.remove('token-saved');
      span.classList.add('token-pending');
    });

    // If user toggled confirm earlier, untick it once a fresh change occurs
    const cb = document.getElementById('confirmBox') as HTMLInputElement | null;
    if (cb) cb.checked = false;
  });
}

/** Commit pending keys to global or per-doc maps and turn them green. */
function wireConfirmHandler() {
  const cb = document.getElementById('confirmBox') as HTMLInputElement | null;
  if (!cb) return;

  cb.addEventListener('change', () => {
    if (!cb.checked || !currentDocKey) return;

    const now = new Date().toISOString();
    let changedSomething = false;

    pendingKeys.forEach((key) => {
      // Read the latest typed text (first occurrence is fine — they’re mirrored)
      const first = document.querySelector<HTMLElement>(`.token-edit[data-key="${key}"]`);
      const newValue = (first?.textContent || '').trim();

      // Figure out old value from the correct map
      const isStandalone = standaloneDocs.has(currentDocKey!);
      const targetMap = isStandalone
        ? (docOverrides[currentDocKey!] ||= {})
        : tokenMap;

      const oldValue = String((targetMap as any)[key] ?? (tokenMap as any)[key] ?? '');

      if (newValue !== oldValue) {
        (targetMap as any)[key] = newValue as any;

        const entry: ChangeLogEntry = {
          field: key as TokenKey,
          oldValue,
          newValue,
          user: currentUsername || 'unknown',
          timestamp: now
        };
        changeLog.push(entry);
        changedSomething = true;
      }

      // Turn every occurrence of this key green
      document.querySelectorAll<HTMLElement>(`.token-edit[data-key="${key}"]`).forEach(span => {
        span.classList.remove('token-pending');
        span.classList.add('token-saved');
      });
    });

    if (changedSomething) {
      tokenMap.updatedAt = now;
      saveTokenMap(tokenMap);
      persistOverrides(docOverrides);
      saveChangeLog(changeLog);
      refreshLastUpdated();
    }

    // Done with this confirmation round
    pendingKeys.clear();
    cb.checked = false;
  });
}

/** Re-wire events every time a document is rendered. */
function wireDocEvents() {
  pendingKeys.clear();
  wireInlineEditing();
  wireConfirmHandler();
}

// Re-wire when ui.ts finishes rendering a document
window.addEventListener('pp:doc-rendered', wireDocEvents);

/* ----------------- Search ----------------- */

searchBtn.addEventListener('click', async () => {
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
      btn.addEventListener('click', async () => {
        currentSegment = doc.segment;
        currentPolicy  = doc.policy;
        currentDocKey  = keyFor(doc.segment, doc.policy);
        pendingKeys.clear();
        const eff = getEffectiveMap(currentDocKey);
        await loadAndRender(doc.segment, doc.policy, eff, changeLog);
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
});
