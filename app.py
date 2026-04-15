import os, uuid, json, requests, re
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
sessions = {}

BASE         = 'https://www.shisetsuyoyaku.city.edogawa.tokyo.jp/user'
LOGIN_URL    = BASE + '/Login/Login'
SEARCH_URL   = BASE + '/AvailabilityCheckApplySelectDays/SearchCondition'
AFTER_URL    = BASE + '/AvailabilityCheckApplySelectDays/AfterPeriod'

FACILITIES = {
    '2':'Ichinoe Community Hall','3':'Community Plaza Ichinoe',
    '4':'Matsue Kumin Plaza','5':'Matsushima Community Hall',
    '63':'Bunka Sports Plaza','8':'Komatsugawa Sakura Hall',
    '9':'Hirai Community Hall','10':'Nakahirai Community Hall',
    '13':'Kitakasai Community Hall','14':'Ninoe Community Hall',
    '18':'Rinkaichou Community Hall','19':'Higashikasai Community Hall',
    '20':'Nagashima Kuwagawa Community Hall','24':'Nishikoiwa Community Hall',
    '25':'Kitakoiwa Community Hall','26':'Minamikoiwa Community Hall',
    '33':'Shinozaki Community Hall',
}

STATUS_MAP = {
    'vacant':'available','circle':'available','some':'partial',
    'full':'full','time-over':'closed','lottery':'lottery','lot':'lottery',
}

AJAX_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'ja,en;q=0.9',
    'X-Requested-With': 'XMLHttpRequest',
}

def parse_body():
    try:
        return json.loads(request.data.decode('utf-8'))
    except:
        return {}

def get_session(token):
    return sessions.get(token) if token else None

def get_csrf(html):
    m = re.search(r'__RequestVerificationToken.*?value="([^"]+)"', html)
    return m.group(1) if m else None

def do_login(user_id, password):
    s = requests.Session()
    # Get login page for CSRF
    s.headers.update({'User-Agent': AJAX_HEADERS['User-Agent'], 'Accept': 'text/html,*/*', 'Accept-Language': 'ja,en;q=0.9'})
    resp = s.get(BASE + '/Login', timeout=20)
    csrf = get_csrf(resp.text)
    if not csrf:
        return None, None, f'Login page blocked: {resp.status_code} {resp.headers.get("x-deny-reason","")}'

    s.headers.update(AJAX_HEADERS)
    s.headers['Referer'] = BASE + '/Login'
    resp = s.post(LOGIN_URL, data={
        'UserLoginInputModel.Id': user_id,
        'UserLoginInputModel.Password': password,
        '__RequestVerificationToken': csrf,
    }, timeout=20)

    try:
        result = json.loads(resp.text.strip())
        if isinstance(result, str): result = json.loads(result)
    except:
        return None, None, 'Parse error: ' + resp.text[:100]

    if result.get('Result') != 'Ok':
        info = result.get('Information', 'Login failed')
        if isinstance(info, list): info = ' '.join(str(i) for i in info)
        return None, None, str(info)

    # After login, get a fresh CSRF from home page
    s.headers['Accept'] = 'text/html,*/*'
    s.headers.pop('X-Requested-With', None)
    home = s.get(BASE + '/Home', timeout=20)
    home_csrf = get_csrf(home.text)

    return s, home_csrf, None

def parse_json_avail(data):
    """Parse AfterPeriod/SearchCondition JSON response"""
    result = {}
    if not isinstance(data, list):
        return result
    for fac_group in data:
        if not isinstance(fac_group, dict):
            continue
        fac_id   = str(fac_group.get('FacilityCode', ''))
        fac_name = FACILITIES.get(fac_id, f'Facility {fac_id}')
        for row in fac_group.get('Rows', []):
            for cell in row.get('Cells', []):
                status    = cell.get('Status', '')
                use_date  = str(cell.get('UseDate', ''))[:10]
                status_n  = STATUS_MAP.get(status, 'unknown')
                if use_date and status_n in ('available', 'partial', 'lottery'):
                    if use_date not in result:
                        result[use_date] = []
                    if not any(x['facility'] == fac_name for x in result[use_date]):
                        result[use_date].append({
                            'facility': fac_name, 'facility_id': fac_id,
                            'status': status_n, 'slots': [],
                        })
    return result

