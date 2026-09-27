import { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import { Sofa, ChefHat, Tv, BookOpen, Bed, Moon, Calculator, Save, RotateCcw, Zap } from 'lucide-react';
import './ConfiguratorPage.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const money = (n = 0) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
const num = (n = 0) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(n);

const ICONS = {
  gardirop: Sofa, mutfak: ChefHat, tv_unitesi: Tv,
  kitaplik: BookOpen, komodin: Moon, yatak_basligi: Bed,
};

export default function ConfiguratorPage() {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [dims, setDims] = useState({});
  const [options, setOptions] = useState({});
  const [labor, setLabor] = useState(0);
  const [margin, setMargin] = useState(40);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [discounts, setDiscounts] = useState([]);
  const [discountId, setDiscountId] = useState('');

  useEffect(() => {
    axios.get(`${API}/configurator/templates`).then(r => setTemplates(r.data.templates));
    axios.post(`${API}/configurator/seed-materials`).catch(() => {});
    axios.get(`${API}/discounts`).then(r => setDiscounts(r.data.filter(x => x.active))).catch(() => {});
  }, []);

  const pick = (tpl) => {
    setSelected(tpl);
    const d = {}; Object.entries(tpl.dims).forEach(([k, v]) => d[k] = v.default);
    const o = {}; tpl.options.forEach(op => { o[op.key] = op.default ?? (op.type === 'bool' ? false : 0); });
    setDims(d); setOptions(o);
    setLabor(tpl.default_labor); setMargin(tpl.default_margin);
    setResult(null); setSaved(''); setError('');
    setName(tpl.name + ' ' + new Date().toLocaleDateString('tr-TR'));
  };

  const calculate = useCallback(async () => {
    if (!selected) return;
    setLoading(true); setError('');
    const disc = discounts.find(d => d.id === discountId);
    try {
      const r = await axios.post(`${API}/configurator/estimate`, {
        product_type: selected.key, dims, options,
        labor: Number(labor) || 0, margin: Number(margin) || 0,
        discount_rate: disc ? Number(disc.rate) : 0,
      });
      setResult(r.data);
    } catch (e) {
      setError(e.response?.data?.detail || 'Hesaplama başarısız');
    } finally { setLoading(false); }
  }, [selected, dims, options, labor, margin, discountId, discounts]);

  // auto-recalculate whenever config changes
  useEffect(() => {
    if (!selected) return;
    const t = setTimeout(calculate, 300);
    return () => clearTimeout(t);
  }, [calculate, selected]);

  const save = async () => {
    if (!selected || !name.trim()) { setError('Ürün adı gerekli'); return; }
    setError('');
    try {
      await axios.post(`${API}/configurator/save`, {
        name, product_type: selected.key, dims, options,
        labor: Number(labor) || 0, margin: Number(margin) || 0,
      });
      setSaved(`"${name}" ürünler listesine kaydedildi. Ürünler & Reçeteler sayfasında görebilirsiniz.`);
      setTimeout(() => setSaved(''), 5000);
    } catch (e) {
      setError(e.response?.data?.detail || 'Kayıt başarısız');
    }
  };

  // ------ Render ------
  if (!selected) {
    return <>
      <div className="page-toolbar">
        <div><p className="page-note">TEKLİF & MALİYET HESAP</p><h2>Ürün konfigüratörü</h2></div>
      </div>
      <p className="config-lead">Ölçülerinizi ve seçeneklerinizi girin, güncel malzeme fiyatlarınıza göre maliyet ve önerilen satış fiyatını anında görün.</p>
      <div className="tpl-grid">
        {templates.map(t => {
          const Icon = ICONS[t.key] || Sofa;
          return <button key={t.key} className="tpl-card" onClick={() => pick(t)} data-testid={`tpl-${t.key}`}>
            <div className="tpl-icon"><Icon size={28}/></div>
            <b>{t.name}</b>
            <small>{t.options.length} opsiyon · Marj %{t.default_margin}</small>
          </button>;
        })}
      </div>
    </>;
  }

  const showOption = (op) => !op.depends || options[op.depends];

  return <>
    <div className="page-toolbar">
      <div>
        <p className="page-note">KONFİGÜRATÖR / {selected.name.toUpperCase()}</p>
        <h2>{selected.name} maliyet hesabı</h2>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="table-action" onClick={() => setSelected(null)} data-testid="back-to-templates"><RotateCcw size={13}/> Ürün değiştir</button>
      </div>
    </div>

    {saved && <div className="order-banner ok" data-testid="config-saved-banner"><span>✓ {saved}</span></div>}
    {error && <div className="order-banner err" data-testid="config-error"><span>{error}</span></div>}

    <div className="config-layout">
      <section className="panel config-panel">
        <div className="config-section">
          <span className="eyebrow">ÖLÇÜLER</span>
          <div className="dims-grid">
            {Object.entries(selected.dims).map(([k, v]) => <label key={k}>
              {v.label}
              <input type="number" min={v.min} max={v.max} value={dims[k] || ''}
                onChange={e => setDims({ ...dims, [k]: Number(e.target.value) })}
                data-testid={`dim-${k}`}/>
            </label>)}
          </div>
        </div>

        <div className="config-section">
          <span className="eyebrow">OPSİYONLAR</span>
          <div className="opts-list">
            {selected.options.filter(showOption).map(op => <div className="opt-row" key={op.key}>
              {op.type === 'bool' ? <label className="opt-toggle">
                <input type="checkbox" checked={!!options[op.key]}
                  onChange={e => setOptions({ ...options, [op.key]: e.target.checked })}
                  data-testid={`opt-${op.key}`}/>
                <span>{op.label}</span>
              </label> : <label className="opt-num">
                <span>{op.label}</span>
                <input type="number" min={op.min} max={op.max} step={op.step || 1}
                  placeholder={op.placeholder || ''}
                  value={options[op.key] ?? ''}
                  onChange={e => setOptions({ ...options, [op.key]: e.target.value === '' ? 0 : Number(e.target.value) })}
                  data-testid={`opt-${op.key}`}/>
              </label>}
            </div>)}
          </div>
        </div>

        <div className="config-section">
          <span className="eyebrow">MALİYET AYARLARI</span>
          <div className="dims-grid">
            <label>İşçilik (₺)<input type="number" min="0" value={labor} onChange={e => setLabor(e.target.value)} data-testid="config-labor"/></label>
            <label>Kâr marjı (%)<input type="number" min="0" value={margin} onChange={e => setMargin(e.target.value)} data-testid="config-margin"/></label>
          </div>
          <label style={{ display: 'block', marginTop: 12 }}>İskonto uygula
            <select value={discountId} onChange={e => setDiscountId(e.target.value)} data-testid="config-discount-select" style={{ width: '100%', marginTop: 6 }}>
              <option value="">— İskonto yok —</option>
              {discounts.map(d => <option key={d.id} value={d.id}>{d.name} · %{d.rate}</option>)}
            </select>
          </label>
        </div>
      </section>

      <aside className="panel result-panel">
        <div className="result-head">
          <Calculator size={16}/>
          <span className="eyebrow">CANLI MALİYET</span>
          {loading && <span className="calc-spin"/>}
        </div>

        {result ? <>
          <div className="result-hero">
            <div><small>Malzeme</small><b>{money(result.material_cost)}</b></div>
            <div><small>+ İşçilik</small><b>{money(result.labor)}</b></div>
            <div className="line-total"><small>= Toplam Maliyet</small><b>{money(result.cost)}</b></div>
            <div className="line-price"><small>Önerilen Satış Fiyatı</small><b>{money(result.suggested_price)}</b><em>Kâr: {money(result.profit)}</em></div>
            {result.final_price != null && <div className="line-discount" data-testid="config-final-price">
              <small>İskontolu Net Fiyat (%{result.discount_rate})</small><b>{money(result.final_price)}</b><em>İskonto: {money(result.discount_amount)}</em>
            </div>}
          </div>

          <div className="bom-list">
            <div className="bom-head"><span>MALZEME</span><span>MİKTAR</span><span>TUTAR</span></div>
            {result.bom.map((b, i) => <div className="bom-row" key={i} data-testid={`bom-${b.role}`}>
              <div><b>{b.name}</b><small>{money(b.unit_cost)} / {b.unit}</small></div>
              <span>{num(b.quantity)} {b.unit}</span>
              <strong>{money(b.line_cost)}</strong>
            </div>)}
          </div>

          <div className="save-block">
            <label>Ürün adı<input value={name} onChange={e => setName(e.target.value)} placeholder="Örn: Ceviz Gardırop 200cm" data-testid="config-product-name"/></label>
            <button className="primary full" onClick={save} data-testid="save-configured-product"><Save size={14}/> Ürünlere kaydet</button>
            <p className="save-hint"><Zap size={11}/> Kayıtlı ürünlerinizin maliyeti, malzeme fiyatı değiştikçe otomatik güncellenir.</p>
          </div>
        </> : <div className="empty" style={{ padding: '60px 20px' }}>Ölçü ve opsiyonları girin, maliyet burada canlı görünür.</div>}
      </aside>
    </div>
  </>;
}
