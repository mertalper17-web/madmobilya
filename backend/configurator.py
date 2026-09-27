"""
Parametric furniture configurator.
Formulas produce a bill-of-materials (BOM) for each product type
given dimensions (cm) and options. Materials are looked up by 'role'
against the materials collection; if not found, a default unit_cost is used.
"""
from math import ceil
from typing import Dict, List, Any

# ------------------------------------------------------------------
# Default materials catalog (used to seed & as fallback prices)
# unit: m² | adet | metre
# ------------------------------------------------------------------
DEFAULT_MATERIALS = [
    {"role": "mdf_govde",    "name": "MDF Gövde Panel (18mm)",  "unit": "m²",    "unit_cost": 480, "category": "Ahşap"},
    {"role": "mdf_kapak",    "name": "MDF Kapak Panel (18mm)",  "unit": "m²",    "unit_cost": 620, "category": "Ahşap"},
    {"role": "arka_panel",   "name": "Arka Panel (3mm HDF)",    "unit": "m²",    "unit_cost": 130, "category": "Ahşap"},
    {"role": "kenar_bant",   "name": "Kenar Bandı (PVC 2mm)",   "unit": "metre", "unit_cost": 8,   "category": "Aksesuar"},
    {"role": "mentese",      "name": "Menteşe (Yavaş Kapanır)", "unit": "adet",  "unit_cost": 35,  "category": "Fitting"},
    {"role": "lamello",      "name": "Lamello Bağlantı",        "unit": "adet",  "unit_cost": 3,   "category": "Fitting"},
    {"role": "vida",         "name": "Vida & Dübel Seti",       "unit": "adet",  "unit_cost": 1,   "category": "Fitting"},
    {"role": "askibar",      "name": "Askı Barı (Krom)",        "unit": "metre", "unit_cost": 90,  "category": "Aksesuar"},
    {"role": "kulp",         "name": "Kulp / Tutamak",          "unit": "adet",  "unit_cost": 45,  "category": "Aksesuar"},
    {"role": "ic_raf",       "name": "İç Raf (MDF)",            "unit": "m²",    "unit_cost": 380, "category": "Ahşap"},
    {"role": "cekmece_rayi", "name": "Çekmece Rayı (Tandem)",   "unit": "adet",  "unit_cost": 180, "category": "Fitting"},
    {"role": "ayna",         "name": "Ayna (4mm)",              "unit": "m²",    "unit_cost": 550, "category": "Aksesuar"},
    {"role": "cam_raf",      "name": "Cam Raf (6mm Temperli)",  "unit": "m²",    "unit_cost": 480, "category": "Aksesuar"},
    {"role": "led",          "name": "LED Şerit + Trafo",       "unit": "metre", "unit_cost": 120, "category": "Elektrik"},
    {"role": "pantolon_askisi", "name": "Pantolon Askısı",      "unit": "adet",  "unit_cost": 320, "category": "Aksesuar"},
    {"role": "ayakkabilik",  "name": "Ayakkabılık Modülü",      "unit": "adet",  "unit_cost": 450, "category": "Aksesuar"},
    {"role": "kravat_askisi","name": "Kravat & Kemer Askısı",   "unit": "adet",  "unit_cost": 180, "category": "Aksesuar"},
    {"role": "cekmece_kutu", "name": "Çekmece Kutu Seti",       "unit": "adet",  "unit_cost": 240, "category": "Aksesuar"},
]
DEFAULT_BY_ROLE = {m["role"]: m for m in DEFAULT_MATERIALS}


def _add(bom: List[dict], role: str, qty: float, materials_by_role: Dict[str, dict]):
    if qty <= 0:
        return
    m = materials_by_role.get(role) or DEFAULT_BY_ROLE.get(role)
    if not m:
        return
    unit_cost = float(m.get("unit_cost", 0))
    bom.append({
        "role": role,
        "name": m.get("name", role),
        "unit": m.get("unit", "adet"),
        "quantity": round(float(qty), 3),
        "unit_cost": unit_cost,
        "line_cost": round(unit_cost * float(qty), 2),
    })


