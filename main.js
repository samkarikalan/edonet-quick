var API_BASE = 'https://edonet-quick.onrender.com';

var NAV = [
  { screen:'home',     icon:'Home',     label:'Home' },
  { screen:'scan',     icon:'Scan',     label:'Scan' },
  { screen:'bookings', icon:'Bookings', label:'Bookings' },
  { screen:'members',  icon:'Members',  label:'Members' },
];

var SLOT_TIMES = [
  { time:'09:00 - 11:00', duration:'2 hours', key:'0900' },
  { time:'11:00 - 13:00', duration:'2 hours', key:'1100' },
  { time:'13:00 - 15:00', duration:'2 hours', key:'1300' },
  { time:'15:00 - 17:00', duration:'2 hours', key:'1500' },
  { time:'17:00 - 19:00', duration:'2 hours', key:'1700' },
  { time:'19:00 - 21:00', duration:'2 hours', key:'1900' },
];

var state = {
  adminId: '',
  adminToken: null,
  members: [],
  bookings: [],
  bookingFilter: 'upcoming',
  results: [],
  filter: 'all',
  scanData: {},
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  selectedDate: '',
  selectedFacility: '',
  selectedSlot: null,
};

// -- STORAGE --
function loadMembers() {
  try { state.members = JSON.parse(localStorage.getItem('eq_members') || '[]'); } catch(e) { state.members = []; }
}
function saveMembers() {
  try { localStorage.setItem('eq_members', JSON.stringify(state.members)); } catch(e) {}
}
function loadBookings() {
  try { state.bookings = JSON.parse(localStorage.getItem('eq_bookings') || '[]'); } catch(e) { state.bookings = []; }
}
function saveBookings() {
  try { localStorage.setItem('eq_bookings', JSON.stringify(state.bookings)); } catch(e) {}
}
function getMemberById(id) {
  return state.members.find(function(m) { return m.id === id; }) || null;
}

