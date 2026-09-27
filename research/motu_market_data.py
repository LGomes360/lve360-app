"""Read-only Tradier market data and auditable Day-0 evidence validation."""
from __future__ import annotations

import csv
import hashlib
import json
import math
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

UNIVERSE = ('AAPL AMD AMZN BA COST CVX DIS JPM MSFT NFLX NVDA ORCL PYPL TSLA WMT XOM').split()
BASE = 'https://api.tradier.com/v1/markets/'
QUOTE_AGE = 120
GREEKS_AGE = 3900  # Provider publishes hourly; never label these real-time Greeks.


def require(condition, message):
    if not condition:
        raise ValueError(message)


def number(value):
    require(not isinstance(value, bool), 'boolean is not a number')
    n = float(value)
    require(math.isfinite(n), 'non-finite number')
    return n


def timestamp(value):
    t = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    require(t.tzinfo is not None, 'timezone required')
    return t.astimezone(timezone.utc)


def fresh(value, now, limit):
    age = (now - timestamp(value)).total_seconds()
    require(0 <= age <= limit, 'stale or future timestamp')


def milliseconds(value):
    return datetime.fromtimestamp(number(value) / 1000, timezone.utc).isoformat()


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, value):
    with Path(path).open('x', encoding='utf-8', newline='\n') as f:
        json.dump(value, f, indent=2, allow_nan=False)
        f.write('\n')


def many(value):
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('provider redirect refused')


class Tradier:
    """Only allow documented GET market-data endpoints; no account/order API."""
    def __init__(self, token):
        require(bool(token.strip()), 'empty API token')
        self._token = token.strip()
        self.evidence = []

    def get(self, endpoint, **params):
        require(endpoint in {'clock', 'quotes', 'options/expirations', 'options/chains'},
                'endpoint not allowed')
        req = Request(BASE + endpoint + '?' + urlencode(params),
                      headers={'Authorization': 'Bearer ' + self._token,
                               'Accept': 'application/json'}, method='GET')
        try:
            with build_opener(NoRedirect()).open(req, timeout=20) as response:
                body = response.read(20_000_001)
                require(len(body) <= 20_000_000, 'oversized provider response')
                data = json.loads(body)
        except HTTPError as e:
            raise ValueError(f'provider HTTP {e.code}; capture aborted (no partial sheet)') from None
        except (URLError, TimeoutError, json.JSONDecodeError):
            raise ValueError('provider transport/JSON failure; capture aborted') from None
        require(isinstance(data, dict) and not data.get('errors'), 'provider error response')
        self.evidence.append({'endpoint': endpoint, 'params': params,
                              'received_at': datetime.now(timezone.utc).isoformat(),
                              'response': data})
        return data


def check_clock(data, now):
    c = data['clock']
    require(c['state'] == 'open', 'market closed; no prospective sheet')
    age = now.timestamp() - number(c['timestamp'])
    require(0 <= age <= 30, 'stale/future market clock')
    # Provider clock observes holidays and shortened sessions.
    return datetime.fromtimestamp(number(c['timestamp']), timezone.utc).date()


def read_context(path, today, now):
    """Operator supplies sourced frozen-model inputs; do not invent HV definitions."""
    with Path(path).open(newline='', encoding='utf-8-sig') as f:
        rows = list(csv.DictReader(f))
    require(len(rows) == len(UNIVERSE), 'context must cover all 16 frozen symbols')
    result = {}
    for r in rows:
        sym = r['symbol']
        require(sym in UNIVERSE and sym not in result, 'unknown/duplicate context symbol')
        fresh(r['observed_at'], now, 86400 * 4)
        require(date.fromisoformat(r['session_date']) == today, 'context session mismatch')
        age = (today - date.fromisoformat(r['metrics_date'])).days
        require(0 <= age <= 4, 'stale/future metrics')
        require(bool(r['source'].strip()) and bool(r['volatility_method'].strip()), 'source/method required')
        require(r['frozen_input_compatibility'] == 'reviewed', 'input compatibility must be reviewed')
        for key in ('sma200', 'realized_vol', 'iv'):
            require(number(r[key]) > 0, 'nonpositive model input')
        require(0 <= number(r['iv_rank']) <= 1, 'invalid IV rank')
        require(date.fromisoformat(r['next_earnings_date']) >= today, 'unknown/past earnings date')
        require(date.fromisoformat(r['events_checked_through']) >= today + timedelta(days=45),
                'event review must cover 45 days')
        require(r['corporate_action_clear'] == 'yes', 'corporate action requires explicit review')
        result[sym] = r
    return result