# ------------------------------------------------------------------
# Template builders — each returns BOM given dims & options
# dimensions in cm; converted to meters inside formulas
# ------------------------------------------------------------------
def _gardirop(dims, opts, mats):
    W, H, D = dims["w"] / 100, dims["h"] / 100, dims["d"] / 100
    bom = []
    kapak_sayisi = max(2, opts.get("kapak_sayisi") or ceil(W * 100 / 50))
    cekmece_adet = int(opts.get("cekmece", 0))
    ic_raf_sayisi = int(opts.get("ic_raf_sayisi", 4))
    askibar_metre = float(opts.get("askibar_metre") or W)
    led_metre = float(opts.get("led_metre") or W) if opts.get("led") else 0

    # Gövde: 2 yan + tavan + taban
    govde_m2 = 2 * H * D + 2 * W * D
    _add(bom, "mdf_govde", govde_m2, mats)

    # Kapak (aynalı ise ayna eklenir, MDF kapak gene de var - çerçeve)
    kapak_m2 = W * H
    _add(bom, "mdf_kapak", kapak_m2, mats)
    if opts.get("aynali_kapak"):
        _add(bom, "ayna", kapak_m2 * 0.9, mats)

    # Arka panel
    _add(bom, "arka_panel", W * H, mats)

    # İç raf
    _add(bom, "ic_raf", ic_raf_sayisi * (W - 0.04) * (D - 0.02), mats)

    # Kenar bantı (metre)
    kenar = 4 * (H + D) + 2 * (W + D) * 2 + kapak_sayisi * 2 * (H + W / kapak_sayisi)
    _add(bom, "kenar_bant", kenar, mats)

    # Menteşe (H>200cm → 3, else 2 per kapak)
    _add(bom, "mentese", kapak_sayisi * (3 if dims["h"] > 200 else 2), mats)

    # Lamello + vida (heuristic)
    _add(bom, "lamello", 16 + ic_raf_sayisi * 4, mats)
    _add(bom, "vida", 80 + cekmece_adet * 8, mats)

    # Kulp
    _add(bom, "kulp", kapak_sayisi + cekmece_adet, mats)

    # Askı barı
    _add(bom, "askibar", askibar_metre, mats)

    # Çekmece
    if cekmece_adet:
        _add(bom, "cekmece_rayi", cekmece_adet * 2, mats)
        _add(bom, "cekmece_kutu", cekmece_adet, mats)

    # Opsiyonlar
    if led_metre: _add(bom, "led", led_metre, mats)
    if opts.get("pantolon_askisi"): _add(bom, "pantolon_askisi", int(opts.get("pantolon_askisi_adet", 1)), mats)
    if opts.get("ayakkabilik"):     _add(bom, "ayakkabilik", int(opts.get("ayakkabilik_adet", 1)), mats)
    if opts.get("kravat_askisi"):   _add(bom, "kravat_askisi", int(opts.get("kravat_askisi_adet", 1)), mats)
    if opts.get("cam_raf_adet"):    _add(bom, "cam_raf", int(opts["cam_raf_adet"]) * (W - 0.04) * (D - 0.02), mats)

    return bom


def _mutfak(dims, opts, mats):
    W, H, D = dims["w"] / 100, dims["h"] / 100, dims["d"] / 100
    bom = []
    kapak_sayisi = max(2, opts.get("kapak_sayisi") or ceil(W * 100 / 45))
    cekmece_adet = int(opts.get("cekmece", 0))
    _add(bom, "mdf_govde", 2 * H * D + 2 * W * D + (W * D if opts.get("ust_dolap") else 0), mats)
    _add(bom, "mdf_kapak", W * H, mats)
    _add(bom, "arka_panel", W * H, mats)
    _add(bom, "ic_raf", int(opts.get("ic_raf_sayisi", 2)) * (W - 0.04) * (D - 0.02), mats)
    _add(bom, "kenar_bant", 3 * (H + D) + 2 * (W + D) + kapak_sayisi * 2 * (H + W / kapak_sayisi), mats)
    _add(bom, "mentese", kapak_sayisi * 2, mats)
    _add(bom, "lamello", 12, mats)
    _add(bom, "vida", 60 + cekmece_adet * 8, mats)
    _add(bom, "kulp", kapak_sayisi + cekmece_adet, mats)
    if cekmece_adet:
        _add(bom, "cekmece_rayi", cekmece_adet * 2, mats)
        _add(bom, "cekmece_kutu", cekmece_adet, mats)
    if opts.get("led"): _add(bom, "led", float(opts.get("led_metre") or W), mats)
    return bom


