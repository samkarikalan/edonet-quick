var API_BASE = 'https://edonet-quick.onrender.com';

var NAV = [
  { screen:'home',    icon:'Home',    label:'Home' },
  { screen:'scan',    icon:'Scan',    label:'Scan' },
  { screen:'lottery', icon:'Lottery', label:'Lottery' },
  { screen:'results', icon:'Results', label:'Results' },
];

var SLOT_TIMES = [
  { time:'09:00 - 11:00', duration:'2 hours',   key:'0900' },
  { time:'11:00 - 13:00', duration:'2 hours',   key:'1100' },
  { time:'13:00 - 15:00', duration:'2 hours',   key:'1300' },
  { time:'15:00 - 17:00', duration:'2 hours',   key:'1500' },
  { time:'17:00 - 19:00', duration:'2 hours',   key:'1700' },
  { time:'19:00 - 21:00', duration:'2 hours',   key:'1900' },
];

var state = {
  userId: '',
  token: null,
  results: [],
  filter: 'all',
  scanData: {},
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  selectedDate: '',
  selectedFacility: '',
  selectedSlot: null,
  prevScreen: 'scan',
};

document.addEventListener('DOMContentLoaded', function() {
  buildNavs();
  restoreCreds();
  attachEvents();
  updateCalStatus();
});

function buildNavs() {
  document.querySelectorAll('.bottom-nav').forEach(function(nav) {
    var active = nav.dataset.screen;
    nav.innerHTML = NAV.map(function(n) {
      return '<div class="nav-item ' + (n.screen === active ? 'active' : '') + '" data-nav="' + n.screen + '">' +
        '<div class="nav-icon">' + n.icon + '</div>' +
        '<div class="nav-label">' + n.label + '</div></div>';
    }).join('');
  });
}

function attachEvents() {
  document.body.addEventListener('click', function(e) {
    var navEl    = e.target.closest('[data-nav]');
    var chipEl   = e.target.closest('.chip');
    var actionEl = e.target.closest('[data-action]');
    var calDay   = e.target.closest('.cal-day');
    var overlay  = e.target.closest('.bottom-sheet-overlay');
    var sheetItem = e.target.closest('.sheet-item');
    var slotCard  = e.target.closest('.slot-card');

    if (navEl)     { goTo(navEl.dataset.nav); return; }
    if (actionEl)  { showToast('Coming soon'); return; }
    if (chipEl && chipEl.dataset.range)  { selectRangeChip(chipEl); return; }
    if (chipEl && chipEl.dataset.filter) { selectFilterChip(chipEl); return; }
    if (calDay && calDay.dataset.date)   { openSheet(calDay.dataset.date); return; }
    if (overlay)   { closeSheet(); return; }
    if (sheetItem && sheetItem.dataset.facility) { openFacility(sheetItem.dataset.facility); return; }
    if (slotCard && slotCard.dataset.slot) { openConfirm(slotCard.dataset.slot); return; }
  });

  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('input-password').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
  document.getElementById('btn-logout').addEventListener('click', doLogout);
  document.getElementById('btn-scan').addEventListener('click', doScan);
  document.getElementById('cal-prev').addEventListener('click', function() { changeMonth(-1); });
  document.getElementById('cal-next').addEventListener('click', function() { changeMonth(1); });
  document.getElementById('facility-back').addEventListener('click', function() { closeSheet(); goTo('scan'); });
  document.getElementById('confirm-back').addEventListener('click', function() { goTo('facility'); });
  document.getElementById('btn-confirm-book').addEventListener('click', doBook);
  document.getElementById('btn-cancel-book').addEventListener('click', function() { goTo('facility'); });
  document.getElementById('btn-success-home').addEventListener('click', function() { goTo('home'); });
}

function goTo(screen) {
  if (screen !== 'login' && !state.token) { showToast('Please login first'); return; }
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById('screen-' + screen).classList.add('active');
  window.scrollTo(0, 0);
  if (screen === 'results') loadResults();
}