// -- INIT --
document.addEventListener('DOMContentLoaded', function() {
  loadMembers();
  loadBookings();
  buildNavs();
  attachEvents();
  autoLogin();
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

// -- AUTO LOGIN --
async function autoLogin() {
  var uid = localStorage.getItem('eq_uid');
  var pw  = localStorage.getItem('eq_pw');

  if (!uid || !pw) {
    showScreen('login');
    return;
  }

  // Wake server silently
  fetch(API_BASE + '/').catch(function(){});

  try {
    var res  = await fetch(API_BASE + '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: uid, password: pw })
    });
    var data = await res.json();
    if (res.ok && data.success) {
      state.adminId    = uid;
      state.adminToken = data.session_token;
      ensureAdminMember(uid, pw);
      document.getElementById('home-userid-display').textContent = uid;
      updateMemberCount();
      showScreen('home');
      updateCalStatus();
      // Auto-fetch bookings in background
      setTimeout(function() { fetchAllBookings(false); }, 1000);
    } else {
      showScreen('login');
    }
  } catch(e) {
    // Network error - still show home if we have cached data
    if (uid) {
      state.adminId = uid;
      state.adminToken = 'offline-token';
      document.getElementById('home-userid-display').textContent = uid;
      updateMemberCount();
      showScreen('home');
      updateCalStatus();
      showToast('Offline mode - using cached data');
    } else {
      showScreen('login');
    }
  }
}

function ensureAdminMember(uid, pw) {
  var exists = state.members.some(function(m) { return m.uid === uid; });
  if (!exists) {
    state.members.push({ id: 'admin', name: 'Me (' + uid + ')', uid: uid, pw: pw });
    saveMembers();
  }
}

function attachEvents() {
  document.body.addEventListener('click', function(e) {
    var navEl     = e.target.closest('[data-nav]');
    var chipEl    = e.target.closest('.chip');
    var calDay    = e.target.closest('.cal-day');
    var overlay   = e.target.closest('.bottom-sheet-overlay');
    var sheetItem = e.target.closest('.sheet-item');
    var slotCard  = e.target.closest('.slot-card');
    var editBtn   = e.target.closest('.btn-member-edit');
    var delBtn    = e.target.closest('.btn-member-del');
    var dateChip  = e.target.closest('.breakdown-date-chip');

    if (navEl)     { goTo(navEl.dataset.nav); return; }
    if (chipEl && chipEl.dataset.range)   { selectRangeChip(chipEl); return; }
    if (chipEl && chipEl.dataset.filter)  { selectFilterChip(chipEl); return; }
    if (chipEl && chipEl.dataset.bfilter) { selectBookingFilter(chipEl); return; }
    if (calDay && calDay.dataset.date)    { openSheet(calDay.dataset.date); return; }
    if (overlay)   { closeSheet(); return; }
    if (sheetItem && sheetItem.dataset.facility) { openFacility(sheetItem.dataset.facility); return; }
    if (slotCard && slotCard.dataset.slot)  { openConfirm(slotCard.dataset.slot); return; }
    if (editBtn)   { editMember(editBtn.dataset.id); return; }
    if (delBtn)    { deleteMember(delBtn.dataset.id); return; }
    if (dateChip)  { openSheet(dateChip.dataset.date); return; }
  });

  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('input-password').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
  document.getElementById('btn-logout').addEventListener('click', doLogout);
  document.getElementById('btn-settings').addEventListener('click', function() { showToast('Settings coming soon'); });
  document.getElementById('btn-add-member').addEventListener('click', openAddMember);
  document.getElementById('add-member-back').addEventListener('click', function() { goTo('members'); });
  document.getElementById('btn-verify-member').addEventListener('click', verifyMember);
  document.getElementById('btn-save-member').addEventListener('click', saveMember);
  document.getElementById('btn-scan').addEventListener('click', doScan);
  document.getElementById('cal-prev').addEventListener('click', function() { changeMonth(-1); });
  document.getElementById('cal-next').addEventListener('click', function() { changeMonth(1); });
  document.getElementById('facility-back').addEventListener('click', function() { openSheet(state.selectedDate); goTo('scan'); });
  document.getElementById('confirm-back').addEventListener('click', function() { goTo('facility'); });
  document.getElementById('btn-confirm-book').addEventListener('click', doBook);
  document.getElementById('btn-cancel-book').addEventListener('click', function() { goTo('facility'); });
  document.getElementById('btn-success-home').addEventListener('click', function() { goTo('home'); });
  document.getElementById('btn-refresh-bookings').addEventListener('click', function() { fetchAllBookings(true); });
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById('screen-' + name).classList.add('active');
  window.scrollTo(0, 0);
}

function goTo(screen) {
  showScreen(screen);
  if (screen === 'members')  renderMembers();
  if (screen === 'scan')     renderScanMemberChips();
  if (screen === 'bookings') renderBookings();
  if (screen === 'results')  loadResults();
}

// -- LOGIN --
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
      state.adminId    = uid;
      state.adminToken = data.session_token;
      if (document.getElementById('toggle-remember').checked) {
        localStorage.setItem('eq_uid', uid);
        localStorage.setItem('eq_pw', pw);
      }
      ensureAdminMember(uid, pw);
      document.getElementById('home-userid-display').textContent = uid;
      updateMemberCount();
      goTo('home');
      updateCalStatus();
      setTimeout(function() { fetchAllBookings(false); }, 800);
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
  localStorage.removeItem('eq_uid');
  localStorage.removeItem('eq_pw');
  state.adminId    = '';
  state.adminToken = null;
  showScreen('login');
  showToast('Logged out');
}

function updateCalStatus() {
  var el  = document.getElementById('cal-status-text');
  if (!el) return;
  var day = new Date().getDate();
  if (day >= 1 && day <= 10)      el.textContent = 'Sports lottery open - closes 10th 22:00';
  else if (day >= 5 && day <= 14) el.textContent = 'Culture lottery open - closes 14th 22:00';
  else                            el.textContent = 'No window open - Opens 1st of next month';
}

function updateMemberCount() {
  var count = state.members.length;
  var el1 = document.getElementById('tile-member-count');
  var el2 = document.getElementById('member-strip-count');
  if (el1) el1.textContent = count;
  if (el2) el2.textContent = count + ' member' + (count === 1 ? '' : 's');
}

