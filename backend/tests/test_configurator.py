"""Tests for parametric configurator module."""
import os
import requests
import pytest

def _load_url():
    v = os.environ.get('REACT_APP_BACKEND_URL')
    if not v:
        # read from frontend/.env
        try:
            with open('/app/frontend/.env') as f:
                for line in f:
                    if line.startswith('REACT_APP_BACKEND_URL='):
                        v = line.split('=', 1)[1].strip()
                        break
        except Exception:
            pass
    if not v:
        raise RuntimeError("REACT_APP_BACKEND_URL not set")
    return v.rstrip('/') + '/api'

BASE_URL = _load_url()

EXPECTED_TYPES = {"gardirop", "mutfak", "tv_unitesi", "kitaplik", "komodin", "yatak_basligi"}
GARDIROP_EXPECTED_ROLES = {
    "mdf_govde", "mdf_kapak", "ayna", "arka_panel", "ic_raf", "kenar_bant",
    "mentese", "lamello", "vida", "kulp", "askibar", "cekmece_rayi",
    "cekmece_kutu", "led", "pantolon_askisi",
}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Templates ----------
def test_templates_returns_six(session):
    r = session.get(f"{BASE_URL}/configurator/templates")
    assert r.status_code == 200
    data = r.json()
    templates = data["templates"]
    assert len(templates) == 6
    keys = {t["key"] for t in templates}
    assert keys == EXPECTED_TYPES
    for t in templates:
        assert "dims" in t and set(t["dims"].keys()) >= {"w", "h", "d"}
        assert "options" in t and isinstance(t["options"], list)
        assert "default_labor" in t and t["default_labor"] > 0
        assert "default_margin" in t and t["default_margin"] > 0


# ---------- Seed materials (idempotent) ----------
def test_seed_materials_idempotent(session):
    r1 = session.post(f"{BASE_URL}/configurator/seed-materials", json={})
    assert r1.status_code == 200
    first = r1.json()
    assert "count" in first and "added" in first
    # Second call must not add more (roles already exist)
    r2 = session.post(f"{BASE_URL}/configurator/seed-materials", json={})
    assert r2.status_code == 200
    second = r2.json()
    assert second["count"] == 0
    # verify role field is present in materials
    mats = session.get(f"{BASE_URL}/materials").json()
    roles = {m.get("role") for m in mats if m.get("role")}
    required = {"mdf_govde", "mdf_kapak", "ayna", "led", "pantolon_askisi",
                "cekmece_kutu", "kravat_askisi", "ayakkabilik"}
    assert required.issubset(roles), f"missing: {required - roles}"


