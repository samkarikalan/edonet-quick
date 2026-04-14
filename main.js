const API_BASE = 'https://edonet-quick.onrender.com';

const FACILITIES = {
  sports:  ['Edogawa Sports Land','Komatsugawa Sports Center','Kasai Sports Center','Koiwa Sports Center','Tobu Sports Center'],
  culture: ['Higashikasai Community Hall','Komatsugawa Community Hall','Kasai Kumin-kan','Koiwa Kumin-kan','Shikahone Community Hall'],
  large:   ['Tower Hall Funabori','Sogo Bunka Center','Green Palace'],
};
const TIME_SLOTS = ['09:00','10:00','11:00','13:00','14:00','15:00','17:00','18:00','19:00'];

const NAV = [
  { screen:'home',    icon:'Home',    label:'Home' },
  { screen:'lottery', icon:'Lottery', label:'Lottery' },
  { screen:'results', icon:'Results', label:'Results' },
  { screen:'scan',    icon:'Scan',    label:'Scan' },
];

const state = {
  userId: '',
  token: null,
  results: [],
  filter: 'all',
};

document.addEventListener('DOMContentLoaded', () => {
  buildNavs();
  restoreCreds();
  attachEvents();
  generateDateChips();
  updateCalStatus();
});

function buildNavs() {
  document.querySelectorAll('.bottom-nav').forEach(nav => {
    const active = nav.dataset.screen;
    nav.innerHTML = NAV.map(n =>
      '<div class="nav-item ' + (n.screen === active ? 'active' : '') + '" data-nav="' + n.screen + '">' +
      '<div class="nav-icon">' + n.icon + '</div>' +
      '<div class="nav-label">' + n.label + '</div></div>'
    ).join('');
  });
}

function attachEvents() {
  document.body.addEventListener('click', function(e) {
    var navEl    = e.target.closest('[data-nav]');
    var chipEl   = e.target.closest('.chip');
    var slotEl   = e.target.closest('.slot');
    var actionEl = e.target.closest('[data-action]');
    if (navEl)    { goTo(navEl.dataset.nav); return; }
    if (actionEl) { showToast('Coming soon'); return; }
    if (chipEl)   { handleChip(chipEl); return; }
    if (slotEl)   { handleSlot(slotEl); return; }
  });
  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('input-password').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
  document.getElementById('btn-logout').addEventListener('click', doLogout);
  document.getElementById('sel-facility-type').addEventListener('change', onFacilityChange);
  document.getElementById('btn-lottery-submit').addEventListener('click', submitLottery);
  document.getElementById('btn-scan').addEventListener('click', doScan);
}

function goTo(screen) {
  if (screen !== 'login' && !state.token) { showToast('Please login first'); return; }
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById('screen-' + screen).classList.add('active');
  window.scrollTo(0, 0);
  if (screen === 'results') loadResults();
  if (screen === 'home')    refreshHomeTiles();
}

async function doLogin() {
  var uid = document.getElementById('input-userid').value.trim();
  var pw  = document.getElementById('input-password').value.trim();
  var err = document.getElementById('login-error');
  err.textContent = '';

  if (!uid || !pw) { err.textContent = 'Enter your User ID and password'; return; }

  setBtnLoading('btn-login', 'login-label', 'login-spinner', true);

  try {
    var res  = await fetch(API_BASE + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: uid, password: pw })
    });
    var data = await res.json();
    if (res.ok && data.success) {
      onLoginSuccess(uid, pw, data.session_token);
    } else {
      err.textContent = data.error || 'Login failed. Check your credentials.';
    }
  } catch (e) {
    err.textContent = 'Cannot reach server: ' + e.message;
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
  showToast('Logged out');
}

function refreshHomeTiles() {
  document.getElementById('tile-lottery-count').textContent  = '-';
  document.getElementById('tile-results-count').textContent  = state.results.length || '-';
  document.getElementById('tile-scan-count').textContent     = '-';
  document.getElementById('tile-bookings-count').textContent = '-';
  var pending = state.results.filter(function(r) { return r.status === 'pending'; }).length;
  var badge = document.getElementById('tile-result-badge');
  if (badge) { badge.style.display = pending ? 'block' : 'none'; badge.textContent = pending + ' New'; }
}

function updateCalStatus() {
  var el  = document.getElementById('cal-status-text');
  if (!el) return;
  var day = new Date().getDate();
  if (day >= 1 && day <= 10)       el.textContent = 'Sports lottery open - closes 10th 22:00';
  else if (day >= 5 && day <= 14)  el.textContent = 'Culture lottery open - closes 14th 22:00';
  else                             el.textContent = 'No window open - Opens 1st of next month';
}

