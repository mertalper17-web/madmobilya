"""Phase 3 regression tests — quotes, assembly, bayi role, custom access."""
import os
import io
import time
import requests
import pytest

BASE = os.environ.get('REACT_APP_BACKEND_URL', 'https://stock-expense-hub-2.preview.emergentagent.com').rstrip('/')
API = f"{BASE}/api"

ADMIN = ("admin", "MadMobilya2026!")
MONTAJ = ("montaj1", "montaj1234")
BAYI = ("bayi1", "bayi1234")


def _login(cred):
    r = requests.post(f"{API}/auth/login", json={"username": cred[0], "password": cred[1]}, timeout=15)
    assert r.status_code == 200, f"login failed for {cred[0]}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def montaj_h():
    return {"Authorization": f"Bearer {_login(MONTAJ)}"}


@pytest.fixture(scope="module")
def bayi_h():
    return {"Authorization": f"Bearer {_login(BAYI)}"}


# ---- Roles / auth ----
class TestRoles:
    def test_admin_me(self, admin_h):
        r = requests.get(f"{API}/auth/me", headers=admin_h)
        assert r.status_code == 200 and r.json()["role"] == "admin"

    def test_montaj_me(self, montaj_h):
        r = requests.get(f"{API}/auth/me", headers=montaj_h)
        assert r.status_code == 200 and r.json()["role"] == "montaj"

    def test_bayi_me(self, bayi_h):
        r = requests.get(f"{API}/auth/me", headers=bayi_h)
        assert r.status_code == 200 and r.json()["role"] == "bayi"

    def test_montaj_cannot_create_quote(self, montaj_h):
        r = requests.post(f"{API}/quotes", headers=montaj_h, json={
            "name": "TEST_x", "product_type": "gardirop",
            "dims": {"w": 200, "h": 220, "d": 60}
        })
        assert r.status_code == 403

    def test_bayi_cannot_create_assembly(self, bayi_h):
        r = requests.post(f"{API}/assembly", headers=bayi_h, json={"order_name": "TEST_x"})
        assert r.status_code == 403


# ---- Quotes ----
class TestQuotes:
    quote_id = None

    def test_create_quote(self, admin_h):
        r = requests.post(f"{API}/quotes", headers=admin_h, json={
            "name": "TEST_Gardirop Teklif",
            "customer_name": "TEST_Musteri",
            "customer_phone": "05001112233",
            "customer_address": "Test Adres 1",
            "product_type": "gardirop",
            "dims": {"w": 200, "h": 220, "d": 60},
            "options": {},
            "labor": 0, "margin": 40,
            "discount_rate": 15, "discount_name": "Bayi"
        })
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["quote_no"].startswith("TKF-")
        assert q["status"] == "Taslak"
        assert q["discount_rate"] == 15
        assert q["final_price"] < q["suggested_price"]
        TestQuotes.quote_id = q["id"]

    def test_list_quotes_contains(self, admin_h):
        r = requests.get(f"{API}/quotes", headers=admin_h)
        assert r.status_code == 200
        assert any(q["id"] == TestQuotes.quote_id for q in r.json())

    def test_patch_status(self, admin_h):
        r = requests.patch(f"{API}/quotes/{TestQuotes.quote_id}", headers=admin_h,
                           json={"status": "Gönderildi"})
        assert r.status_code == 200 and r.json()["status"] == "Gönderildi"

    def test_bayi_can_patch(self, bayi_h):
        r = requests.patch(f"{API}/quotes/{TestQuotes.quote_id}", headers=bayi_h,
                           json={"status": "Taslak"})
        assert r.status_code == 200

    def test_convert_quote(self, admin_h):
        r = requests.post(f"{API}/quotes/{TestQuotes.quote_id}/convert", headers=admin_h)
        assert r.status_code == 200, r.text
        order = r.json()["order"]
        assert order["from_quote"].startswith("TKF-")
        # verify quote updated
        q = requests.get(f"{API}/quotes", headers=admin_h).json()
        me = next(x for x in q if x["id"] == TestQuotes.quote_id)
        assert me["status"] == "Onaylandı"
        assert me["converted_order_id"] == order["id"]

    def test_convert_twice_blocked(self, admin_h):
        r = requests.post(f"{API}/quotes/{TestQuotes.quote_id}/convert", headers=admin_h)
        assert r.status_code in (400, 409)

    def test_delete_quote(self, admin_h):
        # create disposable quote
        r = requests.post(f"{API}/quotes", headers=admin_h, json={
            "name": "TEST_del", "product_type": "gardirop",
            "dims": {"w": 200, "h": 220, "d": 60}
        })
        qid = r.json()["id"]
        d = requests.delete(f"{API}/quotes/{qid}", headers=admin_h)
        assert d.status_code == 200