def _tv_unitesi(dims, opts, mats):
    W, H, D = dims["w"] / 100, dims["h"] / 100, dims["d"] / 100
    bom = []
    kapak_sayisi = int(opts.get("kapak_sayisi", 2))
    cekmece_adet = int(opts.get("cekmece", 1))
    _add(bom, "mdf_govde", 2 * H * D + 2 * W * D, mats)
    _add(bom, "mdf_kapak", W * H * 0.6, mats)
    _add(bom, "arka_panel", W * H, mats)
    _add(bom, "ic_raf", int(opts.get("ic_raf_sayisi", 2)) * (W - 0.04) * (D - 0.02), mats)
    _add(bom, "kenar_bant", 3 * (H + D) + 2 * (W + D) + kapak_sayisi * (H + W), mats)
    _add(bom, "mentese", kapak_sayisi * 2, mats)
    _add(bom, "lamello", 10, mats)
    _add(bom, "vida", 50 + cekmece_adet * 8, mats)
    _add(bom, "kulp", kapak_sayisi + cekmece_adet, mats)
    if cekmece_adet:
        _add(bom, "cekmece_rayi", cekmece_adet * 2, mats)
        _add(bom, "cekmece_kutu", cekmece_adet, mats)
    if opts.get("led"): _add(bom, "led", float(opts.get("led_metre") or W), mats)
    if opts.get("cam_raf_adet"): _add(bom, "cam_raf", int(opts["cam_raf_adet"]) * (W - 0.04) * (D - 0.02), mats)
    return bom


def _kitaplik(dims, opts, mats):
    W, H, D = dims["w"] / 100, dims["h"] / 100, dims["d"] / 100
    bom = []
    raf_sayisi = int(opts.get("ic_raf_sayisi", 5))
    _add(bom, "mdf_govde", 2 * H * D + 2 * W * D, mats)
    _add(bom, "arka_panel", W * H, mats)
    _add(bom, "ic_raf", raf_sayisi * (W - 0.04) * (D - 0.02), mats)
    _add(bom, "kenar_bant", 4 * (H + D) + 2 * (W + D) + raf_sayisi * 2 * W, mats)
    _add(bom, "lamello", 8 + raf_sayisi * 4, mats)
    _add(bom, "vida", 40 + raf_sayisi * 4, mats)
    if opts.get("led"): _add(bom, "led", float(opts.get("led_metre") or W), mats)
    if opts.get("cam_raf_adet"): _add(bom, "cam_raf", int(opts["cam_raf_adet"]) * (W - 0.04) * (D - 0.02), mats)
    return bom


def _komodin(dims, opts, mats):
    W, H, D = dims["w"] / 100, dims["h"] / 100, dims["d"] / 100
    bom = []
    cekmece_adet = int(opts.get("cekmece", 2))
    _add(bom, "mdf_govde", 2 * H * D + 2 * W * D, mats)
    _add(bom, "mdf_kapak", cekmece_adet * (W * (H / max(cekmece_adet, 1))), mats)
    _add(bom, "arka_panel", W * H, mats)
    _add(bom, "kenar_bant", 3 * (H + D) + 2 * (W + D), mats)
    _add(bom, "cekmece_rayi", cekmece_adet * 2, mats)
    _add(bom, "cekmece_kutu", cekmece_adet, mats)
    _add(bom, "kulp", cekmece_adet, mats)
    _add(bom, "lamello", 8, mats)
    _add(bom, "vida", 30 + cekmece_adet * 8, mats)
    return bom


def _yatak_basligi(dims, opts, mats):
    W, H, D = dims["w"] / 100, dims["h"] / 100, dims["d"] / 100
    bom = []
    _add(bom, "mdf_kapak", W * H, mats)
    _add(bom, "kenar_bant", 2 * (W + H), mats)
    _add(bom, "vida", 20, mats)
    if opts.get("led"): _add(bom, "led", float(opts.get("led_metre") or W), mats)
    return bom


