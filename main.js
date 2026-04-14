/* ═══════════════════════════════════════
   えどねっと Quick · main.js
   Change API_BASE after deploying backend
═══════════════════════════════════════ */

const API_BASE = 'https://YOUR-BACKEND.up.railway.app';

const FACILITIES = {
  sports:  ['江戸川スポーツランド','小松川スポーツセンター','葛西スポーツセンター','小岩スポーツセンター','東部スポーツセンター'],
  culture: ['東葛西コミュニティ会館','小松川コミュニティ会館','葛西区民館','小岩区民館','鹿骨コミュニティ会館'],
  large:   ['タワーホール船堀','総合文化センター','グリーンパレス'],
};
const TIME_SLOTS = ['09:00','10:00','11:00','13:00','14:00','15:00','17:00','18:00','19:00'];

const NAV = [
  { screen:'home',     icon:'🏠', label:'Home' },
  { screen:'lottery',  icon:'🎲', label:'Lottery' },
  { screen:'results',  icon:'🏆', label:'Results' },
  { screen:'scan',     icon:'🔍', label:'Scan' },
];

const state = {
  userId: '',
  token: null,
  results: [],
  filter: 'all',
};

/* ════════ INIT ════════ */
document.addEventListener('DOMContentLoaded', () => {
  buildNavs();
  restoreCreds();
  attachEvents();
  generateDateChips();
  updateCalStatus();
});

/* ════════ NAV BUILDING ════════ */
function buildNavs() {
  document.querySelectorAll('.bottom-nav').forEach(nav => {
    const active = nav.dataset.screen;
    nav.innerHTML = NAV.map(n => `
      <div class="nav-item ${n.screen === active ? 'active' : ''}" data-nav="${n.screen}">
        <div class="nav-icon">${n.icon}</div>
        <div class="nav-label">${n.label}</div>
      </div>`).join('');
  });
}

/* ════════ EVENT DELEGATION ════════ */
function attachEvents() {
  document.body.addEventListener('click', e => {
    const navEl   = e.target.closest('[data-nav]');
    const chipEl  = e.target.closest('.chip');
    const slotEl  = e.target.closest('.slot');
    const actionEl = e.target.closest('[data-action]');

    if (navEl)    { goTo(navEl.dataset.nav); return; }
    if (actionEl) { showToast('📋 Coming soon'); return; }
    if (chipEl)   { handleChip(chipEl); return; }
    if (slotEl)   { handleSlot(slotEl); return; }
  });

  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('input-password').addEventListener('keydown', e => { if (e.key==='Enter') doLogin(); });
  document.getElementById('btn-logout').addEventListener('click', doLogout);
  document.getElementById('sel-facility-type').addEventListener('change', onFacilityChange);
  document.getElementById('btn-lottery-submit').addEventListener('click', submitLottery);
  document.getElementById('btn-scan').addEventListener('click', doScan);
}