def do_scan(s, csrf, days=14):
    availability = {}
    debug = []

    # Build SearchCondition payload ? same fields seen in page source
    # Facility IDs as selected checkboxes
    fac_ids = list(FACILITIES.keys())
    payload = {
        '__RequestVerificationToken': csrf or '',
        'SearchCondition.DisplayTerm':     '3',  # 2 weeks
        'SearchCondition.DisplayCalendar': '0',
        'SearchCondition.TimeZone':        '2147483647',  # all day
    }
    # Add all facilities as selected
    for i, fid in enumerate(fac_ids):
        payload[f'SelectFacilities.Facilities[{i}].SelectedFacility.Value']    = fid
        payload[f'SelectFacilities.Facilities[{i}].SelectedFacility.Selected'] = 'true'

    s.headers.update(AJAX_HEADERS)
    s.headers['Referer'] = BASE + '/AvailabilityCheckApplySelectDays'

    # Try SearchCondition first
    try:
        resp = s.post(SEARCH_URL, data=payload, timeout=30)
        debug.append(f'SearchCondition: {resp.status_code} deny={resp.headers.get("x-deny-reason","")} len={len(resp.text)}')

        if resp.status_code == 200 and not resp.headers.get('x-deny-reason'):
            try:
                data = resp.json()
                debug.append(f'SearchCondition JSON type: {type(data).__name__} len={len(data) if isinstance(data,list) else "?"}')
                # Response is [result, AvailabilityDays, html1, html2] per JS source
                avail_data = None
                if isinstance(data, list):
                    if len(data) > 1:
                        avail_data = data[1]  # index 1 = AvailabilityDays
                    elif len(data) == 1 and isinstance(data[0], dict) and data[0].get('Result') == 'Error':
                        debug.append(f'Server error: {data[0].get("Information","")}')
                if avail_data:
                    parsed = parse_json_avail(avail_data)
                    debug.append(f'Parsed {len(parsed)} dates from SearchCondition')
                    availability.update(parsed)
            except Exception as e:
                debug.append(f'SearchCondition parse error: {e} preview={resp.text[:200]}')
        else:
            debug.append(f'SearchCondition blocked or failed')
    except Exception as e:
        debug.append(f'SearchCondition exception: {e}')

    # If we got data, try AfterPeriod for more weeks
    weeks_extra = max(0, days // 7 - 1)
    for w in range(weeks_extra):
        try:
            resp2 = s.post(AFTER_URL, data={'__RequestVerificationToken': csrf or ''}, timeout=20)
            debug.append(f'AfterPeriod {w+1}: {resp2.status_code} deny={resp2.headers.get("x-deny-reason","")}')
            if resp2.status_code == 200 and not resp2.headers.get('x-deny-reason'):
                data2 = resp2.json()
                avail2 = data2[0] if isinstance(data2, list) and data2 else None
                if avail2:
                    parsed2 = parse_json_avail(avail2)
                    debug.append(f'AfterPeriod {w+1}: {len(parsed2)} dates')
                    for d, facs in parsed2.items():
                        if d not in availability:
                            availability[d] = []
                        for f in facs:
                            if not any(x['facility'] == f['facility'] for x in availability[d]):
                                availability[d].append(f)
        except Exception as e:
            debug.append(f'AfterPeriod {w+1} error: {e}')

    return availability, debug

@app.route('/', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'edonet-quick v5 ajax'})

@app.route('/api/login', methods=['POST'])
def api_login():
    data = parse_body()
    uid  = str(data.get('user_id') or '').strip()
    pw   = str(data.get('password') or '').strip()
    if not uid or not pw:
        return jsonify({'success': False, 'error': 'Required'}), 400
    try:
        s, csrf, error = do_login(uid, pw)
        if s:
            token = str(uuid.uuid4())
            sessions[token] = {'user_id': uid, 'password': pw}
            return jsonify({'success': True, 'session_token': token})
        return jsonify({'success': False, 'error': error}), 401
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/scan', methods=['POST'])
def api_scan():
    data    = parse_body()
    session = get_session(data.get('session_token'))
    if not session:
        return jsonify({'error': 'Invalid session'}), 401
    days = int(data.get('days', 14))
    try:
        s, csrf, error = do_login(session['user_id'], session['password'])
        if not s:
            return jsonify({'availability': {}, 'error': error, 'debug': [error]})
        availability, debug = do_scan(s, csrf, days)
        total = sum(len(v) for v in availability.values())
        return jsonify({
            'availability': availability,
            'real_data': total > 0,
            'error': None if total > 0 else 'No data ? AJAX endpoints may also be blocked',
            'debug': debug,
            'count': total,
        })
    except Exception as e:
        return jsonify({'availability': {}, 'error': str(e), 'debug': [str(e)]})