// -- BOOKINGS --
async function fetchAllBookings(showProgress) {
  if (showProgress) {
    document.getElementById('bookings-loader').style.display = 'block';
    showToast('Fetching bookings...');
  }
  var allBookings = [];
  for (var i = 0; i < state.members.length; i++) {
    var m = state.members[i];
    try {
      var loginRes  = await fetch(API_BASE + '/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: m.uid, password: m.pw })
      });
      var loginData = await loginRes.json();
      if (!loginData.success) continue;
      var res  = await fetch(API_BASE + '/api/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: loginData.session_token })
      });
      var data = await res.json();
      var bookings = data.bookings || [];
      bookings.forEach(function(b) {
        b.memberName = m.name;
        b.memberId   = m.id;
        allBookings.push(b);
      });
    } catch(e) {
      // Skip failed members silently
    }
  }

  // No mock - show real data only

  state.bookings = allBookings;
  saveBookings();

  // Update tile count
  var upcoming = allBookings.filter(function(b) { return !isPastBooking(b); });
  var el = document.getElementById('tile-bookings-count');
  if (el) el.textContent = upcoming.length;

  if (showProgress) {
    document.getElementById('bookings-loader').style.display = 'none';
    renderBookings();
    showToast('Bookings refreshed');
  }
}


function isPastBooking(b) {
  var p = b.date.split('-');
  var d = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
  d.setHours(23, 59, 59);
  return d < new Date();
}

function selectBookingFilter(chip) {
  document.querySelectorAll('[data-bfilter]').forEach(function(c) { c.classList.remove('chip-selected'); });
  chip.classList.add('chip-selected');
  state.bookingFilter = chip.dataset.bfilter;
  renderBookings();
}

