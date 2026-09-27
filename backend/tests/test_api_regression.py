import os
import uuid
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://stock-expense-hub-2.preview.emergentagent.com").rstrip("/")


def test_dashboard_shape():
    response = requests.get(f"{BASE_URL}/api/dashboard", timeout=20)
    assert response.status_code == 200
    data = response.json()
    assert {"materials", "products", "transactions", "orders", "stats"}.issubset(data)
    assert {"sales", "expenses", "profit", "low_stock", "product_count", "order_count"}.issubset(data["stats"])


def test_material_create_and_get():
    name = f"TEST_material_{uuid.uuid4().hex[:8]}"
    payload = {"name": name, "unit": "m²", "stock": 12, "min_stock": 3, "unit_cost": 125.5}
    created = requests.post(f"{BASE_URL}/api/materials", json=payload, timeout=20)
    assert created.status_code == 200
    data = created.json()
    assert data["name"] == name and data["unit_cost"] == 125.5 and "_id" not in data
    listed = requests.get(f"{BASE_URL}/api/materials", timeout=20)
    assert listed.status_code == 200
    assert any(x.get("id") == data["id"] for x in listed.json())


def test_product_cost_and_suggested_price():
    material = requests.post(f"{BASE_URL}/api/materials", json={"name": f"TEST_cost_{uuid.uuid4().hex[:8]}", "unit_cost": 100}, timeout=20).json()
    payload = {"name": f"TEST_product_{uuid.uuid4().hex[:8]}", "labor_cost": 50, "margin": 30,
               "recipe": [{"material_id": material["id"], "quantity": 2}]}
    response = requests.post(f"{BASE_URL}/api/products", json=payload, timeout=20)
    assert response.status_code == 200
    data = response.json()
    assert data["cost"] == 250 and data["suggested_price"] == 325


def test_transaction_and_order_posts():
    sale = requests.post(f"{BASE_URL}/api/transactions", json={"type": "sale", "description": f"TEST_sale_{uuid.uuid4().hex[:8]}", "amount": 999}, timeout=20)
    assert sale.status_code == 200 and sale.json()["date"]
    order = requests.post(f"{BASE_URL}/api/orders", json={"name": f"TEST_order_{uuid.uuid4().hex[:8]}", "amount": 500}, timeout=20)
    assert order.status_code == 200 and "id" in order.json()