/* ════════ ROUTING ════════ */
function goTo(screen) {
  if (screen !== 'login' && !state.token) { showToast('⚠️ Please login first'); return; }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${screen}`).classList.add('active');
  window.scrollTo(0, 0);
  if (screen === 'results')  loadResults();
  if (screen === 'home')     refreshHomeTiles();
}

/* ════════ LOGIN ════════ */
async function doLogin() {
  const uid = document.getElementById('input-userid').value.trim();
  const pw  = document.getElementById('input-password').value.trim();
  const err = document.getElementById('login-error');
  err.textContent = '';

  if (!uid || !pw) { err.textContent = '⚠️ Enter your User ID and password'; return; }

  setBtnLoading('btn-login', 'login-label', 'login-spinner', true);

  try {
    if (API_BASE.includes('YOUR-BACKEND')) throw new Error('dev');
    const res  = await apiFetch('/api/login', 'POST', { user_id: uid, password: pw });
    const data = await res.json();
    if (res.ok && data.success) {
      onLoginSuccess(uid, pw, data.session_token);
    } else {
      err.textContent = data.error || '❌ Login failed. Check your credentials.';
    }
  } catch {
    // Dev mode — skip backend
    onLoginSuccess(uid, pw, 'dev-token');
    showToast('🛠 Dev mode · backend not connected');
  } finally {
    setBtnLoading('btn-login', 'login-label', 'login-spinner', false);
  }
}

function onLoginSuccess(uid, pw, token) {
  state.userId = uid;
  state.token  = token;
  if (document.getElementById('toggle-remember').checked) saveCreds(uid, pw);
  document.getElementById('home-userid-display').textContent = uid;
  document.getElementById('home-session-badge').textContent  = 'LOGGED IN';
  goTo('home');
  refreshHomeTiles();
}

function doLogout() {
  state.userId = '';
  state.token  = null;
  goTo('login');
  showToast('👋 Logged out');
}

/* ════════ HOME TILES ════════ */
function refreshHomeTiles() {
  // These will be real counts once backend is connected
  document.getElementById('tile-lottery-count').textContent  = '–';
  document.getElementById('tile-results-count').textContent  = state.results.length || '–';
  document.getElementById('tile-scan-count').textContent     = '–';
  document.getElementById('tile-bookings-count').textContent = '–';

  const pending = state.results.filter(r => r.status === 'pending').length;
  const badge   = document.getElementById('tile-result-badge');
  if (badge) { badge.style.display = pending ? 'block' : 'none'; badge.textContent = `${pending} New`; }
}

function updateCalStatus() {
  const el  = document.getElementById('cal-status-text');
  if (!el) return;
  const day = new Date().getDate();
  if (day >= 1 && day <= 10)  el.textContent = '🟢 Sports lottery open · closes 10th 22:00';
  else if (day >= 5 && day <= 14) el.textContent = '🟢 Culture lottery open · closes 14th 22:00';
  else el.textContent = '⏳ No window open · Opens 1st of next month';
}

/* ════════ LOTTERY FORM ════════ */
function onFacilityChange() {
  const type = document.getElementById('sel-facility-type').value;
  const el   = document.getElementById('sel-facility-name');
  if (type && FACILITIES[type]) {
    el.style.display = 'block';
    el.innerHTML = '<option value="">Select facility...</option>' +
      FACILITIES[type].map(f => `<option value="${f}">${f}</option>`).join('');
  } else {
    el.style.display = 'none';
  }
  updateSteps();
}

function generateDateChips() {
  const c = document.getElementById('date-chips');
  const chips = [];
  const today = new Date();
  for (let i = 1; chips.length < 8; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) {
      const label = d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'numeric' });
      chips.push(`<div class="chip" data-date="${d.toISOString().slice(0,10)}" data-group="date">${label}</div>`);
    }
  }
  c.innerHTML = chips.join('');
}

function handleChip(chip) {
  // Filter chips
  if (chip.closest('.filter-chips')) {
    chip.closest('.chips-row').querySelectorAll('.chip').forEach(c => c.classList.remove('chip-selected'));
    chip.classList.add('chip-selected');
    state.filter = chip.dataset.filter;
    renderResults();
    return;
  }
  // Scan date chips
  if (chip.dataset.scandate !== undefined) {
    document.querySelectorAll('[data-scandate]').forEach(c => c.classList.remove('chip-selected'));
    chip.classList.add('chip-selected');
    return;
  }
  // Date chips in lottery form
  chip.closest('.chips-row').querySelectorAll('.chip').forEach(c => c.classList.remove('chip-selected'));
  chip.classList.add('chip-selected');
  if (chip.dataset.date) loadTimeSlots(chip.dataset.date);
  updateSteps();
}

async function loadTimeSlots(date) {
  const type = document.getElementById('sel-facility-type').value;
  const name = document.getElementById('sel-facility-name').value;
  const grid = document.getElementById('slots-grid');
  grid.innerHTML = '<div class="slots-placeholder">Loading...</div>';

  let slots;
  try {
    if (!state.token || API_BASE.includes('YOUR-BACKEND')) throw new Error('dev');
    const res  = await apiFetch('/api/slots', 'POST', { session_token:state.token, facility_type:type, facility_name:name, date });
    const data = await res.json();
    slots = data.slots;
  } catch {
    slots = TIME_SLOTS.map(t => ({ time:t, available: Math.random() > 0.4 }));
  }
  renderSlots(slots);
  updateSteps();
}

function renderSlots(slots) {
  document.getElementById('slots-grid').innerHTML = slots.map(s => `
    <div class="slot ${s.available ? 'available' : ''}" data-time="${s.time}">
      <span class="time">${s.time}</span>
      <span class="avail">${s.available ? 'open' : '–'}</span>
    </div>`).join('');
}

function handleSlot(slot) {
  document.querySelectorAll('.slot').forEach(s => s.classList.remove('selected'));
  slot.classList.add('selected');
  updateSteps();
}

function updateSteps() {
  const t = document.getElementById('sel-facility-type').value;
  const d = document.querySelector('#date-chips .chip-selected');
  const s = document.querySelector('.slot.selected');
  const dots = [document.getElementById('s1'), document.getElementById('s2'), document.getElementById('s3'), document.getElementById('s4')];
  if (!dots[0]) return;
  dots[0].className = `step-dot ${t ? 'done' : 'active'}`;
  dots[1].className = `step-dot ${t && d ? 'done' : t ? 'active' : ''}`;
  dots[2].className = `step-dot ${t && d && s ? 'done' : (t && d) ? 'active' : ''}`;
  dots[3].className = `step-dot ${t && d && s ? 'active' : ''}`;
}

async function submitLottery() {
  const type    = document.getElementById('sel-facility-type').value;
  const name    = document.getElementById('sel-facility-name').value;
  const dateEl  = document.querySelector('#date-chips .chip-selected');
  const slotEl  = document.querySelector('.slot.selected');
  const purpose = document.getElementById('sel-purpose').value;

  if (!type)    { showToast('⚠️ Select a facility type'); return; }
  if (!dateEl)  { showToast('⚠️ Select a date'); return; }
  if (!slotEl)  { showToast('⚠️ Select a time slot'); return; }
  if (!purpose) { showToast('⚠️ Select a purpose'); return; }

  setBtnLoading('btn-lottery-submit', 'lottery-label', 'lottery-spinner', true);

  try {
    if (API_BASE.includes('YOUR-BACKEND')) throw new Error('dev');
    const res  = await apiFetch('/api/lottery/apply', 'POST', {
      session_token: state.token,
      facility_type: type, facility_name: name,
      date: dateEl.dataset.date, time_slot: slotEl.dataset.time, purpose,
    });
    const data = await res.json();
    if (res.ok && data.success) { showToast('🎲 Lottery submitted!'); goTo('results'); }
    else showToast(`❌ ${data.error || 'Failed'}`);
  } catch {
    showToast('🛠 Backend not connected · form ready');
  } finally {
    setBtnLoading('btn-lottery-submit', 'lottery-label', 'lottery-spinner', false);
  }
}

/* ════════ RESULTS ════════ */
async function loadResults() {
  const loader = document.getElementById('results-loader');
  loader.style.display = 'block';
  try {
    if (API_BASE.includes('YOUR-BACKEND')) throw new Error('dev');
    const res  = await apiFetch('/api/results', 'POST', { session_token: state.token });
    const data = await res.json();
    state.results = data.results || [];
  } catch {
    state.results = [
      { facility:'江戸川スポーツランド',   purpose:'Badminton', date:'Sat 19 Apr', time:'09:00–11:00', status:'pending' },
      { facility:'小松川スポーツセンター', purpose:'Badminton', date:'Sun 20 Apr', time:'14:00–16:00', status:'pending' },
      { facility:'葛西スポーツセンター',   purpose:'Badminton', date:'Sat 5 Apr',  time:'10:00–12:00', status:'won' },
      { facility:'東葛西コミュニティ会館', purpose:'Meeting',   date:'Sun 6 Apr',  time:'13:00–15:00', status:'lost' },
    ];
  } finally {
    loader.style.display = 'none';
    renderResults();
    refreshHomeTiles();
  }
}

function renderResults() {
  const filtered = state.filter === 'all' ? state.results : state.results.filter(r => r.status === state.filter);
  const counts   = { won:0, pending:0, lost:0 };
  state.results.forEach(r => counts[r.status] = (counts[r.status] || 0) + 1);

  const wonEl = document.getElementById('res-won-count');
  const penEl = document.getElementById('res-pending-count');
  const losEl = document.getElementById('res-lost-count');
  if (wonEl) wonEl.textContent = counts.won;
  if (penEl) penEl.textContent = counts.pending;
  if (losEl) losEl.textContent = counts.lost;

  const list = document.getElementById('result-list');
  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">No results found</div></div>';
    return;
  }
  const labels = { won:'Won ✓', lost:'Not Won', pending:'Pending' };
  list.innerHTML = filtered.map(r => `
    <div class="result-card">
      <div class="result-dot dot-${r.status}"></div>
      <div class="result-body">
        <div class="result-facility">${r.facility}</div>
        <div class="result-meta">${r.purpose} · ${r.date}<br>${r.time}</div>
      </div>
      <div class="result-tag tag-${r.status}">${labels[r.status]}</div>
    </div>`).join('');
}

/* ════════ SCAN ════════ */
async function doScan() {
  const loader = document.getElementById('scan-loader');
  const results = document.getElementById('scan-results');
  const type   = document.getElementById('scan-type').value;
  const range  = document.querySelector('[data-scandate].chip-selected')?.dataset.scandate || 'today';

  loader.style.display = 'block';
  results.innerHTML = '';
  setBtnLoading('btn-scan', 'scan-label', 'scan-spinner', true);

  try {
    if (API_BASE.includes('YOUR-BACKEND')) throw new Error('dev');
    const res  = await apiFetch('/api/scan', 'POST', { session_token:state.token, facility_type:type, date_range:range });
    const data = await res.json();
    renderScan(data.slots);
  } catch {
    await delay(1400);
    renderScan([
      { name:'江戸川スポーツランド',   detail:'Badminton · Today', slots:3 },
      { name:'小松川スポーツセンター', detail:'Badminton · Today', slots:0 },
      { name:'葛西スポーツセンター',   detail:'Badminton · Today', slots:1 },
      { name:'小岩スポーツセンター',   detail:'Badminton · Today', slots:5 },
      { name:'東部スポーツセンター',   detail:'Badminton · Today', slots:0 },
    ]);
  } finally {
    loader.style.display = 'none';
    setBtnLoading('btn-scan', 'scan-label', 'scan-spinner', false);
    showToast('✓ Scan complete');
    document.getElementById('tile-scan-count').textContent =
      document.querySelectorAll('.scan-dot.green').length;
  }
}

function renderScan(items) {
  const el = document.getElementById('scan-results');
  if (!items?.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">No results</div></div>';
    return;
  }
  el.innerHTML = items.map(d => {
    const dotClass   = d.slots === 0 ? 'red'    : d.slots === 1 ? 'orange'  : 'green';
    const countClass = d.slots === 0 ? 'red'    : d.slots === 1 ? 'orange'  : 'green';
    const countText  = d.slots === 0 ? 'Full'   : `${d.slots} slot${d.slots > 1 ? 's' : ''} open`;
    return `
      <div class="scan-card">
        <div class="scan-dot ${dotClass}"></div>
        <div class="scan-body">
          <div class="scan-name">${d.name}</div>
          <div class="scan-detail">${d.detail}</div>
        </div>
        <div class="scan-count ${countClass}">${countText}</div>
      </div>`;
  }).join('');
}

/* ════════ UTILS ════════ */
function setBtnLoading(btnId, labelId, spinnerId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  document.getElementById(labelId).style.display  = loading ? 'none'         : 'inline';
  document.getElementById(spinnerId).style.display = loading ? 'inline-block' : 'none';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2600);
}

function saveCreds(uid, pw) {
  try { localStorage.setItem('eq_uid', uid); localStorage.setItem('eq_pw', pw); } catch {}
}

function restoreCreds() {
  try {
    const uid = localStorage.getItem('eq_uid');
    const pw  = localStorage.getItem('eq_pw');
    if (uid) document.getElementById('input-userid').value  = uid;
    if (pw)  document.getElementById('input-password').value = pw;
  } catch {}
}

async function apiFetch(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  return fetch(API_BASE + path, opts);
}

const delay = ms => new Promise(r => setTimeout(r, ms));
