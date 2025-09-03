import type { ChangeLogEntry, TokenMap } from './types';
import { loadTokenMap, saveTokenMap, loadChangeLog, saveChangeLog } from './store';
import { checkLogin } from './auth';
import { drawWheel } from './wheel';
import { loadAndRender, renderPolicies, updateLastUpdatedUI } from './ui';
import { indexDocuments, search as searchDocs } from './search';

let currentUserRole: 'admin' | 'user' | null = null;
let currentUsername: string | null = null;

let tokenMap: TokenMap = loadTokenMap();
let changeLog: ChangeLogEntry[] = loadChangeLog();

// Expose for debugging
(Object.assign(window as any, { tokenMap, changeLog }));

/**
 * Data
 */
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

  // 10 placeholders under The organisation (2.1–2.10)
  'The organisation': [
    'Commitment Statement',
    '2.1 Placeholder',
    '2.2 Placeholder',
    '2.3 Placeholder',
    '2.4 Placeholder',
    '2.5 Placeholder',
    '2.6 Placeholder',
    '2.7 Placeholder',
    '2.8 Placeholder',
    '2.9 Placeholder',
    '2.10 Placeholder'
  ],

  'Care and services': ['commitment statement','3.1 Assessment & planning', '3.2 Delivery of services'],
  'The environment': ['commitment statement','4.1a Services in home', '4.1b Services outside home'],
  'Clinical care': ['5.1 Clinical governance', '5.2 Infection control'],
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

const searchContainer = document.getElementById('searchContainer')!;
const searchInput   = document.getElementById('semanticSearch') as HTMLInputElement;
const searchBtn     = document.getElementById('searchBtn')!;
const searchResults = document.getElementById('searchResults')!;
const resultsContent= document.getElementById('resultsContent')!;
const closeResultsBtn = document.getElementById('closeResultsBtn')!;

const svgWheel      = document.getElementById('policy-wheel') as unknown as SVGSVGElement;

const adminPopup    = document.getElementById('adminPopup')!;
const orgInput      = document.getElementById('orgInput') as HTMLInputElement;
const personInput   = document.getElementById('personInput') as HTMLInputElement;
const serviceInput  = document.getElementById('serviceInput') as HTMLInputElement;
const saveTokensBtn = document.getElementById('saveTokensBtn')!;
const updateTabBtn  = document.getElementById('updatesToggle')!;
const updatesContent= document.getElementById('updatesContent')!;

const trackPopup    = document.getElementById('trackPopup')!;
const changeLogContent = document.getElementById('changeLogContent')!;
const closeTrackBtn = document.getElementById('closeTrack')!;

function applyPermissions() {
  document.querySelectorAll('#adminMenu li.admin-only').forEach(li => {
    (li as HTMLElement).style.display = (currentUserRole === 'admin') ? 'block' : 'none';
  });
}

function updateLastUpdated() { updateLastUpdatedUI(tokenMap); }

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

adminBtn.addEventListener('click', () => {
  adminMenu.style.display = (adminMenu.style.display === 'block') ? 'none' : 'block';
});
ctxSettings.addEventListener('click', () => {
  adminMenu.style.display = 'none';
  orgInput.value = tokenMap.organisation_name;
  personInput.value = tokenMap.person;
  serviceInput.value = tokenMap.service_type;
  (adminPopup as HTMLElement).style.display = 'block';
});
viewTemplate.addEventListener('click', () => { adminMenu.style.display = 'none'; alert('View Template coming soon.'); });
viewUpdates.addEventListener('click', () => { adminMenu.style.display = 'none'; alert('View Updates coming soon.'); });
demoReset.addEventListener('click', () => {
  adminMenu.style.display = 'none';
  if (!confirm('Really clear all change history?')) return;
  changeLog = [];
  localStorage.setItem('changeLog', JSON.stringify(changeLog));
  changeLogContent.innerHTML = '<p>No changes yet.</p>';
  updatesContent.innerHTML = '<p>No updates for this document.</p>';
  updatesContent.classList.add('hidden');
});
toggleSearchBar.addEventListener('click', () => { searchContainer.classList.toggle('hidden'); adminMenu.style.display = 'none'; });

