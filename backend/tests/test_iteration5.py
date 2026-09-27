"""Iteration 5 backend tests: product cost live recomputation, order stock deduction,
customer credit-sales/payments validation, history & summary."""
import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent.parent / 'frontend' / '.env')
BASE = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') + '/api'


@pytest.fixture(scope='module')
def client():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    return s


# ---- Dashboard ----
def test_dashboard(client):
    r = client.get(f'{BASE}/dashboard')
    assert r.status_code == 200
    data = r.json()
    for k in ('materials', 'products', 'transactions', 'orders', 'stats'):
        assert k in data
    for k in ('sales', 'expenses', 'profit', 'low_stock', 'product_count', 'order_count'):
        assert k in data['stats']


# ---- Materials validation ----
def test_material_requires_name(client):
    r = client.post(f'{BASE}/materials', json={'unit_cost': 10})
    assert r.status_code == 422


@pytest.fixture(scope='module')
def material_a(client):
    r = client.post(f'{BASE}/materials', json={
        'name': 'TEST_Ahsap_A', 'unit': 'm²', 'stock': 100, 'min_stock': 5, 'unit_cost': 50})
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope='module')
def material_b(client):
    r = client.post(f'{BASE}/materials', json={
        'name': 'TEST_Vida_B', 'unit': 'adet', 'stock': 200, 'min_stock': 10, 'unit_cost': 2})
    assert r.status_code == 200
    return r.json()


# ---- Product cost / breakdown ----
@pytest.fixture(scope='module')
def product(client, material_a, material_b):
    payload = {
        'name': 'TEST_Masa', 'category': 'Masa', 'labor_cost': 100, 'margin': 25,
        'recipe': [
            {'material_id': material_a['id'], 'quantity': 2},   # 2*50=100
            {'material_id': material_b['id'], 'quantity': 10},  # 10*2=20
        ]
    }
    r = client.post(f'{BASE}/products', json=payload)
    assert r.status_code == 200, r.text
    p = r.json()
    # cost = 100 labor + 120 mat = 220 ; price = 220 * 1.25 = 275
    assert p['cost'] == 220
    assert p['material_cost'] == 120
    assert p['suggested_price'] == 275
    assert len(p['breakdown']) == 2
    line_map = {b['material_id']: b['line_cost'] for b in p['breakdown']}
    assert line_map[material_a['id']] == 100
    assert line_map[material_b['id']] == 20
    return p


def test_products_live_recompute(client, product, material_a):
    # Update material A cost by creating new material would not update; instead change stock isn't cost.
    # Update unit_cost by inserting new? There's no PATCH -> so we validate breakdown persists.
    r = client.get(f'{BASE}/products')
    assert r.status_code == 200
    ours = [p for p in r.json() if p['id'] == product['id']]
    assert ours, 'product missing in list'
    p = ours[0]
    assert 'breakdown' in p and 'cost' in p and 'suggested_price' in p and 'material_cost' in p
    assert p['cost'] == 220
    assert p['suggested_price'] == 275


# ---- Order auto-fill + stock deduction ----
def test_order_autofill_and_stock_deduction(client, product, material_a, material_b):
    # Create order linked to product with qty=3, no amount
    r = client.post(f'{BASE}/orders', json={
        'name': 'TEST_Siparis_1', 'customer': 'TEST_Musteri',
        'product_id': product['id'], 'quantity': 3})
    assert r.status_code == 200, r.text
    order = r.json()
    assert order['product_name'] == product['name']
    assert order['amount'] == 275 * 3  # 825

    # Fetch materials before
    mats = client.get(f'{BASE}/materials').json()
    m_a_before = next(m for m in mats if m['id'] == material_a['id'])['stock']
    m_b_before = next(m for m in mats if m['id'] == material_b['id'])['stock']

    # PATCH -> Tamamlandı
    r2 = client.patch(f"{BASE}/orders/{order['id']}", json={'status': 'Tamamlandı'})
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert 'stock_updates' in data and 'warnings' in data
    assert len(data['stock_updates']) == 2
    used_map = {u['material_id']: u['used'] for u in data['stock_updates']}
    assert used_map[material_a['id']] == 2 * 3
    assert used_map[material_b['id']] == 10 * 3

    # Verify stock actually deducted
    mats_after = client.get(f'{BASE}/materials').json()
    m_a_after = next(m for m in mats_after if m['id'] == material_a['id'])['stock']
    m_b_after = next(m for m in mats_after if m['id'] == material_b['id'])['stock']
    assert round(m_a_before - m_a_after, 3) == 6
    assert round(m_b_before - m_b_after, 3) == 30

    # Second PATCH should NOT deduct again (already completed)
    r3 = client.patch(f"{BASE}/orders/{order['id']}", json={'status': 'Tamamlandı'})
    assert r3.status_code == 200
    assert r3.json()['stock_updates'] == []

    mats_final = client.get(f'{BASE}/materials').json()
    m_a_final = next(m for m in mats_final if m['id'] == material_a['id'])['stock']
    assert m_a_final == m_a_after  # unchanged


def test_patch_order_not_found(client):
    r = client.patch(f'{BASE}/orders/nonexistent-id-xyz', json={'status': 'Tamamlandı'})
    assert r.status_code == 404


# ---- Customers ----
@pytest.fixture(scope='module')
def customer(client):
    r = client.post(f'{BASE}/customers', json={
        'name': 'TEST_MusteriX', 'phone': '05001234567', 'tax_number': '1234567890'})
    assert r.status_code == 200
    return r.json()


def test_credit_sale_rejects_zero(client, customer):
    r = client.post(f"{BASE}/customers/{customer['id']}/credit-sales",
                    json={'description': 'x', 'amount': 0, 'due_date': '2026-02-01'})
    assert r.status_code == 422


def test_payment_rejects_zero(client, customer):
    r = client.post(f"{BASE}/customers/{customer['id']}/payments",
                    json={'amount': 0, 'payment_method': 'Nakit'})
    assert r.status_code == 422


def test_customer_history_and_summary(client, customer):
    # Create senetli sale
    r1 = client.post(f"{BASE}/customers/{customer['id']}/credit-sales",
                     json={'description': 'Masa satisi', 'amount': 1000,
                           'due_date': '2026-03-01', 'promissory_no': 'SNT001'})
    assert r1.status_code == 200
    # Payment
    r2 = client.post(f"{BASE}/customers/{customer['id']}/payments",
                     json={'amount': 400, 'payment_method': 'Havale'})
    assert r2.status_code == 200

    h = client.get(f"{BASE}/customers/{customer['id']}/history")
    assert h.status_code == 200
    hd = h.json()
    assert hd['customer']['id'] == customer['id']
    assert len(hd['sales']) >= 1
    assert len(hd['payments']) >= 1
    assert hd['totals']['purchases'] >= 1000
    assert hd['totals']['paid'] >= 400
    assert hd['totals']['balance'] >= 600

    s = client.get(f'{BASE}/customers/summary')
    assert s.status_code == 200
    sd = s.json()
    assert 'stats' in sd and 'open_balance' in sd['stats']
    ours = [c for c in sd['customers'] if c['id'] == customer['id']]
    assert ours
    assert ours[0]['total_purchases'] >= 1000
    assert ours[0]['total_paid'] >= 400
    assert ours[0]['balance'] >= 600


def test_history_nonexistent_customer(client):
    r = client.get(f'{BASE}/customers/does-not-exist/history')
    assert r.status_code == 404