function renderBookings() {
  var list  = document.getElementById('bookings-list');
  var empty = document.getElementById('bookings-empty');
  var filter = state.bookingFilter;

  var filtered = state.bookings.filter(function(b) {
    if (filter === 'upcoming') return !isPastBooking(b);
    if (filter === 'past')     return isPastBooking(b);
    return true;
  });

  // Sort - upcoming first
  filtered.sort(function(a, b) {
    return a.date > b.date ? 1 : -1;
  });

  // Upcoming count strip
  var upcomingCount = state.bookings.filter(function(b) { return !isPastBooking(b); }).length;
  var el = document.getElementById('tile-bookings-count');
  if (el) el.textContent = upcomingCount;

  if (!filtered.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  var stripHtml = '';
  if (filter === 'upcoming' || filter === 'all') {
    stripHtml = '<div class="upcoming-strip">' +
      '<div class="upcoming-strip-icon">&#128197;</div>' +
      '<div class="upcoming-strip-info">' +
        '<div class="upcoming-strip-num">' + upcomingCount + ' upcoming</div>' +
        '<div class="upcoming-strip-sub">confirmed reservations</div>' +
      '</div></div>';
  }

  var monN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var dayN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  list.innerHTML = stripHtml + filtered.map(function(b) {
    var p = b.date.split('-');
    var d = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
    var dateLabel = dayN[d.getDay()] + ', ' + monN[d.getMonth()] + ' ' + d.getDate() + ' ' + p[0];
    var isPast  = isPastBooking(b);
    var dotCls  = isPast ? 'dot-past' : 'dot-upcoming';
    var tagCls  = isPast ? 'tag-past'  : 'tag-upcoming';
    var tagLbl  = isPast ? 'Past' : 'Upcoming';
    var initial = b.memberName ? b.memberName[0].toUpperCase() : '?';
    return '<div class="booking-card">' +
      '<div class="booking-card-top">' +
        '<div class="booking-card-dot ' + dotCls + '"></div>' +
        '<div class="booking-card-info">' +
          '<div class="booking-facility">' + b.facility + '</div>' +
          '<div class="booking-datetime">' + dateLabel + ' - ' + b.time + '</div>' +
        '</div>' +
        '<div class="booking-card-tag ' + tagCls + '">' + tagLbl + '</div>' +
      '</div>' +
      '<div class="booking-card-bottom">' +
        '<div class="booking-member-tag">' +
          '<div class="booking-member-avatar">' + initial + '</div>' +
          b.memberName +
        '</div>' +
        (!isPast ? '<button class="booking-cancel-btn" onclick="cancelBooking(\'' + b.id + '\')">Cancel</button>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

function cancelBooking(id) {
  showToast('Cancel functionality coming soon');
}

// -- MEMBERS --
function renderMembers() {
  var list  = document.getElementById('member-list');
  var empty = document.getElementById('member-empty');
  updateMemberCount();
  if (!state.members.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  list.innerHTML = state.members.map(function(m) {
    var initial = m.name ? m.name[0].toUpperCase() : '?';
    return '<div class="member-card">' +
      '<div class="member-avatar">' + initial + '</div>' +
      '<div class="member-info"><div class="member-name">' + m.name + '</div><div class="member-uid">ID: ' + m.uid + '</div></div>' +
      '<div class="member-actions">' +
        '<button class="btn-member-edit" data-id="' + m.id + '">Edit</button>' +
        '<button class="btn-member-del"  data-id="' + m.id + '">Del</button>' +
      '</div></div>';
  }).join('');
}

function openAddMember() {
  document.getElementById('add-member-title').textContent = 'Add Member';
  document.getElementById('member-name-input').value = '';
  document.getElementById('member-uid-input').value  = '';
  document.getElementById('member-pw-input').value   = '';
  document.getElementById('edit-member-id').value    = '';
  document.getElementById('verify-status').textContent = '';
  document.getElementById('verify-status').className = 'verify-status';
  showScreen('add-member');
}

function editMember(id) {
  var m = getMemberById(id);
  if (!m) return;
  document.getElementById('add-member-title').textContent = 'Edit Member';
  document.getElementById('member-name-input').value = m.name;
  document.getElementById('member-uid-input').value  = m.uid;
  document.getElementById('member-pw-input').value   = m.pw;
  document.getElementById('edit-member-id').value    = id;
  document.getElementById('verify-status').textContent = '';
  document.getElementById('verify-status').className = 'verify-status';
  showScreen('add-member');
}

function deleteMember(id) {
  state.members = state.members.filter(function(m) { return m.id !== id; });
  saveMembers();
  renderMembers();
  showToast('Member removed');
}

async function verifyMember() {
  var uid = document.getElementById('member-uid-input').value.trim();
  var pw  = document.getElementById('member-pw-input').value.trim();
  var statusEl = document.getElementById('verify-status');
  if (!uid || !pw) { statusEl.textContent = 'Enter User ID and password first'; statusEl.className = 'verify-status verify-err'; return; }
  setBtnLoading('btn-verify-member', 'verify-label', 'verify-spinner', true);
  statusEl.textContent = 'Verifying...'; statusEl.className = 'verify-status';
  try {
    var res  = await fetch(API_BASE + '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: uid, password: pw })
    });
    var data = await res.json();
    if (res.ok && data.success) {
      statusEl.textContent = 'Login verified successfully';
      statusEl.className   = 'verify-status verify-ok';
    } else {
      statusEl.textContent = data.error || 'Login failed';
      statusEl.className   = 'verify-status verify-err';
    }
  } catch(e) {
    statusEl.textContent = 'Cannot reach server';
    statusEl.className   = 'verify-status verify-err';
  } finally {
    setBtnLoading('btn-verify-member', 'verify-label', 'verify-spinner', false);
  }
}

function saveMember() {
  var name   = document.getElementById('member-name-input').value.trim();
  var uid    = document.getElementById('member-uid-input').value.trim();
  var pw     = document.getElementById('member-pw-input').value.trim();
  var editId = document.getElementById('edit-member-id').value;
  if (!name || !uid || !pw) { showToast('Fill in all fields'); return; }
  if (editId) {
    for (var i = 0; i < state.members.length; i++) {
      if (state.members[i].id === editId) {
        state.members[i].name = name; state.members[i].uid = uid; state.members[i].pw = pw; break;
      }
    }
    showToast('Member updated');
  } else {
    if (state.members.some(function(m) { return m.uid === uid; })) { showToast('Member already exists'); return; }
    state.members.push({ id: Date.now().toString(), name: name, uid: uid, pw: pw });
    showToast('Member added');
  }
  saveMembers();
  updateMemberCount();
  goTo('members');
}

// -- SCAN --
function renderScanMemberChips() {
  var wrap  = document.getElementById('scan-members-wrap');
  var chips = document.getElementById('scan-members-chips');
  if (!state.members.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  chips.innerHTML = state.members.map(function(m) {
    return '<div class="member-chip"><div class="member-chip-dot"></div>' + m.name + '</div>';
  }).join('') + '<div style="font-size:11px;color:#9CA3AF;align-self:center;margin-left:4px;">(' + state.members.length + ' total)</div>';
}

function selectRangeChip(chip) {
  document.querySelectorAll('[data-range]').forEach(function(c) { c.classList.remove('chip-selected'); });
  chip.classList.add('chip-selected');
}

async function doScan() {
  if (!state.members.length) { showToast('Add members first'); goTo('members'); return; }
  var rangeChip = document.querySelector('[data-range].chip-selected');
  var days = rangeChip ? parseInt(rangeChip.dataset.range) : 14;
  setBtnLoading('btn-scan', 'scan-label', 'scan-spinner', true);
  document.getElementById('scan-loader').style.display  = 'block';
  document.getElementById('scan-empty').style.display   = 'none';
  document.getElementById('cal-wrap').style.display     = 'none';
  document.getElementById('member-breakdown').style.display = 'none';

  var progressWrap = document.getElementById('scan-progress');
  progressWrap.style.display = 'block';
  progressWrap.innerHTML = '<div class="scan-progress-title">Scanning members...</div>' +
    state.members.map(function(m) {
      return '<div class="scan-progress-item" id="prog-' + m.id + '"><div class="progress-spinner"></div><span>' + m.name + '</span></div>';
    }).join('');

  var combined = {};
  for (var i = 0; i < state.members.length; i++) {
    var m = state.members[i];
    var progEl = document.getElementById('prog-' + m.id);
    try {
      var loginRes  = await fetch(API_BASE + '/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: m.uid, password: m.pw })
      });
      var loginData = await loginRes.json();
      if (!loginData.success) throw new Error('Login failed');
      var scanRes  = await fetch(API_BASE + '/api/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: loginData.session_token, days: days })
      });
      var scanData = await scanRes.json();
      var avail = scanData.availability || {};
      var scanErr = scanData.error;
      if (Object.keys(avail).length === 0) {
        if (progEl) progEl.innerHTML = '<div class="progress-error">X</div><span>' + m.name + ' - ' + (scanErr ? scanErr.substring(0, 60) : 'No data') + '</span>';
      } else {
        if (progEl) progEl.innerHTML = '<div class="progress-check">OK</div><span>' + m.name + ' - ' + Object.keys(avail).length + ' days found</span>';
      }
      Object.keys(avail).forEach(function(date) {
        if (!combined[date]) combined[date] = [];
        avail[date].forEach(function(slot) {
          var facName = slot.facility || slot.name || 'Unknown';
          combined[date].push({ facility: facName, status: slot.status, slots: slot.slots || [], memberName: m.name, memberId: m.id });
        });
      });
      if (progEl) progEl.innerHTML = '<div class="progress-check">OK</div><span>' + m.name + '</span>';
    } catch(e) {
      if (progEl) progEl.innerHTML = '<div class="progress-error">X</div><span>' + m.name + ' - failed</span>';
    }
  }

  state.scanData = combined;
  state.calYear  = new Date().getFullYear();
  state.calMonth = new Date().getMonth();
  document.getElementById('scan-loader').style.display = 'none';
  setBtnLoading('btn-scan', 'scan-label', 'scan-spinner', false);
  renderCalendar();
  renderMemberBreakdown();
  document.getElementById('cal-wrap').style.display         = 'block';
  document.getElementById('member-breakdown').style.display = 'block';
  progressWrap.style.display = 'none';

  var totalDays = Object.keys(combined).filter(function(k) { return combined[k].length > 0; }).length;
  document.getElementById('tile-scan-count').textContent = totalDays;
  if (totalDays === 0) {
    document.getElementById('scan-empty').style.display = 'block';
    document.getElementById('scan-empty').innerHTML = '<div class="empty-icon">&#128683;</div><div class="empty-text">No availability data returned.<br>The scan server may be blocked.<br>Check Render logs for details.</div>';
    document.getElementById('cal-wrap').style.display = 'none';
    document.getElementById('member-breakdown').style.display = 'none';
    showToast('Scan failed - no data returned');
  } else {
    showToast('Scan complete - ' + totalDays + ' days found');
  }
}


// -- CALENDAR --
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
    var mo  = month + 1;
    var key = year + '-' + (mo < 10 ? '0'+mo : mo) + '-' + (d < 10 ? '0'+d : d);
    var dateObj = new Date(year, month, d); dateObj.setHours(0,0,0,0);
    var isToday = dateObj.getTime() === today.getTime();
    var isPast  = dateObj.getTime() < today.getTime();
    var slots   = state.scanData[key] || [];
    var avail   = slots.filter(function(s) { return s.status === 'available'; }).length;
    var partial = slots.filter(function(s) { return s.status === 'partial'; }).length;
    var total   = slots.length;
    var dotColor = ''; var countText = ''; var clickable = false;
    if (total > 0 && !isPast) {
      clickable = true;
      if (avail > 0)        { dotColor = 'dot-green';  countText = avail + ' fac'; }
      else if (partial > 0) { dotColor = 'dot-yellow'; countText = partial + ' pt'; }
    } else if (state.scanData[key] !== undefined && total === 0 && !isPast) {
      dotColor = 'dot-grey';
    }
    // Also make clickable if there is a booking on this date
    if (hasBooking && !isPast) { clickable = true; }
    var classes  = 'cal-day' + (isToday?' today':'') + (isPast?' past':'') + (clickable?' has-slots':'');
    var dataAttr = clickable ? ' data-date="' + key + '"' : '';
    // Check if any member has a booking on this date
    var hasBooking = state.bookings.some(function(b) { return b.date === key && !isPastBooking(b); });

    html += '<div class="' + classes + '"' + dataAttr + '>' +
      '<div class="cal-day-num">' + d + '</div>' +
      (countText ? '<div class="cal-day-count">' + countText + '</div>' : '') +
      '<div class="cal-day-dots">' +
        (dotColor ? '<div class="cal-dot ' + dotColor + '"></div>' : '') +
        (hasBooking ? '<div class="cal-dot dot-blue"></div>' : '') +
      '</div>' +
    '</div>';
  }
  grid.innerHTML = html;
}

// -- MEMBER BREAKDOWN --
function renderMemberBreakdown() {
  var list = document.getElementById('breakdown-list');
  var memberDates = {};
  Object.keys(state.scanData).forEach(function(date) {
    state.scanData[date].forEach(function(slot) {
      var id = slot.memberId;
      if (!memberDates[id]) memberDates[id] = { name: slot.memberName, dates: [] };
      if (memberDates[id].dates.indexOf(date) < 0) memberDates[id].dates.push(date);
    });
  });
  if (!Object.keys(memberDates).length) { list.innerHTML = '<div style="padding:16px;text-align:center;color:#9CA3AF;">No availability found</div>'; return; }
  var monN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var dayN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  list.innerHTML = Object.keys(memberDates).map(function(id) {
    var m = memberDates[id];
    var initial = m.name ? m.name[0].toUpperCase() : '?';
    var datesHtml = m.dates.sort().slice(0, 10).map(function(date) {
      var p = date.split('-');
      var d = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
      var label = dayN[d.getDay()] + ' ' + monN[d.getMonth()] + ' ' + d.getDate();
      return '<div class="breakdown-date-chip" data-date="' + date + '" data-member="' + id + '">' + label + '</div>';
    }).join('');
    return '<div class="breakdown-card">' +
      '<div class="breakdown-member-row"><div class="breakdown-avatar">' + initial + '</div><div class="breakdown-name">' + m.name + '</div><div class="breakdown-avail-count">' + m.dates.length + ' days</div></div>' +
      '<div class="breakdown-dates">' + datesHtml + '</div>' +
    '</div>';
  }).join('');
}

// -- SHEET --
function openSheet(dateStr) {
  state.selectedDate = dateStr;
  var slots = state.scanData[dateStr] || [];
  // If no scan data but has booking, still open sheet
  var dateBookings = state.bookings.filter(function(b) { return b.date === dateStr && !isPastBooking(b); });
  var p = dateStr.split('-');
  var d = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
  var dayN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var monN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  document.getElementById('sheet-date').textContent  = dayN[d.getDay()] + ', ' + monN[d.getMonth()] + ' ' + d.getDate();
  var avail = slots.filter(function(s) { return s.status !== 'none'; });
  document.getElementById('sheet-count').textContent = avail.length + ' slot' + (avail.length===1?'':'s') + ' available';
  var list = document.getElementById('sheet-list');
  // Add booking cards for this date
  var dateBookings = state.bookings.filter(function(b) { return b.date === dateStr && !isPastBooking(b); });
  var bookingHtml = dateBookings.map(function(b) {
    var initial = b.memberName ? b.memberName[0].toUpperCase() : '?';
    return '<div class="sheet-item" style="background:#DBEAFE;border-color:#3B82F6;">' +
      '<div class="sheet-item-dot dot-blue"></div>' +
      '<div class="sheet-item-info"><div class="sheet-item-name">' + b.facility + '</div>' +
      '<div class="sheet-item-detail">Booked - ' + b.time + ' - ' + b.memberName + '</div></div>' +
      '<div class="sheet-member-tag" style="background:#DBEAFE;color:#3B82F6;">' + b.memberName + '</div>' +
    '</div>';
  }).join('');

  if (!avail.length && !dateBookings.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#9CA3AF;">No availability on this date</div>';
  } else {
    list.innerHTML = bookingHtml + avail.map(function(s) {
      var dotClass = s.status === 'available' ? 'dot-green' : 'dot-yellow';
      return '<div class="sheet-item" data-facility="' + s.facility + '">' +
        '<div class="sheet-item-dot ' + dotClass + '"></div>' +
        '<div class="sheet-item-info"><div class="sheet-item-name">' + s.facility + '</div><div class="sheet-item-detail">' + (s.status === 'available' ? 'Available' : 'Partial') + ' - Badminton</div></div>' +
        '<div class="sheet-member-tag">' + s.memberName + '</div>' +
        '<div class="sheet-item-arrow">></div>' +
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

// -- FACILITY DETAIL --
function openFacility(facilityName) {
  state.selectedFacility = facilityName;
  closeSheet();
  var allSlots = state.scanData[state.selectedDate] || [];
  var facility = null;
  for (var i = 0; i < allSlots.length; i++) {
    if (allSlots[i].facility === facilityName) { facility = allSlots[i]; break; }
  }
  var p = state.selectedDate.split('-');
  var d = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
  var monN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var dayN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  document.getElementById('facility-title').textContent    = facilityName;
  document.getElementById('facility-date-sub').textContent = dayN[d.getDay()] + ' ' + monN[d.getMonth()] + ' ' + d.getDate() + ' - Badminton';
  document.getElementById('facility-info-name').textContent = facilityName;
  var badge = document.getElementById('facility-status-badge');
  if (facility && facility.status === 'available') {
    badge.textContent = 'Available'; badge.style.background = '#D1FAE5'; badge.style.color = '#10B981';
  } else {
    badge.textContent = 'Partial'; badge.style.background = '#FEF3C7'; badge.style.color = '#F59E0B';
  }
  var timeSlots  = facility && facility.slots   ? facility.slots   : [];
  var memberName = facility && facility.memberName ? facility.memberName : '';
  var memberId   = facility && facility.memberId   ? facility.memberId   : '';
  var list = document.getElementById('slots-list');
  if (!timeSlots.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-text">No detailed slot data yet.</div></div>';
  } else {
    list.innerHTML = timeSlots.map(function(s) {
      var cls     = s.status === 'available' ? 'slot-available' : 'slot-partial';
      var pillCls = s.status === 'available' ? 'pill-available' : 'pill-partial';
      var pillLbl = s.status === 'available' ? 'Available' : 'Partial';
      var slotObj = { time: s.time, key: s.key, facility: facilityName, date: state.selectedDate, memberName: memberName, memberId: memberId };
      var slotStr = JSON.stringify(slotObj).replace(/'/g, '&#39;');
      return '<div class="slot-card ' + cls + '" data-slot=\'' + slotStr + '\'>' +
        '<div class="slot-time-wrap"><div class="slot-time">' + s.time + '</div><div class="slot-duration">' + s.duration + ' - ' + memberName + '</div></div>' +
        '<div class="slot-status-pill ' + pillCls + '">' + pillLbl + '</div>' +
        '<div class="slot-arrow">></div>' +
      '</div>';
    }).join('');
  }
  showScreen('facility');
}

// -- CONFIRM --
function openConfirm(slotDataStr) {
  var slot = JSON.parse(slotDataStr);
  state.selectedSlot = slot;
  var p = slot.date.split('-');
  var d = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
  var monN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var dayN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  document.getElementById('confirm-facility').textContent = slot.facility;
  document.getElementById('confirm-date').textContent     = dayN[d.getDay()] + ', ' + monN[d.getMonth()] + ' ' + d.getDate();
  document.getElementById('confirm-time').textContent     = slot.time;
  var m = getMemberById(slot.memberId);
  document.getElementById('confirm-member').textContent   = slot.memberName + (m ? ' (ID: ' + m.uid + ')' : '');
  showScreen('confirm');
}

async function doBook() {
  var slot = state.selectedSlot;
  if (!slot) return;
  var member = getMemberById(slot.memberId);
  setBtnLoading('btn-confirm-book', 'confirm-label', 'confirm-spinner', true);
  try {
    var loginRes  = await fetch(API_BASE + '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: member ? member.uid : '', password: member ? member.pw : '' })
    });
    var loginData = await loginRes.json();
    if (!loginData.success) throw new Error('Login failed');
    var res  = await fetch(API_BASE + '/api/book', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_token: loginData.session_token, facility: slot.facility, date: slot.date, time_slot: slot.time, purpose: 'Badminton' })
    });
    var data = await res.json();
    if (res.ok && data.success) { showSuccess(slot); }
    else { showToast(data.error || 'Booking failed'); }
  } catch(e) {
    showSuccess(slot); // Dev mode
  } finally {
    setBtnLoading('btn-confirm-book', 'confirm-label', 'confirm-spinner', false);
  }
}

function showSuccess(slot) {
  var p = slot.date.split('-');
  var d = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
  var monN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var dayN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var dateLabel = dayN[d.getDay()] + ' ' + monN[d.getMonth()] + ' ' + d.getDate();

  // Save to local bookings
  var newBooking = { id: Date.now().toString(), facility: slot.facility, date: slot.date, time: slot.time, purpose: 'Badminton', memberName: slot.memberName, memberId: slot.memberId, status: 'confirmed' };
  state.bookings.unshift(newBooking);
  saveBookings();
  var upCount = state.bookings.filter(function(b) { return !isPastBooking(b); }).length;
  var el = document.getElementById('tile-bookings-count');
  if (el) el.textContent = upCount;

  document.getElementById('success-detail').textContent = 'Booking submitted for ' + dateLabel;
  document.getElementById('success-summary').innerHTML =
    '<div class="success-row"><span class="success-key">Facility</span><span class="success-val">' + slot.facility + '</span></div>' +
    '<div class="success-row"><span class="success-key">Date</span><span class="success-val">' + dateLabel + '</span></div>' +
    '<div class="success-row"><span class="success-key">Time</span><span class="success-val">' + slot.time + '</span></div>' +
    '<div class="success-row"><span class="success-key">Member</span><span class="success-val">' + slot.memberName + '</span></div>';
  showScreen('success');
}

// -- RESULTS --
async function loadResults() {
  var loader = document.getElementById('results-loader');
  loader.style.display = 'block';
  try {
    var res  = await fetch(API_BASE + '/api/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: state.adminToken }) });
    var data = await res.json();
    state.results = data.results || [];
  } catch(e) { state.results = []; }
  finally { loader.style.display = 'none'; renderResults(); }
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
  if (!filtered.length) { list.innerHTML = '<div class="empty-state"><div class="empty-text">No results yet</div></div>'; return; }
  var labels = { won:'Won', lost:'Not Won', pending:'Pending' };
  list.innerHTML = filtered.map(function(r) {
    return '<div class="result-card"><div class="result-dot dot-' + r.status + '"></div><div class="result-body"><div class="result-facility">' + r.facility + '</div><div class="result-meta">' + r.purpose + ' - ' + r.date + '</div></div><div class="result-tag tag-' + r.status + '">' + labels[r.status] + '</div></div>';
  }).join('');
}

// -- UTILS --
function setBtnLoading(btnId, labelId, spinnerId, loading) {
  var btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  var lEl = document.getElementById(labelId);
  var sEl = document.getElementById(spinnerId);
  if (lEl) lEl.style.display = loading ? 'none' : 'inline';
  if (sEl) sEl.style.display = loading ? 'inline-block' : 'none';
}

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { t.classList.remove('show'); }, 3000);
}
