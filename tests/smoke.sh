#!/usr/bin/env bash
# One Mykonos — E2E smoke suite.
# Usage: ./tests/smoke.sh [BASE_URL]          (default http://localhost:4324)
#        LIGHT=1 ./tests/smoke.sh <url>       (public + booking subset, for prod)
# Reads Supabase keys from .env in the repo root for REST checks and cleanup.

set -u
BASE="${1:-http://localhost:4324}"
LIGHT="${LIGHT:-0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Account passwords live in tests/.env.tests (gitignored); see .env.tests.example
if [[ -f "$ROOT/tests/.env.tests" ]]; then source "$ROOT/tests/.env.tests"; fi
: "${SMOKE_CUSTOMER_PASSWORD:?set in tests/.env.tests}"
: "${SMOKE_OWNER_PASSWORD:?set in tests/.env.tests}"
: "${SMOKE_ADMIN_PASSWORD:?set in tests/.env.tests}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0; FAIL=0; FAILED=""
ok()   { PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); FAILED="$FAILED\n  - $1 (got: ${2:-?})"; printf '  FAIL  %s  [got: %s]\n' "$1" "${2:-?}"; }
section(){ printf '\n== %s ==\n' "$1"; }

O="Origin: $BASE"
code()  { curl -s -o /dev/null -w '%{http_code}' "$@"; }
redir() { curl -s -o /dev/null -w '%{redirect_url}' "$@"; }
body()  { curl -s "$@"; }

login() { # email pass jar -> follows to check success
  rm -f "$3"
  redir -H "$O" -c "$3" -d "email=$1&password=$2" "$BASE/api/auth/signin"
}

