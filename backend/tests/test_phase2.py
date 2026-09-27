"""Phase 2 backend tests: stock entries, price history, low-stock, orders summary, discount tiers."""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://stock-expense-hub-2.preview.emergentagent.com').rstrip('/')
ADMIN_USER = os.environ.get('ADMIN_USERNAME', 'admin')
ADMIN_PW = os.environ.get('ADMIN_PASSWORD', 'MadMobilya2026!')


@pytest.fixture(scope='session')
def token():
    r = requests.post(f'{BASE_URL}/api/auth/login',
                      json={'username': ADMIN_USER, 'password': ADMIN_PW}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()['token']


@pytest.fixture(scope='session')
def client(token):
    s = requests.Session()
    s.headers.update({'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
    return s


# ---------- Stock entry & price history ----------
class TestStockEntryFlow:
    @pytest.fixture(scope='class')
    def material(self, client):
        r = client.post(f'{BASE_URL}/api/materials', json={
            'name': f'TEST_MAT_{uuid.uuid4().hex[:6]}',
            'category': 'Ahşap', 'unit': 'adet',
            'stock': 5, 'min_stock': 2, 'unit_cost': 100, 'supplier': 'Init',
        })
        assert r.status_code == 200, r.text
        return r.json()

    def test_stock_entry_increases_stock_and_updates_cost(self, client, material):
        r = client.post(f'{BASE_URL}/api/materials/{material["id"]}/stock-entries', json={
            'quantity': 10, 'unit_cost': 120, 'supplier': 'TESTSupplier', 'note': 'ilk giriş',
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data['stock'] == 15  # 5 + 10
        assert data['unit_cost'] == 120
        # verify material reflects new stock & cost
        m = client.get(f'{BASE_URL}/api/materials').json()
        me = next(x for x in m if x['id'] == material['id'])
        assert me['stock'] == 15
        assert me['unit_cost'] == 120
        assert me['supplier'] == 'TESTSupplier'

    def test_list_stock_entries(self, client, material):
        r = client.get(f'{BASE_URL}/api/materials/{material["id"]}/stock-entries')
        assert r.status_code == 200
        entries = r.json()
        assert len(entries) >= 1
        assert entries[0]['quantity'] == 10
        assert entries[0]['unit_cost'] == 120

    def test_price_history_recorded(self, client, material):
        r = client.get(f'{BASE_URL}/api/materials/{material["id"]}/price-history')
        assert r.status_code == 200
        prices = r.json()
        assert len(prices) >= 1
        p = prices[0]
        assert p['old_cost'] == 100 and p['new_cost'] == 120
        assert p['source'] == 'stock_entry'

    def test_stock_entry_without_cost_keeps_cost(self, client, material):
        r = client.post(f'{BASE_URL}/api/materials/{material["id"]}/stock-entries', json={
            'quantity': 5, 'note': 'no cost',
        })
        assert r.status_code == 200
        assert r.json()['stock'] == 20
        assert r.json()['unit_cost'] == 120  # unchanged

    def test_manual_edit_logs_price_history(self, client, material):
        r = client.patch(f'{BASE_URL}/api/materials/{material["id"]}', json={'unit_cost': 150})
        assert r.status_code == 200
        prices = client.get(f'{BASE_URL}/api/materials/{material["id"]}/price-history').json()
        manual = [p for p in prices if p['source'] == 'manual']
        assert len(manual) >= 1
        assert manual[0]['old_cost'] == 120 and manual[0]['new_cost'] == 150

    def test_stock_entry_404(self, client):
        r = client.post(f'{BASE_URL}/api/materials/nope/stock-entries', json={'quantity': 1})
        assert r.status_code == 404


# ---------- Low stock ----------
def test_low_stock_endpoint(client):
    # ensure at least one low-stock material
    m = client.post(f'{BASE_URL}/api/materials', json={
        'name': f'TEST_LOW_{uuid.uuid4().hex[:6]}', 'unit': 'adet',
        'stock': 1, 'min_stock': 5, 'unit_cost': 10,
    }).json()
    r = client.get(f'{BASE_URL}/api/materials/low-stock')
    assert r.status_code == 200
    data = r.json()
    assert 'materials' in data and 'count' in data
    assert any(x['id'] == m['id'] for x in data['materials'])
    assert data['count'] == len(data['materials'])


# ---------- Orders summary & deadlines ----------
class TestOrdersSummary:
    def _create(self, client, due_offset_days=None, name='TEST_ORD'):
        due = ''
        if due_offset_days is not None:
            due = (datetime.now(timezone.utc).date() + timedelta(days=due_offset_days)).isoformat()
        payload = {'name': f'{name}_{uuid.uuid4().hex[:5]}', 'customer': 'TESTC',
                   'quantity': 1, 'amount': 1000, 'due_date': due, 'status': 'Planlandı'}
        r = client.post(f'{BASE_URL}/api/orders', json=payload)
        assert r.status_code == 200, r.text
        return r.json()

    def test_overdue_and_due_soon_buckets(self, client):
        overdue = self._create(client, due_offset_days=-2, name='TEST_OVERDUE')
        soon = self._create(client, due_offset_days=2, name='TEST_SOON')
        far = self._create(client, due_offset_days=30, name='TEST_FAR')

        r = client.get(f'{BASE_URL}/api/orders/summary')
        assert r.status_code == 200
        s = r.json()
        assert 'stats' in s
        ids_overdue = {o['id'] for o in s['overdue']}
        ids_soon = {o['id'] for o in s['due_soon']}
        ids_active = {o['id'] for o in s['active']}
        assert overdue['id'] in ids_overdue
        assert soon['id'] in ids_soon
        assert far['id'] in ids_active
        assert far['id'] not in ids_overdue and far['id'] not in ids_soon
        # days_left computed
        soon_row = next(o for o in s['active'] if o['id'] == soon['id'])
        assert soon_row['days_left'] == 2


# ---------- Discount tiers ----------
class TestDiscounts:
    def test_seed_has_four(self, client):
        r = client.get(f'{BASE_URL}/api/discounts')
        assert r.status_code == 200
        names = {d['name'] for d in r.json()}
        for expected in ['Bayi', 'Şube', 'Personel', 'Özel Durum']:
            assert expected in names, f'missing seeded discount {expected}'

    def test_crud(self, client):
        # create
        r = client.post(f'{BASE_URL}/api/discounts', json={
            'name': f'TEST_DISC_{uuid.uuid4().hex[:5]}', 'rate': 12.5, 'description': 't'})
        assert r.status_code == 200
        d = r.json()
        did = d['id']
        assert d['rate'] == 12.5 and d['active'] is True
        # update rate
        r = client.patch(f'{BASE_URL}/api/discounts/{did}', json={'rate': 17})
        assert r.status_code == 200 and r.json()['rate'] == 17
        # toggle active
        r = client.patch(f'{BASE_URL}/api/discounts/{did}', json={'active': False})
        assert r.status_code == 200 and r.json()['active'] is False
        # delete
        r = client.delete(f'{BASE_URL}/api/discounts/{did}')
        assert r.status_code == 200
        # confirm gone
        r = client.delete(f'{BASE_URL}/api/discounts/{did}')
        assert r.status_code == 404


# ---------- Discount applied on order / estimate ----------
def test_order_with_discount_stores_net_amount(client):
    r = client.post(f'{BASE_URL}/api/orders', json={
        'name': f'TEST_DISC_ORDER_{uuid.uuid4().hex[:5]}', 'customer': 'X',
        'quantity': 1, 'amount': 1000, 'discount_rate': 20, 'discount_name': 'Personel',
        'status': 'Planlandı',
    })
    assert r.status_code == 200, r.text
    o = r.json()
    assert o['amount'] == 800.0
    assert o['gross_amount'] == 1000.0
    assert o['discount_rate'] == 20


def test_configurator_estimate_with_discount(client):
    # get any template
    tpls = client.get(f'{BASE_URL}/api/configurator/templates').json()['templates']
    assert tpls
    tpl = tpls[0]
    dims = {k: v['default'] for k, v in tpl['dims'].items()}
    options = {op['key']: op.get('default', False if op['type'] == 'bool' else 0) for op in tpl['options']}
    # ensure seeded materials
    client.post(f'{BASE_URL}/api/configurator/seed-materials')
    r = client.post(f'{BASE_URL}/api/configurator/estimate', json={
        'product_type': tpl['key'], 'dims': dims, 'options': options,
        'labor': 500, 'margin': 40, 'discount_rate': 25,
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert 'final_price' in data and 'discount_amount' in data
    expected_final = round(data['suggested_price'] * 0.75, 2)
    assert abs(data['final_price'] - expected_final) < 0.02
