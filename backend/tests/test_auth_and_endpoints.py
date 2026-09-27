"""Backend auth + protected endpoints tests for MAD Mobilya ERP (Phase 1)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to reading frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
    except Exception:
        pass

API = f"{BASE_URL}/api"

ADMIN_USER = "admin"
ADMIN_PASS = "MadMobilya2026!"


def _bearer(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    assert data["user"]["role"] == "admin"
    # cookie set
    assert "access_token" in r.cookies or any("access_token" in c.name for c in r.cookies)
    return data["token"]


@pytest.fixture(scope="session")
def depo_user(admin_token):
    """Ensure a depo user exists we can log in as. Reuse depo1/depo1234."""
    # Try login with depo1/depo1234 first
    r = requests.post(f"{API}/auth/login", json={"username": "depo1", "password": "depo1234"}, timeout=15)
    if r.status_code == 200:
        return {"username": "depo1", "password": "depo1234", "id": r.json()["user"]["id"], "token": r.json()["token"]}
    # otherwise create fresh
    uname = f"TESTdepo_{uuid.uuid4().hex[:6]}"
    pwd = "depo1234"
    cr = requests.post(f"{API}/users", headers=_bearer(admin_token),
                       json={"username": uname, "password": pwd, "name": "Test Depo", "role": "depo"}, timeout=15)
    assert cr.status_code == 200, cr.text
    uid = cr.json()["id"]
    lr = requests.post(f"{API}/auth/login", json={"username": uname, "password": pwd}, timeout=15)
    assert lr.status_code == 200
    return {"username": uname, "password": pwd, "id": uid, "token": lr.json()["token"]}


# ---------- AUTH ----------
class TestAuth:
    def test_login_success(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 20

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_dashboard_no_token_401(self):
        r = requests.get(f"{API}/dashboard", timeout=15)
        assert r.status_code == 401

    def test_dashboard_with_token(self, admin_token):
        r = requests.get(f"{API}/dashboard", headers=_bearer(admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "stats" in data and "materials" in data and "products" in data and "orders" in data

    def test_me_returns_no_password_hash(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=_bearer(admin_token), timeout=15)
        assert r.status_code == 200
        u = r.json()
        assert u["username"] == "admin"
        assert u["role"] == "admin"
        assert "password_hash" not in u

    def test_root_public(self):
        r = requests.get(f"{API}/", timeout=15)
        assert r.status_code == 200


# ---------- USER MGMT ----------
class TestUsers:
    def test_list_users_admin(self, admin_token):
        r = requests.get(f"{API}/users", headers=_bearer(admin_token), timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        assert any(u["username"] == "admin" for u in arr)
        for u in arr:
            assert "password_hash" not in u

    def test_list_users_non_admin_forbidden(self, depo_user):
        r = requests.get(f"{API}/users", headers=_bearer(depo_user["token"]), timeout=15)
        assert r.status_code == 403

    def test_create_user_and_duplicate(self, admin_token):
        uname = f"TESTuser_{uuid.uuid4().hex[:6]}"
        payload = {"username": uname, "password": "pass1234", "name": "Test User", "role": "muhasebe"}
        r = requests.post(f"{API}/users", headers=_bearer(admin_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        # duplicate
        r2 = requests.post(f"{API}/users", headers=_bearer(admin_token), json=payload, timeout=15)
        assert r2.status_code == 409
        # cleanup
        requests.delete(f"{API}/users/{uid}", headers=_bearer(admin_token), timeout=15)

    def test_update_user_password_and_relogin(self, admin_token):
        uname = f"TESTupd_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/users", headers=_bearer(admin_token),
                          json={"username": uname, "password": "old12345", "role": "muhasebe"}, timeout=15)
        assert r.status_code == 200
        uid = r.json()["id"]
        # update name, role, active, password
        pr = requests.patch(f"{API}/users/{uid}", headers=_bearer(admin_token),
                            json={"name": "Yeni Ad", "role": "depo", "active": True, "password": "new12345"}, timeout=15)
        assert pr.status_code == 200
        assert pr.json()["name"] == "Yeni Ad"
        assert pr.json()["role"] == "depo"
        # login with new password
        lr = requests.post(f"{API}/auth/login", json={"username": uname, "password": "new12345"}, timeout=15)
        assert lr.status_code == 200
        # old password fails
        lr2 = requests.post(f"{API}/auth/login", json={"username": uname, "password": "old12345"}, timeout=15)
        assert lr2.status_code == 401
        # cleanup
        requests.delete(f"{API}/users/{uid}", headers=_bearer(admin_token), timeout=15)

    def test_delete_self_forbidden(self, admin_token):
        me = requests.get(f"{API}/auth/me", headers=_bearer(admin_token), timeout=15).json()
        r = requests.delete(f"{API}/users/{me['id']}", headers=_bearer(admin_token), timeout=15)
        assert r.status_code == 400

    def test_delete_user_success(self, admin_token):
        uname = f"TESTdel_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/users", headers=_bearer(admin_token),
                          json={"username": uname, "password": "pass1234", "role": "montaj"}, timeout=15)
        uid = r.json()["id"]
        dr = requests.delete(f"{API}/users/{uid}", headers=_bearer(admin_token), timeout=15)
        assert dr.status_code == 200


# ---------- ROLE MATRIX ----------
class TestRoleAccess:
    @pytest.fixture(scope="class")
    def muhasebe_token(self, admin_token):
        uname = f"TESTmuh_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/users", headers=_bearer(admin_token),
                          json={"username": uname, "password": "pass1234", "role": "muhasebe"}, timeout=15)
        assert r.status_code == 200
        uid = r.json()["id"]
        lr = requests.post(f"{API}/auth/login", json={"username": uname, "password": "pass1234"}, timeout=15)
        yield lr.json()["token"]
        requests.delete(f"{API}/users/{uid}", headers=_bearer(admin_token), timeout=15)

    def test_muhasebe_can_access_common_endpoints(self, muhasebe_token):
        for ep in ["/dashboard", "/materials", "/products", "/orders", "/customers/summary"]:
            r = requests.get(f"{API}{ep}", headers=_bearer(muhasebe_token), timeout=15)
            assert r.status_code == 200, f"{ep} -> {r.status_code}"

    def test_muhasebe_cannot_access_users(self, muhasebe_token):
        r = requests.get(f"{API}/users", headers=_bearer(muhasebe_token), timeout=15)
        assert r.status_code == 403


# ---------- LEGACY ENDPOINTS WITH BEARER ----------
class TestLegacyEndpoints:
    def test_materials_crud(self, admin_token):
        h = _bearer(admin_token)
        r = requests.post(f"{API}/materials", headers=h,
                          json={"name": "TEST Malzeme", "category": "Ahşap", "unit": "m²",
                                "stock": 10, "min_stock": 2, "unit_cost": 100}, timeout=15)
        assert r.status_code == 200
        mid = r.json()["id"]
        g = requests.get(f"{API}/materials", headers=h, timeout=15)
        assert g.status_code == 200 and any(m["id"] == mid for m in g.json())
        p = requests.patch(f"{API}/materials/{mid}", headers=h, json={"stock": 20}, timeout=15)
        assert p.status_code == 200 and p.json()["stock"] == 20

    def test_products_and_configurator(self, admin_token):
        h = _bearer(admin_token)
        # seed materials (idempotent)
        s = requests.post(f"{API}/configurator/seed-materials", headers=h, timeout=15)
        assert s.status_code == 200
        # templates
        t = requests.get(f"{API}/configurator/templates", headers=h, timeout=15)
        assert t.status_code == 200 and "templates" in t.json()
        # estimate
        tmpl = t.json()["templates"][0]
        dims = {k: v.get("default", 100) for k, v in tmpl.get("dims", {}).items()}
        e = requests.post(f"{API}/configurator/estimate", headers=h,
                          json={"product_type": tmpl["key"], "dims": dims,
                                "options": {}, "labor": 500, "margin": 40}, timeout=15)
        assert e.status_code == 200, e.text
        assert "suggested_price" in e.json()
        # products list
        pl = requests.get(f"{API}/products", headers=h, timeout=15)
        assert pl.status_code == 200

    def test_orders_and_transactions(self, admin_token):
        h = _bearer(admin_token)
        # create order
        o = requests.post(f"{API}/orders", headers=h,
                          json={"name": "TEST Sipariş", "customer": "Test", "quantity": 1,
                                "amount": 1000, "status": "Planlandı"}, timeout=15)
        assert o.status_code == 200
        oid = o.json()["id"]
        pr = requests.patch(f"{API}/orders/{oid}", headers=h, json={"status": "Üretimde"}, timeout=15)
        assert pr.status_code == 200
        # transactions
        t = requests.post(f"{API}/transactions", headers=h,
                          json={"type": "sale", "description": "TEST Satış", "amount": 500}, timeout=15)
        assert t.status_code == 200
        gt = requests.get(f"{API}/transactions", headers=h, timeout=15)
        assert gt.status_code == 200

    def test_customers_flow(self, admin_token):
        h = _bearer(admin_token)
        c = requests.post(f"{API}/customers", headers=h,
                          json={"name": "TEST Müşteri", "phone": "555"}, timeout=15)
        assert c.status_code == 200
        cid = c.json()["id"]
        cs = requests.post(f"{API}/customers/{cid}/credit-sales", headers=h,
                           json={"description": "TEST kredi", "amount": 1000, "due_date": "31.12.2026"}, timeout=15)
        assert cs.status_code == 200
        cp = requests.post(f"{API}/customers/{cid}/payments", headers=h,
                           json={"amount": 400, "payment_method": "Nakit"}, timeout=15)
        assert cp.status_code == 200
        summary = requests.get(f"{API}/customers/summary", headers=h, timeout=15)
        assert summary.status_code == 200
        hist = requests.get(f"{API}/customers/{cid}/history", headers=h, timeout=15)
        assert hist.status_code == 200
        totals = hist.json()["totals"]
        assert totals["purchases"] >= 1000 and totals["paid"] >= 400


# ---------- ADMIN IDEMPOTENCY ----------
class TestAdminIdempotency:
    def test_only_one_admin_user(self, admin_token):
        r = requests.get(f"{API}/users", headers=_bearer(admin_token), timeout=15)
        assert r.status_code == 200
        admins = [u for u in r.json() if u["username"] == "admin"]
        assert len(admins) == 1
