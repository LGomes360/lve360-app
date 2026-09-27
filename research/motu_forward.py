"""MOTU Small Prime: read-only Day-0 capture and immutable paper decisions."""
from __future__ import annotations

import argparse
import csv
import getpass
import json
from datetime import date, datetime, timezone
from pathlib import Path

from motu_market_data import (Tradier, UNIVERSE, capture, check_clock, digest, fresh, number,
                              read_context, require, timestamp, validate_row, write_json)

START_NAV = 166912.81
SLOTS = 4
COMM = 0.65
TARGET_DTE = 14
DTE_LO, DTE_HI = 7, 21
TARGET_PUT_DELTA = -0.20


def select_day0(rows, context):
    """v0.6 fill_puts/choose_put/ranked semantics, with four empty slots."""
    ranks = sorted(context, key=lambda s: (-number(context[s]['iv']) / number(context[s]['realized_vol']),
                                          -number(context[s]['iv_rank']), s))
    picks, rejects = [], []
    for rank, sym in enumerate(ranks, 1):
        c = context[sym]
        candidates = [r for r in rows if r['symbol'] == sym]
        if not candidates:
            rejects.append({'symbol': sym, 'reason': 'no_valid_contracts'})
            continue
        if number(candidates[0]['underlying']) <= number(c['sma200']):
            rejects.append({'symbol': sym, 'reason': 'below_sma200'})
            continue
        if number(candidates[0]['next_earnings_days']) <= 45:
            rejects.append({'symbol': sym, 'reason': 'event_blackout'})
            continue
        good = []
        for r in candidates:
            delta, bid, ask = (number(r[k]) for k in ('put_delta', 'bid', 'ask'))
            spread = (ask-bid)/((ask+bid)/2)
            if not (-.45 <= delta <= -.03 and DTE_LO <= number(r['dte']) <= DTE_HI
                    and number(r['strike']) < number(r['underlying']) and bid >= .05
                    and ask >= bid and spread <= .60):
                rejects.append({'symbol': sym, 'option_symbol': r['option_symbol'], 'reason': 'frozen_contract_filter'})
                continue
            score = abs(delta-TARGET_PUT_DELTA)*5 + abs(number(r['dte'])-TARGET_DTE)/TARGET_DTE
            good.append((score, spread, r['expiration'], number(r['strike']), r['option_symbol'], r))
        if not good:
            continue
        r = min(good, key=lambda x: x[:5])[-1]
        collateral = number(r['strike'])*100
        contracts = int((START_NAV/SLOTS)//collateral)
        # v0.6 chooses the best contract BEFORE affordability.
        if contracts < 1:
            rejects.append({'symbol': sym, 'reason': 'unaffordable_best_contract'})
            continue
        if len(picks) == SLOTS:
            rejects.append({'symbol': sym, 'reason': 'slots_full'})
            continue
        picks.append({'slot': len(picks)+1, 'decision': 'SELL_PUT', 'symbol': sym,
                      'vrp_rank': rank, 'vrp': number(c['iv'])/number(c['realized_vol']),
                      'contracts': contracts, 'required_collateral': collateral*contracts,
                      'paper_credit': round((number(r['bid'])*100-COMM)*contracts, 2),
                      'quote': r, 'fill_status': 'UNFILLED_PAPER_DECISION'})
    while len(picks) < SLOTS:
        picks.append({'slot': len(picks)+1, 'decision': 'HOLD_CASH', 'reason': 'no eligible affordable unique candidate'})
    return picks, rejects


def make_sheet(bundle, replay=False, now=None):
    bundle = Path(bundle)
    now = now or datetime.now(timezone.utc)
    m = json.loads((bundle/'manifest.json').read_text(encoding='utf-8'))
    require(m['schema'] == 1 and m['provider'] == 'tradier' and m['feed'] == 'production', 'unsupported evidence')
    require(m['universe'] == UNIVERSE, 'incomplete universe')
    require(set(m['files']) == {'context.csv', 'raw.json', 'snapshot.csv'}, 'incomplete evidence files')
    for name, expected in m['files'].items():
        require(digest(bundle/name) == expected, 'evidence hash mismatch: '+name)
    asof = timestamp(m['asof'])
    if not replay:
        fresh(m['asof'], now, 120)
    validation_time = asof if replay else now
    today = date.fromisoformat(m['session_date'])
    raw = json.loads((bundle/'raw.json').read_text(encoding='utf-8'))
    require(raw and raw[-1]['endpoint'] == 'clock', 'missing final market clock')
    require(check_clock(raw[-1]['response'], validation_time) == today, 'market session mismatch')
    context = read_context(bundle/'context.csv', today, validation_time)
    with (bundle/'snapshot.csv').open(newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    require(rows, 'empty snapshot')
    seen = set()
    for r in rows:
        validate_row(r, today, validation_time)
        require(r['option_symbol'] not in seen, 'duplicate contract')
        seen.add(r['option_symbol'])
        for key, value in context[r['symbol']].items():
            require(r[key] == value, 'context/snapshot mismatch')
    picks, rejects = select_day0(rows, context)
    return {'protocol': 'MOTU Forward / Small Prime 4-slot',
            'status': 'REPLAY_NOT_PROSPECTIVE' if replay else 'DAY0_PAPER_DECISION',
            'asof': m['asof'], 'generated_at': now.isoformat(),
            'nav': START_NAV, 'slot_cash': START_NAV/SLOTS,
            'scope': 'initial all-cash shadow portfolio only',
            'gate': 'stocktrend_event45 (v0.6); no added market/credit veto',
            'source_sha256': digest(bundle/'snapshot.csv'),
            'manifest_sha256': digest(bundle/'manifest.json'),
            'protocol_sha256': digest(Path(__file__).parent/'motu_forward'/'PROTOCOL.md'),
            'code_sha256': {p.name: digest(p) for p in (Path(__file__), Path(__file__).with_name('motu_market_data.py'))},
            'picks': picks, 'rejects': m['rejects']+rejects,
            'accounting': 'premium is cash flow, not profit; no fills or capital deployed'}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest='command', required=True)
    live = sub.add_parser('capture-day0', help='prompt for Tradier token; GET-only live capture')
    live.add_argument('--context', required=True)
    live.add_argument('--out', required=True, help='new private evidence directory; must not exist')
    live.add_argument('--confirm-new-shadow-portfolio', action='store_true', required=True)
    replay = sub.add_parser('replay', help='offline evidence replay; never a prospective decision')
    replay.add_argument('bundle')
    replay.add_argument('--out', required=True, help='new replay JSON file')
    args = ap.parse_args(argv)
    try:
        if args.command == 'capture-day0':
            require(not Path(args.out).exists(), 'output directory already exists')
            token = getpass.getpass('Tradier production market-data token (hidden): ')
            bundle = capture(Tradier(token), args.context, args.out)
            sheet = make_sheet(bundle)
            write_json(bundle/'day0.json', sheet)
            print('WROTE', bundle/'day0.json')
        else:
            write_json(args.out, make_sheet(args.bundle, replay=True))
            print('WROTE replay (not prospective)', args.out)
    except (ValueError, KeyError, TypeError, OSError, OverflowError) as e:
        ap.exit(2, f'BLOCKED: {e}\n')


if __name__ == '__main__':
    main()