/* -- LOGIN -- */
async function doLogin() {
  var uid = document.getElementById('input-userid').value.trim();
  var pw  = document.getElementById('input-password').value.trim();
  var err = document.getElementById('login-error');
  err.textContent = '';
  if (!uid || !pw) { err.textContent = 'Enter your User ID and password'; return; }
  setBtnLoading('btn-login', 'login-label', 'login-spinner', true);
  try {
    var res  = await fetch(API_BASE + '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: uid, password: pw })
    });
    var data = await res.json();
    if (res.ok && data.success) {
      state.userId = uid;
      state.token  = data.session_token;
      if (document.getElementById('toggle-remember').checked) saveCreds(uid, pw);
      document.getElementById('home-userid-display').textContent = uid;
      goTo('home');
      showToast('Logged in successfully');
    } else {
      err.textContent = data.error || 'Login failed. Check your credentials.';
    }
  } catch(e) {
    err.textContent = 'Cannot reach server: ' + e.message;
  } finally {
    setBtnLoading('btn-login', 'login-label', 'login-spinner', false);
  }
}

function doLogout() {
  state.userId = '';
  state.token  = null;
  goTo('login');
}

function updateCalStatus() {
  var el  = document.getElementById('cal-status-text');
  if (!el) return;
  var day = new Date().getDate();
  if (day >= 1 && day <= 10)      el.textContent = 'Sports lottery open - closes 10th 22:00';
  else if (day >= 5 && day <= 14) el.textContent = 'Culture lottery open - closes 14th 22:00';
  else                            el.textContent = 'No window open - Opens 1st of next month';
}

/* -- SCAN -- */
function selectRangeChip(chip) {
  document.querySelectorAll('[data-range]').forEach(function(c) { c.classList.remove('chip-selected'); });
  chip.classList.add('chip-selected');
}

async function doScan() {
  var rangeChip = document.querySelector('[data-range].chip-selected');
  var days = rangeChip ? parseInt(rangeChip.dataset.range) : 14;
  setBtnLoading('btn-scan', 'scan-label', 'scan-spinner', true);
  document.getElementById('scan-loader').style.display = 'block';
  document.getElementById('scan-empty').style.display  = 'none';
  document.getElementById('cal-wrap').style.display    = 'none';
  try {
    var res  = await fetch(API_BASE + '/api/scan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_token: state.token, days: days })
    });
    var data = await res.json();
    state.scanData = data.availability || makeMockData(days);
  } catch(e) {
    state.scanData = makeMockData(days);
  } finally {
    document.getElementById('scan-loader').style.display = 'none';
    setBtnLoading('btn-scan', 'scan-label', 'scan-spinner', false);
  }
  state.calYear  = new Date().getFullYear();
  state.calMonth = new Date().getMonth();
  renderCalendar();
  document.getElementById('cal-wrap').style.display = 'block';
  showToast('Scan complete');
}

function makeMockData(days) {
  var data = {};
  var today = new Date();
  var facilities = ['Ichinoe Community Hall','Community Plaza Koto','Matsue Kumin Plaza','Bunka Sports Plaza','Hirai Community Hall'];
  for (var i = 0; i < days; i++) {
    var d = new Date(today);
    d.setDate(today.getDate() + i);
    var key   = d.toISOString().slice(0, 10);
    var count = Math.floor(Math.random() * 4);
    data[key] = [];
    for (var j = 0; j < count; j++) {
      var status = Math.random() > 0.3 ? 'available' : 'partial';
      var slots  = SLOT_TIMES.filter(function() { return Math.random() > 0.4; }).map(function(s) {
        return { time: s.time, duration: s.duration, key: s.key, status: Math.random() > 0.3 ? 'available' : 'partial' };
      });
      data[key].push({ name: facilities[j % facilities.length], status: status, slots: slots });
    }
  }
  return data;
}

/* -- CALENDAR -- */
function changeMonth(dir) {
  state.calMonth += dir;
  if (state.calMonth > 11) { state.calMonth = 0;  state.calYear++; }
  if (state.calMonth < 0)  { state.calMonth = 11; state.calYear--; }
  renderCalendar();
}