pyenv() { python3 -c "
import sys
env = dict(l.strip().split('=',1) for l in open('$ROOT/.env') if '=' in l)
print(env[sys.argv[1]])" "$1"; }

SUPA_URL="$(pyenv PUBLIC_SUPABASE_URL)"
ANON="$(pyenv PUBLIC_SUPABASE_ANON_KEY)"
SERVICE="$(pyenv SUPABASE_SERVICE_ROLE_KEY)"

sql_rest() { # table+query fragment via service role, returns json
  curl -s -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" "$SUPA_URL/rest/v1/$1"
}

CREATED_BOOKINGS="$TMP/bookings.txt"; : > "$CREATED_BOOKINGS"
track_booking_from_url() { echo "$1" | grep -oE '[a-f0-9-]{36}' | head -1 | tee -a "$CREATED_BOOKINGS"; }

CUSTOMER_JAR="$TMP/customer.jar"
OWNER_JAR="$TMP/owner.jar"       # Thalassa Beach Club
VILLAS_JAR="$TMP/villas.jar"     # Aegean Blue Villas
ADMIN_JAR="$TMP/admin.jar"

SUNBED_SVC="6c2be17a-34fb-4cf9-a533-a5923369ddbf"

# ---------------------------------------------------------------- A. public
section "A. Public site"
b="$(body "$BASE/")"
[[ "$b" == *"The island index"* && "$b" == *"Chosen by our concierge"* ]] && ok "A1 home renders" || bad "A1 home renders"
[[ "$(body "$BASE/c/accommodation")" == *"Aegean Blue Villas"* ]] && ok "A2 category page" || bad "A2 category page"
[[ "$(body "$BASE/c/accommodation?area=Ornos")" == *"Aegean Blue Villas"* ]] && ok "A3 area filter match" || bad "A3 area filter match"
[[ "$(body "$BASE/c/accommodation?area=Elia")" == *"No accommodation"* ]] && ok "A4 area filter empty" || bad "A4 area filter empty"
[[ "$(body "$BASE/search?q=villas")" == *"Aegean Blue Villas"* ]] && ok "A5 search text" || bad "A5 search text"
[[ "$(body "$BASE/search?q=xyzzynothing")" == *"No results"* ]] && ok "A6 search empty state" || bad "A6 search empty state"
b="$(body "$BASE/b/thalassa-beach-club")"
[[ "$b" == *"Front Row Sunbed Set"* && "$b" == *"See you next summer"* ]] && ok "A7 business page + review reply" || bad "A7 business page"
r="$(redir "$BASE/b/does-not-exist-xyz")"
[[ "$r" == *"/404"* ]] && ok "A8 missing business -> 404" || bad "A8 missing business" "$r"
c="$(code "$BASE/404")"
[[ "$c" == "404" || "$c" == "200" ]] && ok "A9 404 page renders" || bad "A9 404 page" "$c"

# ---------------------------------------------------------------- B. auth
section "B. Auth & role guards"
r="$(login "test.customer@onemykonos.gr" "$SMOKE_CUSTOMER_PASSWORD" "$CUSTOMER_JAR")"
[[ "$r" == *"/account"* ]] && ok "B1 customer login" || bad "B1 customer login" "$r"
r="$(login "demo.beach@onemykonos.gr" "$SMOKE_OWNER_PASSWORD" "$OWNER_JAR")"
[[ "$r" == *"/dashboard"* ]] && ok "B2 owner login -> dashboard" || bad "B2 owner login" "$r"
login "demo.villas@onemykonos.gr" "$SMOKE_OWNER_PASSWORD" "$VILLAS_JAR" > /dev/null
r="$(login "admin@onemykonos.gr" "$SMOKE_ADMIN_PASSWORD" "$ADMIN_JAR")"
[[ "$r" == *"/admin"* ]] && ok "B3 admin login -> admin" || bad "B3 admin login" "$r"
r="$(redir -H "$O" -d "email=test.customer@onemykonos.gr&password=wrongpass" "$BASE/api/auth/signin")"
[[ "$r" == *"error="* ]] && ok "B4 wrong password rejected" || bad "B4 wrong password" "$r"
r="$(redir "$BASE/dashboard")"
[[ "$r" == *"/login?next="* ]] && ok "B5 anonymous guard" || bad "B5 anonymous guard" "$r"
r="$(redir -b "$CUSTOMER_JAR" "$BASE/admin")"
[[ "$r" == *"/account"* ]] && ok "B6 customer blocked from /admin" || bad "B6 customer->admin" "$r"
r="$(redir -b "$OWNER_JAR" "$BASE/admin")"
[[ "$r" == *"/dashboard"* ]] && ok "B7 owner blocked from /admin" || bad "B7 owner->admin" "$r"
c="$(code -d "email=x@x.gr&password=x" "$BASE/api/auth/signin")"
[[ "$c" == "403" ]] && ok "B8 CSRF: POST without Origin -> 403" || bad "B8 CSRF" "$c"

if [[ "$LIGHT" != "1" ]]; then
  TS="$(date +%s)"
  NEW_EMAIL="onemykonos.smoke.$TS@gmail.com"
  r="$(redir -H "$O" -c "$TMP/new.jar" -d "role=customer&full_name=Run+Tester&email=$NEW_EMAIL&password=Smoke-$TS-pw1" "$BASE/api/auth/register")"
  [[ "$r" == *"/account"* ]] && ok "B9 new customer signup" || bad "B9 signup" "$r"
  [[ "$(body -b "$TMP/new.jar" "$BASE/account")" == *"Run Tester"* ]] && ok "B10 profile trigger created" || bad "B10 profile trigger"
  echo "$NEW_EMAIL" > "$TMP/new_email.txt"
fi

# ---------------------------------------------------------------- C. booking
section "C. Booking flow"
r="$(redir -H "$O" -b "$CUSTOMER_JAR" -d "service_id=$SUNBED_SVC&date=2020-01-01&guests=2" "$BASE/api/bookings/create")"
[[ "$r" == *"error="* ]] && ok "C1 past date rejected" || bad "C1 past date" "$r"
r="$(redir -H "$O" -b "$CUSTOMER_JAR" -d "service_id=$SUNBED_SVC&date=2026-10-05&guests=99" "$BASE/api/bookings/create")"
[[ "$r" == *"error="* ]] && ok "C2 invalid guests rejected" || bad "C2 guests" "$r"
r="$(redir -H "$O" -b "$CUSTOMER_JAR" -d "service_id=$SUNBED_SVC&date=2026-09-26&guests=2" "$BASE/api/bookings/create")"
[[ "$r" == *"error="* ]] && ok "C3 blocked date rejected" || bad "C3 blocked date" "$r"

r="$(redir -H "$O" -b "$CUSTOMER_JAR" -d "service_id=$SUNBED_SVC&date=2026-10-05&guests=2" "$BASE/api/bookings/create")"
if [[ "$r" == *"/pay/"* ]]; then
  ok "C4 instant booking -> checkout"
  BID="$(track_booking_from_url "$r")"
  price="$(sql_rest "bookings?id=eq.$BID&select=unit_price,commission_pct" | python3 -c 'import json,sys; d=json.load(sys.stdin)[0]; print(d["unit_price"], d["commission_pct"])')"
  [[ "$price" == "250.0 15.0" ]] && ok "C5 seasonal price + commission" || bad "C5 pricing" "$price"
  [[ "$(body -b "$CUSTOMER_JAR" "$BASE/pay/$BID")" == *"Demo payment"* ]] && ok "C6 demo checkout page" || bad "C6 checkout page"
  r="$(redir -H "$O" -b "$CUSTOMER_JAR" -d "booking_id=$BID" "$BASE/api/payments/demo-complete")"
  [[ "$r" == *"paid=1"* ]] && ok "C7 demo payment completes" || bad "C7 demo payment" "$r"
  b="$(body -b "$CUSTOMER_JAR" "$BASE/bookings/$BID")"
  [[ "$b" == *"Confirmed"* && "$b" == *"paid"* ]] && ok "C8 booking confirmed + paid" || bad "C8 booking state"
else
  bad "C4 instant booking" "$r"; BID=""
fi

VILLA_SVC="$(body "$BASE/b/aegean-blue-villas" | grep -oE '/book/[a-f0-9-]{36}' | head -1 | cut -d/ -f3)"
r="$(redir -H "$O" -b "$CUSTOMER_JAR" -d "service_id=$VILLA_SVC&date=2026-10-20&guests=2" "$BASE/api/bookings/create")"
if [[ "$r" == *"/bookings/"* && "$r" != *"/pay/"* ]]; then
  ok "C9 request booking -> pending, no payment"
  RBID="$(track_booking_from_url "$r")"
  r="$(redir -H "$O" -b "$CUSTOMER_JAR" -d "booking_id=$RBID" "$BASE/api/bookings/cancel")"
  [[ "$(body -b "$CUSTOMER_JAR" "$BASE/bookings/$RBID")" == *"Cancelled"* ]] && ok "C10 customer cancel" || bad "C10 cancel"
else
  bad "C9 request booking" "$r"; RBID=""
fi

if [[ "$LIGHT" == "1" ]]; then
  section "Light run: skipping dashboard/admin/security suites"
else

# ---------------------------------------------------------------- D. dashboard
section "D. Business dashboard"
b="$(body -b "$OWNER_JAR" "$BASE/dashboard/bookings")"
[[ "$b" == *"Test Customer"* ]] && ok "D1 owner sees bookings" || bad "D1 owner bookings"
if [[ -n "$BID" ]]; then
  redir -H "$O" -b "$OWNER_JAR" -d "booking_id=$BID&action=complete" "$BASE/api/dashboard/booking-status" > /dev/null
  st="$(sql_rest "bookings?id=eq.$BID&select=status" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["status"])')"
  [[ "$st" == "completed" ]] && ok "D2 owner completes booking" || bad "D2 complete" "$st"
fi
j='{"service_id":"'$SUNBED_SVC'","date":"2026-11-11","action":"toggle_block"}'
r="$(curl -s -H "$O" -H 'Content-Type: application/json' -b "$OWNER_JAR" -d "$j" "$BASE/api/dashboard/availability")"
[[ "$r" == *'"blocked":true'* ]] && ok "D3 calendar block" || bad "D3 block" "$r"
r="$(curl -s -H "$O" -H 'Content-Type: application/json' -b "$OWNER_JAR" -d "$j" "$BASE/api/dashboard/availability")"
[[ "$r" == *'"blocked":false'* ]] && ok "D4 calendar unblock" || bad "D4 unblock" "$r"

r="$(redir -H "$O" -b "$OWNER_JAR" -d "title=Smoke+Test+Service&pricing_type=fixed&base_price=99&booking_mode=instant&min_guests=1&active=on" "$BASE/api/dashboard/service")"
SVC_NEW="$(echo "$r" | grep -oE '[a-f0-9-]{36}' | head -1)"
[[ -n "$SVC_NEW" ]] && ok "D5 create service" || bad "D5 create service" "$r"
[[ "$(body "$BASE/b/thalassa-beach-club")" == *"Smoke Test Service"* ]] && ok "D6 new service public" || bad "D6 service public"
redir -H "$O" -b "$OWNER_JAR" -d "service_id=$SVC_NEW&title=Smoke+Test+Service&pricing_type=fixed&base_price=99&booking_mode=instant&min_guests=1" "$BASE/api/dashboard/service" > /dev/null
[[ "$(body "$BASE/b/thalassa-beach-club")" != *"Smoke Test Service"* ]] && ok "D7 deactivated service hidden" || bad "D7 deactivate"
r="$(redir -H "$O" -b "$OWNER_JAR" -d "action=add&service_id=$SVC_NEW&name=TestSeason&start_date=2026-12-01&end_date=2026-12-15&price=150" "$BASE/api/dashboard/season")"
SEASONS="$(sql_rest "service_pricing_seasons?service_id=eq.$SVC_NEW&select=id" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d), d[0]["id"] if d else "")')"
[[ "$SEASONS" == 1\ * ]] && ok "D8 season added" || bad "D8 season" "$SEASONS"
SEASON_ID="${SEASONS#1 }"
redir -H "$O" -b "$OWNER_JAR" -d "action=delete&season_id=$SEASON_ID&service_id=$SVC_NEW" "$BASE/api/dashboard/season" > /dev/null
n="$(sql_rest "service_pricing_seasons?service_id=eq.$SVC_NEW&select=id" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"
[[ "$n" == "0" ]] && ok "D9 season deleted" || bad "D9 season delete" "$n"

# image upload (multipart, tiny png)
python3 -c "
import zlib, struct
def chunk(t, d):
    c = t + d
    return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c))