@app.route('/api/bookings', methods=['POST'])
def api_bookings():
    data    = parse_body()
    session = get_session(data.get('session_token'))
    if not session:
        return jsonify({'error': 'Invalid session'}), 401
    return jsonify({'bookings': []})

@app.route('/api/book', methods=['POST'])
def api_book():
    data    = parse_body()
    session = get_session(data.get('session_token'))
    if not session:
        return jsonify({'error': 'Invalid session'}), 401
    return jsonify({'success': False, 'message': 'Coming soon'})

@app.route('/api/results', methods=['POST'])
def api_results():
    data    = parse_body()
    session = get_session(data.get('session_token'))
    if not session:
        return jsonify({'error': 'Invalid session'}), 401
    return jsonify({'results': []})


@app.route('/api/probe', methods=['POST'])
def api_probe():
    data = parse_body()
    uid  = str(data.get('user_id') or '').strip()
    pw   = str(data.get('password') or '').strip()
    if not uid or not pw:
        return jsonify({'error': 'Need user_id and password'}), 400

    results = {}
    s = requests.Session()
    s.headers.update({
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept-Language': 'ja,en;q=0.9',
    })

    # Step 1: Get login page
    s.headers['Accept'] = 'text/html,*/*'
    r = s.get(BASE + '/Login', timeout=20)
    results['login_page'] = {'status': r.status_code, 'deny': r.headers.get('x-deny-reason',''), 'has_csrf': bool(get_csrf(r.text))}
    csrf = get_csrf(r.text)

    if not csrf:
        return jsonify({'error': 'Login page blocked', 'results': results})

    # Step 2: Login
    s.headers['X-Requested-With'] = 'XMLHttpRequest'
    s.headers['Accept'] = 'application/json, */*'
    r = s.post(LOGIN_URL, data={
        'UserLoginInputModel.Id': uid,
        'UserLoginInputModel.Password': pw,
        '__RequestVerificationToken': csrf,
    }, timeout=20)
    results['login_post'] = {'status': r.status_code, 'deny': r.headers.get('x-deny-reason',''), 'response': r.text[:100]}
    cookies = dict(s.cookies)
    results['cookies'] = list(cookies.keys())

    try:
        login_result = json.loads(r.text)
        if isinstance(login_result, str): login_result = json.loads(login_result)
        results['login_result'] = login_result.get('Result')
        if login_result.get('Result') != 'Ok':
            return jsonify({'error': 'Login failed', 'results': results})
    except:
        return jsonify({'error': 'Parse failed', 'results': results})

    # Step 3: Try every AJAX path with the logged-in session
    test_paths = [
        ('GET',  '/Home'),
        ('GET',  '/AvailabilityCheckApplySelectFacility'),
        ('POST', '/AvailabilityCheckApplySelectFacility/Next'),
        ('POST', '/AvailabilityCheckApplySelectDays/SearchCondition'),
        ('POST', '/AvailabilityCheckApplySelectDays/AfterPeriod'),
        ('POST', '/AvailabilityCheckApplySelectDays/GetAvailability'),
    ]
    for method, path in test_paths:
        try:
            if method == 'GET':
                s.headers['Accept'] = 'text/html,*/*'
                s.headers.pop('X-Requested-With', None)
                r = s.get(BASE + path, timeout=15)
            else:
                s.headers['X-Requested-With'] = 'XMLHttpRequest'
                s.headers['Accept'] = 'application/json, */*'
                r = s.post(BASE + path, data={'__RequestVerificationToken': csrf}, timeout=15)
            deny = r.headers.get('x-deny-reason', '')
            results[path] = {
                'status': r.status_code,
                'deny': deny,
                'len': len(r.text),
                'preview': r.text[:100] if not deny else '',
            }
        except Exception as e:
            results[path] = {'error': str(e)}

    return jsonify(results)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
