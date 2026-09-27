import os
import uuid
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


def test_customer_credit_sale_payment_summary_persists():
    suffix = uuid.uuid4().hex[:8]
    customer = requests.post(f"{BASE_URL}/api/customers", json={
        "name": f"TEST_customer_{suffix}", "phone": "5550000000"
    }, timeout=20)
    assert customer.status_code == 200
    customer_data = customer.json()
    assert customer_data["name"].startswith("TEST_customer_")
    customer_id = customer_data["id"]

    sale = requests.post(f"{BASE_URL}/api/customers/{customer_id}/credit-sales", json={
        "description": "TEST masa", "amount": 12000, "due_date": "2027-01-15", "promissory_no": f"S-{suffix}"
    }, timeout=20)
    assert sale.status_code == 200
    assert sale.json()["customer_id"] == customer_id

    payment = requests.post(f"{BASE_URL}/api/customers/{customer_id}/payments", json={
        "amount": 2500, "payment_method": "Havale / EFT", "note": "TEST ödeme"
    }, timeout=20)
    assert payment.status_code == 200
    assert payment.json()["customer_id"] == customer_id

    summary = requests.get(f"{BASE_URL}/api/customers/summary", timeout=20)
    assert summary.status_code == 200
    row = next(x for x in summary.json()["customers"] if x["id"] == customer_id)
    assert row["total_purchases"] == 12000
    assert row["total_paid"] == 2500
    assert row["balance"] == 9500