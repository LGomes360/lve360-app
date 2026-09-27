"""Synthetic fixtures only: these tests never constitute prospective evidence."""
import ast
import csv
import hashlib
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import motu_forward as forward
import motu_market_data as data

NOW = datetime(2026, 9, 28, 16, tzinfo=timezone.utc)


def context(sym):
    return dict(symbol=sym, session_date='2026-09-28', metrics_date='2026-09-25',
                observed_at=NOW.isoformat(), source='synthetic-test-only',
                volatility_method='synthetic-test-only', frozen_input_compatibility='reviewed',
                sma200='90', realized_vol='0.20', iv='0.30', iv_rank='0.5',
                next_earnings_date='2026-12-01', events_checked_through='2026-12-01',
                corporate_action_clear='yes')


def option(sym):
    ms = int(NOW.timestamp()*1000)
    return dict(symbol=sym+'261012P00095000', underlying=sym, option_type='put',
                contract_size=100, expiration_date='2026-10-12', strike=95,
                bid=1, ask=1.2, bidsize=10, asksize=10, bid_date=ms, ask_date=ms,
                greeks={'delta': -.2, 'mid_iv': .35, 'updated_at': NOW.isoformat()})


def quote(sym):
    return dict(symbol=sym, last=100, trade_date=int(NOW.timestamp()*1000))


class FakeProvider:
    def __init__(self, fail=None, closed=False):
        self.evidence = []
        self.fail, self.closed = fail, closed

    def get(self, endpoint, **params):
        if self.fail == endpoint:
            raise ValueError('provider HTTP 429')
        sym = params.get('symbol', params.get('symbols'))
        if endpoint == 'clock':
            result = {'clock': {'state': 'closed' if self.closed else 'open', 'timestamp': NOW.timestamp()}}
        elif endpoint == 'quotes':
            result = {'quotes': {'quote': quote(sym)}}
        elif endpoint == 'options/expirations':
            result = {'expirations': {'date': ['2026-10-12']}}
        else:
            result = {'options': {'option': [option(sym)]}}
        self.evidence.append({'endpoint': endpoint, 'params': params, 'received_at': NOW.isoformat(), 'response': result})
        return result


class ForwardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.ctx = self.root/'context.csv'
        self.context = {s: context(s) for s in data.UNIVERSE}
        self.write_context()

    def tearDown(self):
        self.tmp.cleanup()

    def write_context(self):
        with self.ctx.open('w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=list(context('AAPL')))
            w.writeheader()
            w.writerows(self.context.values())

    def row(self, sym='AAPL'):
        return data.normalize(option(sym), quote(sym), context(sym), NOW.date(), NOW)

    def bundle(self):
        return data.capture(FakeProvider(), self.ctx, self.root/'bundle', now_fn=lambda: NOW)

    def test_capture_replay_and_four_slots(self):
        b = self.bundle()
        live = forward.make_sheet(b, now=NOW)
        replay = forward.make_sheet(b, replay=True, now=NOW+timedelta(days=1))
        self.assertEqual(live['picks'], replay['picks'])
        self.assertEqual(replay['status'], 'REPLAY_NOT_PROSPECTIVE')
        self.assertEqual(len(live['picks']), 4)
        self.assertEqual(len({p['symbol'] for p in live['picks']}), 4)
        self.assertTrue(all(p['required_collateral'] <= forward.START_NAV/4 for p in live['picks']))
        self.assertEqual(live['picks'][0]['paper_credit'], 397.4)

    def test_closed_market_no_output(self):
        with self.assertRaisesRegex(ValueError, 'market closed'):
            data.capture(FakeProvider(closed=True), self.ctx, self.root/'bundle', now_fn=lambda: NOW)
        self.assertFalse((self.root/'bundle').exists())

    def test_partial_fetch_never_publishes(self):
        with self.assertRaises(ValueError):
            data.capture(FakeProvider(fail='options/chains'), self.ctx, self.root/'bundle', now_fn=lambda: NOW)
        self.assertFalse((self.root/'bundle').exists())

    def test_no_overwrite(self):
        self.bundle()
        with self.assertRaises(FileExistsError):
            self.bundle()
        data.write_json(self.root/'sheet.json', {})
        with self.assertRaises(FileExistsError):
            data.write_json(self.root/'sheet.json', {})

    def test_tamper_detected(self):
        b = self.bundle()
        (b/'snapshot.csv').write_text('changed')
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            forward.make_sheet(b, replay=True)

    def test_old_bundle_cannot_be_prospective(self):
        with self.assertRaisesRegex(ValueError, 'stale'):
            forward.make_sheet(self.bundle(), now=NOW+timedelta(days=1))

    def test_context_missing_or_unknown_earnings(self):
        for key, value in [('next_earnings_date', ''), ('realized_vol', 'NaN'),
                           ('observed_at', '2026-09-28T16:00:00'),
                           ('frozen_input_compatibility', ''), ('corporate_action_clear', 'no')]:
            with self.subTest(key=key):
                self.context['AAPL'] = context('AAPL')
                self.context['AAPL'][key] = value
                self.write_context()
                with self.assertRaises(ValueError):
                    data.read_context(self.ctx, NOW.date(), NOW)

    def test_full_universe_required(self):
        del self.context['AAPL']
        self.write_context()
        with self.assertRaises(ValueError):
            data.read_context(self.ctx, NOW.date(), NOW)

    def test_quote_and_greeks_freshness(self):
        for field in ('bid_at', 'ask_at', 'underlying_at', 'greeks_at'):
            for shift in (-7200, 1):
                r = self.row()
                r[field] = (NOW+timedelta(seconds=shift)).isoformat()
                with self.subTest(field=field, shift=shift), self.assertRaises(ValueError):
                    data.validate_row(r, NOW.date(), NOW)

    def test_bad_numbers_and_quotes(self):
        for key, value in [('strike', 0), ('iv', float('nan')), ('bid', -1),
                           ('ask', .5), ('put_delta', .2), ('bid_size', 0),
                           ('contract_size', 10), ('dte', 13.5)]:
            r = self.row()
            r[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                data.validate_row(r, NOW.date(), NOW)

    def test_adjusted_occ_rejected(self):
        o = option('AAPL')
        o['symbol'] = 'AAPL1261012P00095000'
        with self.assertRaises(ValueError):
            data.normalize(o, quote('AAPL'), context('AAPL'), NOW.date(), NOW)

    def test_earnings_day45_and_trend_boundary(self):
        for key, value in [('next_earnings_days', 45), ('underlying', 90)]:
            r = self.row()
            r[key] = value
            picks, _ = forward.select_day0([r], {'AAPL': context('AAPL')})
            self.assertTrue(all(p['decision'] == 'HOLD_CASH' for p in picks))

    def test_rank_stock_not_contract_iv(self):
        a, b = self.row('AAPL'), self.row('AMD')
        a['option_iv'], b['option_iv'] = 9, .01
        ctx = {'AAPL': context('AAPL'), 'AMD': context('AMD')}
        ctx['AMD']['iv'] = '.4'
        picks, _ = forward.select_day0([a, b], ctx)
        self.assertEqual(picks[0]['symbol'], 'AMD')

    def test_unaffordable_best_contract_does_not_fall_back(self):
        a = self.row()
        a.update(strike=500, underlying=600)
        b = dict(a, strike=100, put_delta=-.3, option_symbol='alternative')
        picks, rejects = forward.select_day0([a, b], {'AAPL': context('AAPL')})
        self.assertEqual(picks[0]['decision'], 'HOLD_CASH')
        self.assertEqual(rejects[0]['reason'], 'unaffordable_best_contract')

    def test_weighted_delta_dte_score(self):
        a = self.row()
        a.update(dte=7)
        b = dict(a, dte=14, put_delta=-.25, option_symbol='weighted-winner')
        picks, _ = forward.select_day0([a, b], {'AAPL': context('AAPL')})
        self.assertEqual(picks[0]['quote']['option_symbol'], 'weighted-winner')

    def test_spread_and_otm_filters(self):
        for changes in ({'ask': 3}, {'strike': 100}, {'put_delta': -.46}):
            r = self.row()
            r.update(changes)
            picks, _ = forward.select_day0([r], {'AAPL': context('AAPL')})
            self.assertEqual(picks[0]['decision'], 'HOLD_CASH')

    def test_provider_read_only_allowlist(self):
        with self.assertRaisesRegex(ValueError, 'not allowed'):
            data.Tradier('test').get('../accounts/orders')

    def test_provider_error_hides_token(self):
        from urllib.error import HTTPError
        token = 'SECRET-test-never-log'
        with patch.object(data, 'build_opener') as op:
            op.return_value.open.side_effect = HTTPError('url', 401, token, {}, None)
            with self.assertRaises(ValueError) as err:
                data.Tradier(token).get('clock')
        self.assertNotIn(token, str(err.exception))

    def test_frozen_source_files_unchanged(self):
        root = Path(__file__).resolve().parents[1]
        for path, expected in [('motu_forward/PROTOCOL.md', '4f36fd81b90318fc80ca6903348cd71b6111289c'),
                               ('motu_v06_small_capital.py', '4433edcb39b72ad46f7e5e54ffef0343d75d64d2')]:
            content = (root/path).read_bytes().replace(b'\r\n', b'\n')
            # Git blob hash, normalizing editor line endings.
            actual = hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()
            self.assertEqual(actual, expected)

    def test_contract_selection_against_actual_v06(self):
        import pandas as pd
        import random
        source = (Path(__file__).resolve().parents[1]/'motu_v06_small_capital.py').read_text()
        tree = ast.parse(source)
        node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'choose_put')
        scope = dict(pd=pd, DTE_LO=7, DTE_HI=21, PUT_DELTA=-.2, TARGET_DTE=14,
                     crosses_split=lambda *args: False)
        exec(compile(ast.Module(body=[node], type_ignores=[]), 'frozen-v06-choose-put', 'exec'), scope)
        rng = random.Random(62026)
        for trial in range(100):
            rows, old = [], []
            for i in range(20):
                r = self.row()
                r.update(strike=80+i, dte=rng.choice([6, 7, 14, 21, 22]),
                         put_delta=rng.uniform(-.5, -.01), bid=rng.uniform(.01, 2),
                         option_symbol=f'contract{i}')
                r['ask'] = r['bid'] + rng.uniform(0, 2)
                rows.append(r)
                old.append(dict(act_symbol='AAPL', call_put='put', delta=r['put_delta'],
                                dte=r['dte'], strike=r['strike'], bid=r['bid'], ask=r['ask'],
                                rel_spread=(r['ask']-r['bid'])/((r['ask']+r['bid'])/2),
                                expiration=pd.Timestamp(r['expiration']), id=r['option_symbol']))
            expected = scope['choose_put'](pd.DataFrame(old), 'AAPL', 100, pd.Timestamp(NOW))
            picks, _ = forward.select_day0(rows, {'AAPL': context('AAPL')})
            if expected is None:
                self.assertEqual(picks[0]['decision'], 'HOLD_CASH')
            else:
                self.assertEqual(picks[0]['quote']['option_symbol'], expected['id'])


if __name__ == '__main__':
    unittest.main()