# ------------------------------------------------------------------
# Templates — public metadata + formula function
# ------------------------------------------------------------------
TEMPLATES = {
    "gardirop": {
        "name": "Gardırop",
        "icon": "wardrobe",
        "dims": {"w": {"label": "Genişlik (cm)", "default": 200, "min": 60, "max": 400},
                 "h": {"label": "Yükseklik (cm)", "default": 220, "min": 60, "max": 280},
                 "d": {"label": "Derinlik (cm)",  "default": 60,  "min": 30, "max": 80}},
        "default_labor": 1500, "default_margin": 40,
        "options": [
            {"key": "kapak_sayisi", "type": "number", "label": "Kapak sayısı", "default": 4, "min": 2, "max": 8},
            {"key": "ic_raf_sayisi", "type": "number", "label": "İç raf sayısı", "default": 4, "min": 0, "max": 10},
            {"key": "cekmece", "type": "number", "label": "Çekmece adedi", "default": 2, "min": 0, "max": 8},
            {"key": "askibar_metre", "type": "number", "label": "Askı barı (metre)", "default": 0, "min": 0, "max": 5, "step": 0.5, "placeholder": "Genişliğe göre otomatik"},
            {"key": "aynali_kapak", "type": "bool", "label": "Aynalı kapak"},
            {"key": "led", "type": "bool", "label": "LED aydınlatma"},
            {"key": "led_metre", "type": "number", "label": "LED (metre)", "default": 0, "min": 0, "max": 10, "step": 0.5, "depends": "led", "placeholder": "Otomatik = genişlik"},
            {"key": "pantolon_askisi", "type": "bool", "label": "Pantolon askısı"},
            {"key": "pantolon_askisi_adet", "type": "number", "label": "Pantolon askısı adet", "default": 1, "min": 1, "max": 4, "depends": "pantolon_askisi"},
            {"key": "ayakkabilik", "type": "bool", "label": "Ayakkabılık modülü"},
            {"key": "ayakkabilik_adet", "type": "number", "label": "Ayakkabılık adet", "default": 1, "min": 1, "max": 4, "depends": "ayakkabilik"},
            {"key": "kravat_askisi", "type": "bool", "label": "Kravat & kemer askısı"},
            {"key": "cam_raf_adet", "type": "number", "label": "Cam raf adet", "default": 0, "min": 0, "max": 6},
        ],
        "build": _gardirop,
    },
    "mutfak": {
        "name": "Mutfak Dolabı",
        "dims": {"w": {"label": "Genişlik (cm)", "default": 240, "min": 60, "max": 500},
                 "h": {"label": "Yükseklik (cm)", "default": 85,  "min": 40, "max": 220},
                 "d": {"label": "Derinlik (cm)",  "default": 60,  "min": 30, "max": 80}},
        "default_labor": 2000, "default_margin": 45,
        "options": [
            {"key": "kapak_sayisi", "type": "number", "label": "Kapak sayısı", "default": 4, "min": 2, "max": 12},
            {"key": "ic_raf_sayisi", "type": "number", "label": "İç raf sayısı", "default": 2, "min": 0, "max": 6},
            {"key": "cekmece", "type": "number", "label": "Çekmece adedi", "default": 3, "min": 0, "max": 10},
            {"key": "ust_dolap", "type": "bool", "label": "Üst dolap dahil"},
            {"key": "led", "type": "bool", "label": "LED (tezgah altı)"},
            {"key": "led_metre", "type": "number", "label": "LED (metre)", "default": 0, "min": 0, "max": 10, "step": 0.5, "depends": "led"},
        ],
        "build": _mutfak,
    },
    "tv_unitesi": {
        "name": "TV Ünitesi",
        "dims": {"w": {"label": "Genişlik (cm)", "default": 220, "min": 80, "max": 400},
                 "h": {"label": "Yükseklik (cm)", "default": 55,  "min": 30, "max": 120},
                 "d": {"label": "Derinlik (cm)",  "default": 45,  "min": 25, "max": 60}},
        "default_labor": 900, "default_margin": 40,
        "options": [
            {"key": "kapak_sayisi", "type": "number", "label": "Kapak sayısı", "default": 2, "min": 0, "max": 6},
            {"key": "ic_raf_sayisi", "type": "number", "label": "İç raf sayısı", "default": 2, "min": 0, "max": 6},
            {"key": "cekmece", "type": "number", "label": "Çekmece adedi", "default": 1, "min": 0, "max": 4},
            {"key": "led", "type": "bool", "label": "LED arka aydınlatma"},
            {"key": "led_metre", "type": "number", "label": "LED (metre)", "default": 0, "min": 0, "max": 8, "step": 0.5, "depends": "led"},
            {"key": "cam_raf_adet", "type": "number", "label": "Cam raf adet", "default": 0, "min": 0, "max": 4},
        ],
        "build": _tv_unitesi,
    },
    "kitaplik": {
        "name": "Kitaplık",
        "dims": {"w": {"label": "Genişlik (cm)", "default": 120, "min": 40, "max": 300},
                 "h": {"label": "Yükseklik (cm)", "default": 200, "min": 80, "max": 280},
                 "d": {"label": "Derinlik (cm)",  "default": 30,  "min": 20, "max": 45}},
        "default_labor": 700, "default_margin": 40,
        "options": [
            {"key": "ic_raf_sayisi", "type": "number", "label": "Raf sayısı", "default": 5, "min": 2, "max": 12},
            {"key": "led", "type": "bool", "label": "LED aydınlatma"},
            {"key": "led_metre", "type": "number", "label": "LED (metre)", "default": 0, "min": 0, "max": 10, "step": 0.5, "depends": "led"},
            {"key": "cam_raf_adet", "type": "number", "label": "Cam raf adet", "default": 0, "min": 0, "max": 6},
        ],
        "build": _kitaplik,
    },
    "komodin": {
        "name": "Komodin",
        "dims": {"w": {"label": "Genişlik (cm)", "default": 50, "min": 30, "max": 80},
                 "h": {"label": "Yükseklik (cm)", "default": 55, "min": 40, "max": 80},
                 "d": {"label": "Derinlik (cm)",  "default": 40, "min": 30, "max": 55}},
        "default_labor": 400, "default_margin": 45,
        "options": [
            {"key": "cekmece", "type": "number", "label": "Çekmece adedi", "default": 2, "min": 1, "max": 4},
        ],
        "build": _komodin,
    },
    "yatak_basligi": {
        "name": "Yatak Başlığı",
        "dims": {"w": {"label": "Genişlik (cm)", "default": 160, "min": 90, "max": 220},
                 "h": {"label": "Yükseklik (cm)", "default": 110, "min": 60, "max": 160},
                 "d": {"label": "Derinlik (cm)",  "default": 8,   "min": 5, "max": 20}},
        "default_labor": 500, "default_margin": 45,
        "options": [
            {"key": "led", "type": "bool", "label": "LED arka aydınlatma"},
            {"key": "led_metre", "type": "number", "label": "LED (metre)", "default": 0, "min": 0, "max": 8, "step": 0.5, "depends": "led"},
        ],
        "build": _yatak_basligi,
    },
}


def get_public_templates() -> List[dict]:
    """Return template metadata (no build function) for frontend."""
    out = []
    for key, tpl in TEMPLATES.items():
        out.append({
            "key": key, "name": tpl["name"],
            "dims": tpl["dims"], "options": tpl["options"],
            "default_labor": tpl["default_labor"],
            "default_margin": tpl["default_margin"],
        })
    return out


def estimate(product_type: str, dims: dict, options: dict,
             labor: float, margin: float, materials: List[dict]) -> dict:
    tpl = TEMPLATES.get(product_type)
    if not tpl:
        raise ValueError(f"Bilinmeyen ürün tipi: {product_type}")
    mats_by_role = {m["role"]: m for m in materials if m.get("role")}
    bom = tpl["build"](dims, options or {}, mats_by_role)
    material_cost = round(sum(b["line_cost"] for b in bom), 2)
    cost = round(material_cost + float(labor), 2)
    suggested_price = round(cost * (1 + float(margin) / 100), 2)
    return {
        "bom": bom,
        "material_cost": material_cost,
        "labor": round(float(labor), 2),
        "cost": cost,
        "margin": float(margin),
        "suggested_price": suggested_price,
        "profit": round(suggested_price - cost, 2),
    }