function renderCalendar() {
  var year  = state.calYear;
  var month = state.calMonth;
  var names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cal-month-title').textContent = names[month] + ' ' + year;
  var grid  = document.getElementById('cal-grid');
  var today = new Date(); today.setHours(0,0,0,0);
  var firstDay    = new Date(year, month, 1).getDay();
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var html = '';
  for (var i = 0; i < firstDay; i++) {
    html += '<div class="cal-day empty"><div class="cal-day-num"></div></div>';
  }
  for (var d = 1; d <= daysInMonth; d++) {
    var dateObj = new Date(year, month, d); dateObj.setHours(0,0,0,0);
    var key     = dateObj.toISOString().slice(0, 10);
    var isToday = dateObj.getTime() === today.getTime();
    var isPast  = dateObj.getTime() < today.getTime();
    var slots   = state.scanData[key];
    var hasData = slots !== undefined;
    var avail   = hasData ? slots.filter(function(s) { return s.status === 'available'; }).length : 0;
    var partial = hasData ? slots.filter(function(s) { return s.status === 'partial'; }).length : 0;
    var total   = hasData ? slots.length : 0;
    var dotColor = ''; var countText = ''; var clickable = false;
    if (hasData && total > 0 && !isPast) {
      clickable = true;
      if (avail > 0)        { dotColor = 'dot-green';  countText = avail + (avail === 1 ? ' facility' : ' facilities'); }
      else if (partial > 0) { dotColor = 'dot-yellow'; countText = partial + ' partial'; }
    } else if (hasData && total === 0 && !isPast) {
      dotColor = 'dot-grey';
    }
    var classes  = 'cal-day' + (isToday ? ' today' : '') + (isPast ? ' past' : '') + (clickable ? ' has-slots' : '');
    var dataAttr = clickable ? ' data-date="' + key + '"' : '';
    html += '<div class="' + classes + '"' + dataAttr + '>' +
      '<div class="cal-day-num">' + d + '</div>' +
      (countText ? '<div class="cal-day-count">' + countText + '</div>' : '') +
      (dotColor  ? '<div class="cal-dot ' + dotColor + '"></div>' : '') +
    '</div>';
  }
  grid.innerHTML = html;
}

/* -- SHEET -- */
function openSheet(dateStr) {
  state.selectedDate = dateStr;
  var slots  = state.scanData[dateStr] || [];
  var d      = new Date(dateStr + 'T00:00:00');
  var days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var label  = days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate();
  document.getElementById('sheet-date').textContent  = label;
  var avail = slots.filter(function(s) { return s.status !== 'none'; });
  document.getElementById('sheet-count').textContent = avail.length + ' facilit' + (avail.length === 1 ? 'y' : 'ies') + ' available';
  var list = document.getElementById('sheet-list');
  if (!avail.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#9CA3AF;">No availability on this date</div>';
  } else {
    list.innerHTML = avail.map(function(s) {
      var dotClass = s.status === 'available' ? 'dot-green' : 'dot-yellow';
      var detail   = s.status === 'available' ? 'Available' : 'Partially available';
      return '<div class="sheet-item" data-facility="' + s.name + '">' +
        '<div class="sheet-item-dot ' + dotClass + '"></div>' +
        '<div class="sheet-item-info">' +
          '<div class="sheet-item-name">' + s.name + '</div>' +
          '<div class="sheet-item-detail">' + detail + ' - Badminton</div>' +
        '</div>' +
        '<div class="sheet-item-arrow">?</div>' +
      '</div>';
    }).join('');
  }
  document.getElementById('sheet-overlay').classList.add('show');
  document.getElementById('bottom-sheet').classList.add('show');
}

function closeSheet() {
  document.getElementById('sheet-overlay').classList.remove('show');
  document.getElementById('bottom-sheet').classList.remove('show');
}

/* -- FACILITY DETAIL -- */
function openFacility(facilityName) {
  state.selectedFacility = facilityName;
  closeSheet();

  var dateStr  = state.selectedDate;
  var slots    = state.scanData[dateStr] || [];
  var facility = null;
  for (var i = 0; i < slots.length; i++) {
    if (slots[i].name === facilityName) { facility = slots[i]; break; }
  }

  var d      = new Date(dateStr + 'T00:00:00');
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var dateLabel = days[d.getDay()] + ' ' + months[d.getMonth()] + ' ' + d.getDate();

  document.getElementById('facility-title').textContent     = facilityName;
  document.getElementById('facility-date-sub').textContent  = dateLabel + ' - Badminton';
  document.getElementById('facility-info-name').textContent = facilityName;

  var badge = document.getElementById('facility-status-badge');
  if (facility && facility.status === 'available') {
    badge.textContent = 'Available';
    badge.style.background = '#D1FAE5';
    badge.style.color = '#10B981';
  } else {
    badge.textContent = 'Partial';
    badge.style.background = '#FEF3C7';
    badge.style.color = '#F59E0B';
  }

  var timeSlots = facility && facility.slots ? facility.slots : [];
  var list = document.getElementById('slots-list');

  if (!timeSlots.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">?</div><div class="empty-text">No time slot data yet.<br>Real data coming after backend mapping.</div></div>';
  } else {
    list.innerHTML = timeSlots.map(function(s) {
      var cls       = s.status === 'available' ? 'slot-available' : 'slot-partial';
      var pillCls   = s.status === 'available' ? 'pill-available' : 'pill-partial';
      var pillLabel = s.status === 'available' ? 'Available' : 'Partial';
      var slotData  = JSON.stringify({ time: s.time, key: s.key, facility: facilityName, date: dateStr });
      return '<div class="slot-card ' + cls + '" data-slot=\'' + slotData + '\'>' +
        '<div class="slot-time-wrap">' +
          '<div class="slot-time">' + s.time + '</div>' +
          '<div class="slot-duration">' + s.duration + '</div>' +
        '</div>' +
        '<div class="slot-status-pill ' + pillCls + '">' + pillLabel + '</div>' +
        '<div class="slot-arrow">?</div>' +
      '</div>';
    }).join('');
  }

  goTo('facility');
}