ihdr = struct.pack('>IIBBBBB', 4, 4, 8, 2, 0, 0, 0)
raw = b''.join(b'\x00' + b'\x0e\x2a\x47' * 4 for _ in range(4))
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
open('$TMP/test.png', 'wb').write(png)"
r="$(curl -s -o /dev/null -w '%{redirect_url}' -H "$O" -b "$OWNER_JAR" \
  -F "service_id=$SVC_NEW" -F "title=Smoke Test Service" -F "pricing_type=fixed" -F "base_price=99" \
  -F "booking_mode=instant" -F "min_guests=1" -F "new_images=@$TMP/test.png;type=image/png" \
  "$BASE/api/dashboard/service")"
IMG_URL="$(sql_rest "services?id=eq.$SVC_NEW&select=images" | python3 -c 'import json,sys; im=json.load(sys.stdin)[0]["images"]; print(im[0] if im else "")')"
if [[ "$IMG_URL" == https://*supabase* ]]; then
  [[ "$(code "$IMG_URL")" == "200" ]] && ok "D10 image upload to storage" || bad "D10 image not fetchable" "$IMG_URL"
else
  bad "D10 image upload" "$IMG_URL"
fi

# ---------------------------------------------------------------- E. admin
section "E. Admin"
RIDERS_ID="$(sql_rest "businesses?slug=eq.mykonos-riders&select=id" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["id"])')"
redir -H "$O" -b "$ADMIN_JAR" -d "business_id=$RIDERS_ID&action=suspend" "$BASE/api/admin/business-action" > /dev/null
r="$(redir "$BASE/b/mykonos-riders")"
[[ "$r" == *"/404"* ]] && ok "E1 suspended hidden from public" || bad "E1 suspend" "$r"
redir -H "$O" -b "$ADMIN_JAR" -d "business_id=$RIDERS_ID&action=approve" "$BASE/api/admin/business-action" > /dev/null
[[ "$(code "$BASE/b/mykonos-riders")" == "200" ]] && ok "E2 re-approved visible" || bad "E2 re-approve"
redir -H "$O" -b "$ADMIN_JAR" -d "business_id=$RIDERS_ID&action=feature" "$BASE/api/admin/business-action" > /dev/null
[[ "$(body "$BASE/")" == *"Mykonos Riders"* ]] && ok "E3 featured on homepage" || bad "E3 feature"
redir -H "$O" -b "$ADMIN_JAR" -d "business_id=$RIDERS_ID&action=unfeature" "$BASE/api/admin/business-action" > /dev/null
[[ "$(body "$BASE/")" != *"Mykonos Riders"* ]] && ok "E4 unfeatured" || bad "E4 unfeature"

THALASSA_ID="$(sql_rest "businesses?slug=eq.thalassa-beach-club&select=id" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["id"])')"
redir -H "$O" -b "$ADMIN_JAR" -d "business_id=$THALASSA_ID&action=set_commission&commission_pct=22" "$BASE/api/admin/business-action" > /dev/null
r="$(redir -H "$O" -b "$CUSTOMER_JAR" -d "service_id=$SUNBED_SVC&date=2026-10-06&guests=1" "$BASE/api/bookings/create")"
CBID="$(track_booking_from_url "$r")"
pct="$(sql_rest "bookings?id=eq.$CBID&select=commission_pct" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["commission_pct"])')"
[[ "$pct" == "22.0" ]] && ok "E5 per-business commission applied" || bad "E5 commission" "$pct"
redir -H "$O" -b "$ADMIN_JAR" -d "business_id=$THALASSA_ID&action=set_commission&commission_pct=" "$BASE/api/admin/business-action" > /dev/null
[[ "$(code -b "$ADMIN_JAR" "$BASE/admin/bookings?status=confirmed")" == "200" ]] && ok "E6 admin bookings filter" || bad "E6 filter"
c="$(redir -H "$O" -b "$CUSTOMER_JAR" -d "business_id=$RIDERS_ID&action=suspend" "$BASE/api/admin/business-action")"
[[ "$c" == "$BASE/" ]] && ok "E7 non-admin rejected from admin API" || bad "E7 admin api guard" "$c"

# ---------------------------------------------------------------- F. security
section "F. Security (REST adversarial)"
python3 <<PYEOF
import json, urllib.request, urllib.error
env = dict(l.strip().split('=',1) for l in open('$ROOT/.env') if '=' in l)
URL, ANON = env['PUBLIC_SUPABASE_URL'], env['PUBLIC_SUPABASE_ANON_KEY']
BID = '$BID'
results = []
def token(email, pw):
    r = urllib.request.Request(f'{URL}/auth/v1/token?grant_type=password',
        data=json.dumps({'email': email, 'password': pw}).encode(),
        headers={'apikey': ANON, 'Content-Type': 'application/json'}, method='POST')
    return json.load(urllib.request.urlopen(r))['access_token']
def patch(tok, body):
    r = urllib.request.Request(f'{URL}/rest/v1/bookings?id=eq.{BID}', data=json.dumps(body).encode(),
        headers={'apikey': ANON, 'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json',
                 'Prefer': 'return=representation'}, method='PATCH')
    try:
        return ('ok', urllib.request.urlopen(r).read().decode())
    except urllib.error.HTTPError as e:
        return ('err', e.read().decode())
def rows(tok, path):
    h = {'apikey': ANON}
    if tok: h['Authorization'] = f'Bearer {tok}'
    r = urllib.request.Request(f'{URL}/rest/v1/{path}', headers=h)
    return len(json.load(urllib.request.urlopen(r)))

cust = token('test.customer@onemykonos.gr', '$SMOKE_CUSTOMER_PASSWORD')
s, b = patch(cust, {'total_price': 1})
results.append(('F1 price tamper blocked', s == 'err' and 'immutable' in b))
s, b = patch(cust, {'status': 'confirmed'})
results.append(('F2 self-confirm blocked', s == 'err'))
other = token('demo.villas@onemykonos.gr', '$SMOKE_OWNER_PASSWORD')
s, b = patch(other, {'status': 'cancelled'})
results.append(('F3 foreign business no-op', s == 'ok' and b == '[]'))
results.append(('F4 anon sees no bookings', rows(None, 'bookings?select=id') == 0))
results.append(('F5 anon sees no payments', rows(None, 'payments?select=id') == 0))
results.append(('F6 anon sees no profiles', rows(None, 'profiles?select=id') == 0))
for name, passed in results:
    print(('  PASS  ' if passed else '  FAIL  ') + name)
exit(0 if all(p for _, p in results) else 7)
PYEOF
if [[ $? -eq 0 ]]; then PASS=$((PASS+6)); else FAIL=$((FAIL+1)); FAILED="$FAILED\n  - F: see REST output above"; fi

if [[ -d "$ROOT/dist/client" ]]; then
  if ! grep -rq "$SERVICE" "$ROOT/dist/client" 2>/dev/null; then
    ok "F7 service key absent from client bundle"
  else
    bad "F7 SERVICE KEY LEAKED INTO CLIENT BUNDLE"
  fi
fi

# ---------------------------------------------------------------- G. reviews
section "G. Reviews"
if [[ -n "$BID" ]]; then
  r="$(redir -H "$O" -b "$CUSTOMER_JAR" -d "booking_id=$BID&rating=4&comment=Smoke+review" "$BASE/api/reviews/create")"
  [[ "$r" == *"reviewed=1"* ]] && ok "G1 review on completed booking" || bad "G1 review" "$r"
  r="$(redir -H "$O" -b "$CUSTOMER_JAR" -d "booking_id=$BID&rating=1&comment=dup" "$BASE/api/reviews/create")"
  [[ "$r" != *"reviewed=1"* ]] && ok "G2 duplicate review rejected" || bad "G2 duplicate"
fi
if [[ -n "$RBID" ]]; then
  r="$(redir -H "$O" -b "$CUSTOMER_JAR" -d "booking_id=$RBID&rating=5" "$BASE/api/reviews/create")"
  [[ "$r" != *"reviewed=1"* ]] && ok "G3 review on non-completed rejected" || bad "G3 non-completed"
fi

fi  # end LIGHT skip

# ---------------------------------------------------------------- cleanup
section "Cleanup"
python3 <<PYEOF
import json, urllib.request
env = dict(l.strip().split('=',1) for l in open('$ROOT/.env') if '=' in l)
URL, SERVICE = env['PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': SERVICE, 'Authorization': f'Bearer {SERVICE}', 'Content-Type': 'application/json'}
def req(method, path):
    try:
        urllib.request.urlopen(urllib.request.Request(f'{URL}{path}', headers=H, method=method))
    except Exception as e:
        print('  cleanup warn:', path, e)
ids = [l.strip() for l in open('$CREATED_BOOKINGS') if l.strip()]
for bid in ids:
    req('DELETE', f'/rest/v1/reviews?booking_id=eq.{bid}')
    req('DELETE', f'/rest/v1/payments?booking_id=eq.{bid}')
    req('DELETE', f'/rest/v1/bookings?id=eq.{bid}')
print(f'  removed {len(ids)} test bookings')
svc = '${SVC_NEW:-}'
if svc:
    req('DELETE', f'/rest/v1/services?id=eq.{svc}')
    print('  removed smoke test service')
try:
    email = open('$TMP/new_email.txt').read().strip()
    users = json.load(urllib.request.urlopen(urllib.request.Request(f'{URL}/auth/v1/admin/users?per_page=100', headers=H)))['users']
    for u in users:
        if u['email'] == email:
            req('DELETE', f'/auth/v1/admin/users/{u["id"]}')
            print('  removed signup test user')
except FileNotFoundError:
    pass
PYEOF

# ---------------------------------------------------------------- summary
printf '\n========================\n TOTAL: %d passed, %d failed\n' "$PASS" "$FAIL"
[[ -n "$FAILED" ]] && printf 'Failures:%b\n' "$FAILED"
exit $((FAIL > 0))
