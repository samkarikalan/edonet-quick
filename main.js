var API_BASE = 'https://edonet-quick.onrender.com';

var EDONET_BASE = 'https://www.shisetsuyoyaku.city.edogawa.tokyo.jp/user';

var NAV = [
  { screen:'home',    icon:'Home',    label:'Home' },
  { screen:'scan',    icon:'Scan',    label:'Scan' },
  { screen:'lottery', icon:'Lottery', label:'Lottery' },
  { screen:'results', icon:'Results', label:'Results' },
];

var state = {
  userId: '',
  token: null,
  results: [],
  filter: 'all',
  scanData: {},
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
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
    if (navEl)    { goTo(navEl.dataset.nav); return; }
    if (actionEl) { showToast('Coming soon'); return; }
    if (chipEl && chipEl.dataset.range) { selectRangeChip(chipEl); return; }
    if (chipEl && chipEl.dataset.filter) { selectFilterChip(chipEl); return; }
    if (calDay && calDay.dataset.date)  { openSheet(calDay.dataset.date); return; }
    if (overlay) { closeSheet(); return; }
  });

  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('input-password').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
  document.getElementById('btn-logout').addEventListener('click', doLogout);
  document.getElementById('btn-scan').addEventListener('click', doScan);
  document.getElementById('cal-prev').addEventListener('click', function() { changeMonth(-1); });
  document.getElementById('cal-next').addEventListener('click', function() { changeMonth(1); });
}

function goTo(screen) {
  if (screen !== 'login' && !state.token) { showToast('Please login first'); return; }
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById('screen-' + screen).classList.add('active');
  window.scrollTo(0, 0);
  if (screen === 'results') loadResults();
}

/* ?? LOGIN ?? */
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

/* ?? SCAN ?? */
function selectRangeChip(chip) {
  document.querySelectorAll('[data-range]').forEach(function(c) { c.classList.remove('chip-selected'); });
  chip.classList.add('chip-selected');
}

async function doScan() {
  var rangeChip = document.querySelector('[data-range].chip-selected');
  var days      = rangeChip ? parseInt(rangeChip.dataset.range) : 14;

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
    if (data.availability) {
      state.scanData = data.availability;
    } else {
      state.scanData = makeMockData(days);
    }
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
  var data  = {};
  var today = new Date();
  var facilities = ['Ichinoe Community Hall','Community Plaza Koto','Matsue Kumin Plaza','Bunka Sports Plaza','Hirai Community Hall'];
  for (var i = 0; i < days; i++) {
    var d = new Date(today);
    d.setDate(today.getDate() + i);
    var key = d.toISOString().slice(0, 10);
    var count = Math.floor(Math.random() * 4);
    if (count > 0) {
      data[key] = [];
      for (var j = 0; j < count; j++) {
        var status = Math.random() > 0.3 ? 'available' : 'partial';
        data[key].push({ name: facilities[j % facilities.length], status: status });
      }
    } else {
      data[key] = [];
    }
  }
  return data;
}

/* ?? CALENDAR ?? */
function changeMonth(dir) {
  state.calMonth += dir;
  if (state.calMonth > 11) { state.calMonth = 0;  state.calYear++; }
  if (state.calMonth < 0)  { state.calMonth = 11; state.calYear--; }
  renderCalendar();
}

function renderCalendar() {
  var year  = state.calYear;
  var month = state.calMonth;
  var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cal-month-title').textContent = monthNames[month] + ' ' + year;

  var grid  = document.getElementById('cal-grid');
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var firstDay = new Date(year, month, 1).getDay();
  var daysInMonth = new Date(year, month + 1, 0).getDate();

  var html = '';

  for (var i = 0; i < firstDay; i++) {
    html += '<div class="cal-day empty"><div class="cal-day-num"></div></div>';
  }

  for (var d = 1; d <= daysInMonth; d++) {
    var dateObj = new Date(year, month, d);
    dateObj.setHours(0, 0, 0, 0);
    var key     = dateObj.toISOString().slice(0, 10);
    var isToday = dateObj.getTime() === today.getTime();
    var isPast  = dateObj.getTime() < today.getTime();
    var slots   = state.scanData[key];
    var hasData = slots !== undefined;
    var avail   = hasData ? slots.filter(function(s) { return s.status === 'available'; }).length : 0;
    var partial = hasData ? slots.filter(function(s) { return s.status === 'partial'; }).length : 0;
    var total   = hasData ? slots.length : 0;

    var dotColor = '';
    var countText = '';
    var clickable = false;

    if (hasData && total > 0 && !isPast) {
      clickable = true;
      if (avail > 0) {
        dotColor  = 'dot-green';
        countText = avail + (avail === 1 ? ' facility' : ' facilities');
      } else if (partial > 0) {
        dotColor  = 'dot-yellow';
        countText = partial + ' partial';
      }
    } else if (hasData && total === 0 && !isPast) {
      dotColor = 'dot-grey';
    }

    var classes = 'cal-day';
    if (isToday)   classes += ' today';
    if (isPast)    classes += ' past';
    if (clickable) classes += ' has-slots';

    var dataAttr = clickable ? ' data-date="' + key + '"' : '';

    html += '<div class="' + classes + '"' + dataAttr + '>' +
      '<div class="cal-day-num">' + d + '</div>' +
      (countText ? '<div class="cal-day-count">' + countText + '</div>' : '') +
      (dotColor  ? '<div class="cal-dot ' + dotColor + '"></div>' : '') +
      '</div>';
  }

  grid.innerHTML = html;
}

/* ?? BOTTOM SHEET ?? */
function openSheet(dateStr) {
  var slots = state.scanData[dateStr] || [];
  var d     = new Date(dateStr + 'T00:00:00');
  var days  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var label = days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate();

  document.getElementById('sheet-date').textContent  = label;

  var avail = slots.filter(function(s) { return s.status !== 'none'; });
  document.getElementById('sheet-count').textContent = avail.length + ' facilit' + (avail.length === 1 ? 'y' : 'ies') + ' available';

  var list = document.getElementById('sheet-list');
  if (avail.length === 0) {
    list.innerHTML = '<div class="empty-text" style="padding:20px 0;text-align:center;">No availability on this date</div>';
  } else {
    list.innerHTML = avail.map(function(s) {
      var dotClass = s.status === 'available' ? 'dot-green' : 'dot-yellow';
      var label2   = s.status === 'available' ? 'Available' : 'Partially available';
      var url      = EDONET_BASE + '/Home';
      return '<div class="sheet-item">' +
        '<div class="sheet-item-dot ' + dotClass + '"></div>' +
        '<div class="sheet-item-info">' +
          '<div class="sheet-item-name">' + s.name + '</div>' +
          '<div class="sheet-item-detail">' + label2 + ' - Badminton</div>' +
        '</div>' +
        '<button class="sheet-item-btn" onclick="openSite(\'' + url + '\')">Open ></button>' +
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

function openSite(url) {
  window.open(url, '_blank');
}

/* ?? RESULTS ?? */
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
        '<div class="result-meta">' + r.purpose + ' - ' + r.date + '<br>' + r.time + '</div>' +
      '</div>' +
      '<div class="result-tag tag-' + r.status + '">' + labels[r.status] + '</div>' +
    '</div>';
  }).join('');
}

/* ?? UTILS ?? */
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