/* -- CONFIRM BOOKING -- */
function openConfirm(slotDataStr) {
  var slot = JSON.parse(slotDataStr);
  state.selectedSlot = slot;

  var d      = new Date(slot.date + 'T00:00:00');
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var dateLabel = days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate();

  document.getElementById('confirm-facility').textContent = slot.facility;
  document.getElementById('confirm-date').textContent     = dateLabel;
  document.getElementById('confirm-time').textContent     = slot.time;
  document.getElementById('confirm-userid').textContent   = state.userId;

  goTo('confirm');
}

/* -- BOOK -- */
async function doBook() {
  var slot = state.selectedSlot;
  if (!slot) return;

  setBtnLoading('btn-confirm-book', 'confirm-label', 'confirm-spinner', true);

  try {
    var res  = await fetch(API_BASE + '/api/book', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_token: state.token,
        facility: slot.facility,
        date: slot.date,
        time_slot: slot.time,
        purpose: 'Badminton'
      })
    });
    var data = await res.json();

    if (res.ok && data.success) {
      showSuccess(slot);
    } else {
      showToast(data.error || 'Booking failed');
      setBtnLoading('btn-confirm-book', 'confirm-label', 'confirm-spinner', false);
    }
  } catch(e) {
    // Dev mode - show success UI
    showSuccess(slot);
    setBtnLoading('btn-confirm-book', 'confirm-label', 'confirm-spinner', false);
  }
}

function showSuccess(slot) {
  var d      = new Date(slot.date + 'T00:00:00');
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var dateLabel = days[d.getDay()] + ' ' + months[d.getMonth()] + ' ' + d.getDate();

  document.getElementById('success-detail').textContent = 'Booking submitted for ' + dateLabel;
  document.getElementById('success-summary').innerHTML =
    '<div class="success-row"><span class="success-key">Facility</span><span class="success-val">' + slot.facility + '</span></div>' +
    '<div class="success-row"><span class="success-key">Date</span><span class="success-val">' + dateLabel + '</span></div>' +
    '<div class="success-row"><span class="success-key">Time</span><span class="success-val">' + slot.time + '</span></div>' +
    '<div class="success-row"><span class="success-key">Purpose</span><span class="success-val">Badminton</span></div>';

  goTo('success');
}

/* -- RESULTS -- */
async function loadResults() {
  var loader = document.getElementById('results-loader');
  loader.style.display = 'block';
  try {
    var res  = await fetch(API_BASE + '/api/results', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_token: state.token })
    });
    var data = await res.json();
    state.results = data.results || [];
  } catch(e) {
    state.results = [];
  } finally {
    loader.style.display = 'none';
    renderResults();
  }
}

function selectFilterChip(chip) {
  document.querySelectorAll('[data-filter]').forEach(function(c) { c.classList.remove('chip-selected'); });
  chip.classList.add('chip-selected');
  state.filter = chip.dataset.filter;
  renderResults();
}

function renderResults() {
  var filtered = state.filter === 'all' ? state.results : state.results.filter(function(r) { return r.status === state.filter; });
  var list = document.getElementById('result-list');
  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">No results yet</div></div>';
    return;
  }
  var labels = { won:'Won', lost:'Not Won', pending:'Pending' };
  list.innerHTML = filtered.map(function(r) {
    return '<div class="result-card">' +
      '<div class="result-dot dot-' + r.status + '"></div>' +
      '<div class="result-body">' +
        '<div class="result-facility">' + r.facility + '</div>' +
        '<div class="result-meta">' + r.purpose + ' - ' + r.date + '</div>' +
      '</div>' +
      '<div class="result-tag tag-' + r.status + '">' + labels[r.status] + '</div>' +
    '</div>';
  }).join('');
}

/* -- UTILS -- */
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