function onFacilityChange() {
  var type = document.getElementById('sel-facility-type').value;
  var el   = document.getElementById('sel-facility-name');
  if (type && FACILITIES[type]) {
    el.style.display = 'block';
    el.innerHTML = '<option value="">Select facility...</option>' +
      FACILITIES[type].map(function(f) { return '<option value="' + f + '">' + f + '</option>'; }).join('');
  } else {
    el.style.display = 'none';
  }
  updateSteps();
}

function generateDateChips() {
  var c = document.getElementById('date-chips');
  var chips = [];
  var today = new Date();
  for (var i = 1; chips.length < 8; i++) {
    var d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) {
      var label = d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'numeric' });
      chips.push('<div class="chip" data-date="' + d.toISOString().slice(0,10) + '">' + label + '</div>');
    }
  }
  c.innerHTML = chips.join('');
}

function handleChip(chip) {
  if (chip.closest('.filter-chips')) {
    chip.closest('.chips-row').querySelectorAll('.chip').forEach(function(c) { c.classList.remove('chip-selected'); });
    chip.classList.add('chip-selected');
    state.filter = chip.dataset.filter;
    renderResults();
    return;
  }
  if (chip.dataset.scandate !== undefined) {
    document.querySelectorAll('[data-scandate]').forEach(function(c) { c.classList.remove('chip-selected'); });
    chip.classList.add('chip-selected');
    return;
  }
  chip.closest('.chips-row').querySelectorAll('.chip').forEach(function(c) { c.classList.remove('chip-selected'); });
  chip.classList.add('chip-selected');
  if (chip.dataset.date) loadTimeSlots(chip.dataset.date);
  updateSteps();
}

async function loadTimeSlots(dt) {
  var type = document.getElementById('sel-facility-type').value;
  var name = document.getElementById('sel-facility-name').value;
  var grid = document.getElementById('slots-grid');
  grid.innerHTML = '<div class="slots-placeholder">Loading...</div>';
  try {
    var res  = await fetch(API_BASE + '/api/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_token: state.token, facility_type: type, facility_name: name, date: dt })
    });
    var data = await res.json();
    renderSlots(data.slots);
  } catch (e) {
    renderSlots(TIME_SLOTS.map(function(t) { return { time: t, available: true }; }));
  }
  updateSteps();
}

function renderSlots(slots) {
  document.getElementById('slots-grid').innerHTML = slots.map(function(s) {
    return '<div class="slot ' + (s.available ? 'available' : '') + '" data-time="' + s.time + '">' +
           '<span class="time">' + s.time + '</span>' +
           '<span class="avail">' + (s.available ? 'open' : '-') + '</span></div>';
  }).join('');
}

function handleSlot(slot) {
  document.querySelectorAll('.slot').forEach(function(s) { s.classList.remove('selected'); });
  slot.classList.add('selected');
  updateSteps();
}

function updateSteps() {
  var t = document.getElementById('sel-facility-type').value;
  var d = document.querySelector('#date-chips .chip-selected');
  var s = document.querySelector('.slot.selected');
  var dots = ['s1','s2','s3','s4'].map(function(id) { return document.getElementById(id); });
  if (!dots[0]) return;
  dots[0].className = 'step-dot ' + (t ? 'done' : 'active');
  dots[1].className = 'step-dot ' + (t && d ? 'done' : t ? 'active' : '');
  dots[2].className = 'step-dot ' + (t && d && s ? 'done' : (t && d) ? 'active' : '');
  dots[3].className = 'step-dot ' + (t && d && s ? 'active' : '');
}

async function submitLottery() {
  var type    = document.getElementById('sel-facility-type').value;
  var name    = document.getElementById('sel-facility-name').value;
  var dateEl  = document.querySelector('#date-chips .chip-selected');
  var slotEl  = document.querySelector('.slot.selected');
  var purpose = document.getElementById('sel-purpose').value;
  if (!type)    { showToast('Select a facility type'); return; }
  if (!dateEl)  { showToast('Select a date'); return; }
  if (!slotEl)  { showToast('Select a time slot'); return; }
  if (!purpose) { showToast('Select a purpose'); return; }
  setBtnLoading('btn-lottery-submit', 'lottery-label', 'lottery-spinner', true);
  try {
    var res  = await fetch(API_BASE + '/api/lottery/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_token: state.token, facility_type: type, facility_name: name, date: dateEl.dataset.date, time_slot: slotEl.dataset.time, purpose: purpose })
    });
    var data = await res.json();
    if (res.ok && data.success) { showToast('Lottery submitted!'); goTo('results'); }
    else showToast(data.error || 'Failed');
  } catch (e) {
    showToast('Error: ' + e.message);
  } finally {
    setBtnLoading('btn-lottery-submit', 'lottery-label', 'lottery-spinner', false);
  }
}