def normalize(option, quote, context, today, now):
    sym = context['symbol']
    require(option['underlying'] == sym and quote['symbol'] == sym, 'underlying mismatch')
    require(option['option_type'] == 'put' and number(option['contract_size']) == 100,
            'nonstandard contract')
    exp = date.fromisoformat(option['expiration_date'])
    strike = number(option['strike'])
    occ = f"{sym}{exp:%y%m%d}P{round(strike * 1000):08d}"
    require(option['symbol'] == occ and abs(strike * 1000 - round(strike * 1000)) < 1e-6,
            'adjusted or inconsistent OCC contract')
    g = option['greeks']
    row = dict(context)
    row.update(underlying=number(quote['last']), expiration=str(exp), dte=(exp-today).days,
               next_earnings_days=(date.fromisoformat(context['next_earnings_date'])-today).days,
               strike=strike, put_delta=number(g['delta']), bid=number(option['bid']),
               ask=number(option['ask']), option_iv=number(g['mid_iv']),
               option_symbol=option['symbol'], contract_size=100,
               bid_size=number(option['bidsize']), ask_size=number(option['asksize']),
               bid_at=milliseconds(option['bid_date']), ask_at=milliseconds(option['ask_date']),
               underlying_at=milliseconds(quote['trade_date']), greeks_at=g['updated_at'])
    validate_row(row, today, now)
    return row


def validate_row(r, today, now):
    require(r['symbol'] in UNIVERSE, 'outside frozen universe')
    for key in ('underlying', 'sma200', 'realized_vol', 'iv', 'strike', 'option_iv'):
        require(number(r[key]) > 0, 'nonpositive input')
    require(-1 <= number(r['put_delta']) < 0, 'invalid put delta')
    require(0 < number(r['bid']) <= number(r['ask']), 'invalid/crossed quote')
    require(number(r['bid_size']) >= 1 and number(r['ask_size']) >= 1, 'empty quote size')
    require(number(r['contract_size']) == 100, 'nonstandard contract')
    require(number(r['dte']) == (date.fromisoformat(r['expiration']) - today).days, 'DTE mismatch')
    for key in ('bid_at', 'ask_at', 'underlying_at'):
        fresh(r[key], now, QUOTE_AGE)
    fresh(r['greeks_at'], now, GREEKS_AGE)


def capture(client, context_path, out, now_fn=lambda: datetime.now(timezone.utc)):
    """Capture complete universe. HTTP errors abort; bad contracts become audited rejects."""
    now = now_fn()
    today = check_clock(client.get('clock'), now_fn())
    context = read_context(context_path, today, now)
    rows, rejects = [], []
    seen = set()
    for sym in UNIVERSE:
        quotes = many(client.get('quotes', symbols=sym)['quotes']['quote'])
        require(len(quotes) == 1, 'missing/ambiguous underlying quote')
        dates = many(client.get('options/expirations', symbol=sym)['expirations']['date'])
        expiries = sorted(set(d for d in dates if 7 <= (date.fromisoformat(d)-today).days <= 21))
        if not expiries:
            rejects.append({'symbol': sym, 'reason': 'no_expiration_7_21'})
        for exp in expiries:
            response = client.get('options/chains', symbol=sym, expiration=exp, greeks='true')
            options = many((response.get('options') or {}).get('option'))
            if not options:
                rejects.append({'symbol': sym, 'expiration': exp, 'reason': 'empty_chain'})
            for o in options:
                if o.get('option_type') != 'put':
                    continue
                try:
                    require(o['expiration_date'] == exp, 'expiration mismatch')
                    require(o['symbol'] not in seen, 'duplicate contract')
                    seen.add(o['symbol'])
                    rows.append(normalize(o, quotes[0], context[sym], today, now_fn()))
                except (ValueError, KeyError, TypeError, OverflowError) as e:
                    rejects.append({'symbol': sym, 'option_symbol': o.get('symbol'), 'reason': str(e)})
    require(check_clock(client.get('clock'), now_fn()) == today, 'session changed during capture')
    finished = now_fn()
    valid = []
    for r in rows:
        try:
            validate_row(r, today, finished)
            valid.append(r)
        except ValueError as e:
            rejects.append({'symbol': r['symbol'], 'option_symbol': r['option_symbol'], 'reason': str(e)})
    require(valid, 'no fresh executable candidates; no Day-0 sheet')
    out = Path(out)
    out.mkdir(parents=True, exist_ok=False)
    (out / 'context.csv').write_bytes(Path(context_path).read_bytes())
    write_json(out / 'raw.json', client.evidence)
    with (out / 'snapshot.csv').open('x', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(valid[0]))
        w.writeheader()
        w.writerows(valid)
    write_json(out / 'manifest.json', {
        'schema': 1, 'provider': 'tradier', 'feed': 'production', 'asof': finished.isoformat(),
        'session_date': str(today), 'universe': UNIVERSE, 'rejects': rejects,
        'quote_max_age_seconds': QUOTE_AGE, 'greeks_max_age_seconds': GREEKS_AGE,
        'files': {name: digest(out / name) for name in ('context.csv', 'raw.json', 'snapshot.csv')}})
    return out