# ---- Assembly ----
class TestAssembly:
    job_id = None

    def test_create_assembly(self, admin_h):
        r = requests.post(f"{API}/assembly", headers=admin_h, json={
            "order_name": "TEST_Montaj", "customer": "TEST_Cust",
            "address": "TEST_Addr", "note": "TEST_note"
        })
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["status"] == "Bekliyor" and j["photos"] == []
        TestAssembly.job_id = j["id"]

    def test_montaj_advance(self, montaj_h):
        r = requests.patch(f"{API}/assembly/{TestAssembly.job_id}", headers=montaj_h,
                           json={"status": "Başladı"})
        assert r.status_code == 200
        assert r.json()["status"] == "Başladı" and r.json()["started_at"]

    def test_montaj_complete(self, montaj_h):
        r = requests.patch(f"{API}/assembly/{TestAssembly.job_id}", headers=montaj_h,
                           json={"status": "Tamamlandı"})
        assert r.status_code == 200
        assert r.json()["status"] == "Tamamlandı" and r.json()["completed_at"]

    def test_upload_photo_and_download(self, montaj_h):
        # tiny PNG
        png = bytes.fromhex(
            "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489"
            "0000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
        )
        files = {"file": ("t.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{API}/assembly/{TestAssembly.job_id}/photos?caption=TEST_",
                          headers=montaj_h, files=files)
        assert r.status_code == 200, r.text
        path = r.json()["storage_path"]
        # download
        d = requests.get(f"{API}/files/{path}", headers=montaj_h)
        assert d.status_code == 200
        assert d.headers["content-type"].startswith("image/")

    def test_duplicate_order_assembly_blocked(self, admin_h):
        # Create a quote → convert to order → send to assembly twice
        q = requests.post(f"{API}/quotes", headers=admin_h, json={
            "name": "TEST_Dup", "product_type": "gardirop",
            "dims": {"w": 200, "h": 220, "d": 60}
        }).json()
        order = requests.post(f"{API}/quotes/{q['id']}/convert", headers=admin_h).json()["order"]
        r1 = requests.post(f"{API}/assembly", headers=admin_h, json={
            "order_id": order["id"], "order_name": order["name"]
        })
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/assembly", headers=admin_h, json={
            "order_id": order["id"], "order_name": order["name"]
        })
        assert r2.status_code == 409


# ---- Custom access override ----
class TestCustomAccess:
    def test_create_user_with_access(self, admin_h):
        uname = f"TEST_acc_{int(time.time())}"
        r = requests.post(f"{API}/users", headers=admin_h, json={
            "username": uname, "password": "pw12345",
            "role": "muhasebe", "access": ["dashboard", "quotes"]
        })
        assert r.status_code == 200, r.text
        assert r.json()["access"] == ["dashboard", "quotes"]
        uid = r.json()["id"]
        # patch access
        p = requests.patch(f"{API}/users/{uid}", headers=admin_h, json={"access": ["dashboard"]})
        assert p.status_code == 200 and p.json()["access"] == ["dashboard"]
        # login and confirm
        tok = _login((uname, "pw12345"))
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}).json()
        assert me["role"] == "muhasebe" and me.get("access") == ["dashboard"]
        # cleanup
        requests.delete(f"{API}/users/{uid}", headers=admin_h)