async function loadResults() {
  var loader = document.getElementById('results-loader');
  loader.style.display = 'block';
  try {
    var res  = await fetch(API_BASE + '/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_token: state.token })
    });
    var data = await res.json();
    state.results = data.results || [];
  } catch (e) {
    state.results = [];
  } finally {
    loader.style.display = 'none';
    renderResults();
    refreshHomeTiles();
  }
}

function renderResults() {
  var filtered = state.filter === 'all' ? state.results : state.results.filter(function(r) { return r.status === state.filter; });
  var counts = { won:0, pending:0, lost:0 };
  state.results.forEach(function(r) { counts[r.status] = (counts[r.status] || 0) + 1; });
  var wonEl = document.getElementById('res-won-count');
  var penEl = document.getElementById('res-pending-count');
  var losEl = document.getElementById('res-lost-count');
  if (wonEl) wonEl.textContent = counts.won;
  if (penEl) penEl.textContent = counts.pending;
  if (losEl) losEl.textContent = counts.lost;
  var list = document.getElementById('result-list');
  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">No results</div></div>';
    return;
  }
  var labels = { won:'Won', lost:'Not Won', pending:'Pending' };
  list.innerHTML = filtered.map(function(r) {
    return '<div class="result-card">' +
      '<div class="result-dot dot-' + r.status + '"></div>' +
      '<div class="result-body">' +
        '<div class="result-facility">' + r.facility + '</div>' +
        '<div class="result-meta">' + r.purpose + ' - ' + r.date + '<br>' + r.time + '</div>' +
      '</div>' +
      '<div class="result-tag tag-' + r.status + '">' + labels[r.status] + '</div>' +
    '</div>';
  }).join('');
}

async function doScan() {
  var loader  = document.getElementById('scan-loader');
  var results = document.getElementById('scan-results');
  var type    = document.getElementById('scan-type').value;
  var chip    = document.querySelector('[data-scandate].chip-selected');
  var range   = chip ? chip.dataset.scandate : 'today';
  loader.style.display = 'block';
  results.innerHTML = '';
  setBtnLoading('btn-scan', 'scan-label', 'scan-spinner', true);
  try {
    var res  = await fetch(API_BASE + '/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_token: state.token, facility_type: type, date_range: range })
    });
    var data = await res.json();
    renderScan(data.slots);
  } catch (e) {
    results.innerHTML = '<div class="empty-state"><div class="empty-text">Error: ' + e.message + '</div></div>';
  } finally {
    loader.style.display = 'none';
    setBtnLoading('btn-scan', 'scan-label', 'scan-spinner', false);
  }
}

function renderScan(items) {
  var el = document.getElementById('scan-results');
  if (!items || !items.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-text">No results</div></div>';
    return;
  }
  el.innerHTML = items.map(function(d) {
    var dotClass   = d.slots === 0 ? 'red' : d.slots === 1 ? 'orange' : 'green';
    var countText  = d.slots === 0 ? 'Full' : d.slots + ' slot' + (d.slots > 1 ? 's' : '') + ' open';
    return '<div class="scan-card">' +
      '<div class="scan-dot ' + dotClass + '"></div>' +
      '<div class="scan-body"><div class="scan-name">' + d.name + '</div>' +
      '<div class="scan-detail">' + d.detail + '</div></div>' +
      '<div class="scan-count ' + dotClass + '">' + countText + '</div></div>';
  }).join('');
}

function setBtnLoading(btnId, labelId, spinnerId, loading) {
  var btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  document.getElementById(labelId).style.display  = loading ? 'none' : 'inline';
  document.getElementById(spinnerId).style.display = loading ? 'inline-block' : 'none';
}

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { t.classList.remove('show'); }, 3000);
}

function saveCreds(uid, pw) {
  try { localStorage.setItem('eq_uid', uid); localStorage.setItem('eq_pw', pw); } catch(e) {}
}

function restoreCreds() {
  try {
    var uid = localStorage.getItem('eq_uid');
    var pw  = localStorage.getItem('eq_pw');
    if (uid) document.getElementById('input-userid').value  = uid;
    if (pw)  document.getElementById('input-password').value = pw;
  } catch(e) {}
}