saveTokensBtn.addEventListener('click', () => {
  const oldMap = { ...tokenMap };
  tokenMap.organisation_name = (orgInput.value || '').trim();
  tokenMap.person            = (personInput.value || '').trim();
  tokenMap.service_type      = (serviceInput.value || '').trim();
  const now = new Date().toISOString();
  tokenMap.updatedAt = now;
  (['organisation_name','person','service_type'] as const).forEach(field => {
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
  localStorage.setItem('tokenMap', JSON.stringify(tokenMap));
  localStorage.setItem('changeLog', JSON.stringify(changeLog));
  (adminPopup as HTMLElement).style.display = 'none';
  updateLastUpdated();
});

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

const policiesDataLocal = policiesData;
const policyColorsLocal = policyColors;

/** Case-insensitive resolver for segment keys */
function resolveSegmentKey(name: string): string {
  const norm = (s: string) => s.toLowerCase().trim();
  const match = Object.keys(policiesDataLocal).find(k => norm(k) === norm(name));
  return match || name;
}

/**
 * Accepts raw segment ("The organisation") or compound key ("The organisation::2.3").
 * Shows list even if display text casing differs. Skips doc fetch for placeholders.
 */
function selectSegment(segmentOrKey: string, evt: Event) {
  const [incomingName, policyId] = segmentOrKey.split('::');
  const segmentName = resolveSegmentKey(incomingName);

  // Clear active
  document.querySelectorAll('#policy-wheel path, #policy-wheel circle')
    .forEach(el => el.classList.remove('active'));

  // Highlight the exact wedge by matching data-name case-insensitively
  const segEl = Array.from(document.querySelectorAll('#policy-wheel .seg'))
    .find(el => (el as HTMLElement).getAttribute('data-name')?.toLowerCase() === incomingName.toLowerCase());
  if (segEl) segEl.classList.add('active');
  else (evt.currentTarget as Element)?.classList.add('active');

  // Render list
  const policies = getPolicies(segmentName);
  const color = policyColorsLocal[segmentName] || '#1c2b4a';

  function getPolicies(segmentName: string): string[] {
    const target = segmentName.toLowerCase();
    for (const key of Object.keys(policiesData)) {
      if (key.toLowerCase() === target) return policiesData[key];
    }
    return [];
  }
  renderPolicies(
    segmentName,
    policies,
    (policy) => {
      // Block placeholders
      if (/^2\.\d+\s+Placeholder$/i.test(policy)) {
        const docEl = document.getElementById('docContent');
        if (docEl) docEl.textContent = 'Placeholder — rename and link later.';
        return;
      }
      loadAndRender(segmentName, policy, tokenMap, changeLog);
    },
    color
  );

  // Choose initial policy
  let initial = policies[0];
  if (policyId) {
    const m = policies.find(p => p.startsWith(`${policyId} `) || p === policyId);
    if (m) initial = m;
  }

  const docEl = document.getElementById('docContent');
  // Do not auto-load if first is a placeholder
  const isPlaceholder = initial ? /^2\.\d+\s+Placeholder$/i.test(initial) : false;
  if (!initial || isPlaceholder) {
    if (docEl) docEl.textContent = 'Select a policy';
    return;
  }

  if (docEl) docEl.textContent = 'Loading…';
  loadAndRender(segmentName, initial, tokenMap, changeLog);
}

drawWheel(svgWheel, selectSegment);

document.getElementById('updatesToggle')!.addEventListener('click', () => {
  document.getElementById('updatesContent')!.classList.toggle('hidden');
});

document.getElementById('searchBtn')!.addEventListener('click', () => {
  const q = (document.getElementById('semanticSearch') as HTMLInputElement).value.toLowerCase().trim();
  const matches = searchDocs(q);
  const resultsContent = document.getElementById('resultsContent')!;
  const searchResults = document.getElementById('searchResults')!;
  resultsContent.innerHTML = '';
  if (!q) resultsContent.innerHTML = '<p>Please enter a search term.</p>';
  else if (matches.length === 0) resultsContent.innerHTML = '<p>No results found.</p>';
  else {
    for (const doc of matches) {
      const div = document.createElement('div');
      div.style.padding = '10px 0';
      div.innerHTML = `<strong>${doc.title}</strong><br><button style="margin-top:5px;">View Document</button>`;
      const btn = div.querySelector('button')!;
      btn.addEventListener('click', () => { loadAndRender(doc.segment, doc.policy, tokenMap, changeLog); });
      resultsContent.appendChild(div);
    }
  }
  searchResults.classList.remove('hidden');
});
document.getElementById('closeResultsBtn')!.addEventListener('click', () => {
  document.getElementById('searchResults')!.classList.add('hidden');
});

window.addEventListener('DOMContentLoaded', () => { indexDocuments(); });