# ---------- Estimate: gardirop with options ----------
def test_estimate_gardirop_full_options(session):
    payload = {
        "product_type": "gardirop",
        "dims": {"w": 200, "h": 220, "d": 60},
        "options": {"led": True, "aynali_kapak": True, "pantolon_askisi": True,
                    "cekmece": 2, "ic_raf_sayisi": 4},
        "labor": 1500,
        "margin": 40,
    }
    r = session.post(f"{BASE_URL}/configurator/estimate", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "bom" in d and len(d["bom"]) > 0
    roles = {b["role"] for b in d["bom"]}
    missing = GARDIROP_EXPECTED_ROLES - roles
    assert not missing, f"missing roles in BOM: {missing}"
    # cost = material_cost + labor
    assert d["cost"] == round(d["material_cost"] + d["labor"], 2)
    # suggested_price = cost * (1 + margin/100)
    expected_price = round(d["cost"] * (1 + d["margin"] / 100), 2)
    assert d["suggested_price"] == expected_price
    assert d["cost"] > 0 and d["suggested_price"] > d["cost"]


# ---------- Estimate: all other 5 product types ----------
@pytest.mark.parametrize("ptype,dims", [
    ("mutfak",       {"w": 240, "h": 85,  "d": 60}),
    ("tv_unitesi",   {"w": 220, "h": 55,  "d": 45}),
    ("kitaplik",     {"w": 120, "h": 200, "d": 30}),
    ("komodin",      {"w": 50,  "h": 55,  "d": 40}),
    ("yatak_basligi",{"w": 160, "h": 110, "d": 8}),
])
def test_estimate_each_type_default(session, ptype, dims):
    r = session.post(f"{BASE_URL}/configurator/estimate", json={
        "product_type": ptype, "dims": dims, "options": {}, "labor": 500, "margin": 40,
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert len(d["bom"]) > 0
    assert d["cost"] > 0
    assert d["suggested_price"] > 0


# ---------- Estimate: unknown product type -> 400 ----------
def test_estimate_unknown_type_400(session):
    r = session.post(f"{BASE_URL}/configurator/estimate", json={
        "product_type": "not_a_type", "dims": {"w": 100, "h": 100, "d": 40},
        "options": {}, "labor": 0, "margin": 40,
    })
    assert r.status_code == 400


# ---------- PATCH material affects estimate live ----------
def test_patch_material_updates_estimate(session):
    # find led material by role
    mats = session.get(f"{BASE_URL}/materials").json()
    led = next((m for m in mats if m.get("role") == "led"), None)
    assert led is not None, "led material not seeded"
    original_cost = float(led["unit_cost"])

    payload = {
        "product_type": "gardirop",
        "dims": {"w": 200, "h": 220, "d": 60},
        "options": {"led": True, "led_metre": 2},
        "labor": 0, "margin": 40,
    }
    est1 = session.post(f"{BASE_URL}/configurator/estimate", json=payload).json()
    led_line1 = next(b for b in est1["bom"] if b["role"] == "led")

    # patch to double
    new_cost = original_cost * 2
    pr = session.patch(f"{BASE_URL}/materials/{led['id']}", json={"unit_cost": new_cost})
    assert pr.status_code == 200

    est2 = session.post(f"{BASE_URL}/configurator/estimate", json=payload).json()
    led_line2 = next(b for b in est2["bom"] if b["role"] == "led")
    assert led_line2["unit_cost"] == new_cost
    assert led_line2["line_cost"] > led_line1["line_cost"]
    assert est2["material_cost"] > est1["material_cost"]

    # restore
    session.patch(f"{BASE_URL}/materials/{led['id']}", json={"unit_cost": original_cost})


# ---------- Save configured product + live recomputation via GET /products ----------
def test_save_and_live_recompute(session):
    payload = {
        "name": "TEST_ConfiguredGardirop",
        "product_type": "gardirop",
        "dims": {"w": 200, "h": 220, "d": 60},
        "options": {"led": True, "ic_raf_sayisi": 3},
        "labor": 1500,
        "margin": 40,
    }
    r = session.post(f"{BASE_URL}/configurator/save", json=payload)
    assert r.status_code == 200, r.text
    saved = r.json()
    assert "id" in saved and saved["cost"] > 0
    pid = saved["id"]
    saved_cost = saved["cost"]

    # Fetch list -> should be present and use configurator path (has 'breakdown' as bom roles)
    products = session.get(f"{BASE_URL}/products").json()
    found = next((p for p in products if p.get("id") == pid), None)
    assert found is not None
    assert found.get("config", {}).get("product_type") == "gardirop"
    assert isinstance(found.get("breakdown"), list) and len(found["breakdown"]) > 0
    assert all("role" in b for b in found["breakdown"])
    assert found["cost"] == pytest.approx(saved_cost, rel=0.01)

    # PATCH mdf_govde price up, verify saved product's cost recomputes
    mats = session.get(f"{BASE_URL}/materials").json()
    mdf = next(m for m in mats if m.get("role") == "mdf_govde")
    original = float(mdf["unit_cost"])
    session.patch(f"{BASE_URL}/materials/{mdf['id']}", json={"unit_cost": original + 200})

    products2 = session.get(f"{BASE_URL}/products").json()
    found2 = next(p for p in products2 if p.get("id") == pid)
    assert found2["cost"] > saved_cost, f"cost should increase: {found2['cost']} vs {saved_cost}"

    # restore & cleanup
    session.patch(f"{BASE_URL}/materials/{mdf['id']}", json={"unit_cost": original})
    try:
        session.delete(f"{BASE_URL}/products/{pid}")
    except Exception:
        pass
