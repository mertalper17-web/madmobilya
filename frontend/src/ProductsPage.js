import { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, X, Trash2, Layers } from 'lucide-react';
import './ProductsPage.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const money = (n = 0) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);

const emptyForm = { name: '', category: 'Masa', status: 'Aktif', labor_cost: '', margin: '30', recipe: [] };

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [detail, setDetail] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const load = async () => {
    const [p, m] = await Promise.all([
      axios.get(`${API}/products?t=${Date.now()}`),
      axios.get(`${API}/materials?t=${Date.now()}`)
    ]);
    setProducts(p.data); setMaterials(m.data);
  };
  useEffect(() => { load(); }, []);

  const addRecipeRow = () => setForm(f => ({ ...f, recipe: [...f.recipe, { material_id: '', quantity: '' }] }));
  const setRecipe = (i, key, val) => setForm(f => ({ ...f, recipe: f.recipe.map((r, j) => j === i ? { ...r, [key]: val } : r) }));
  const delRecipe = (i) => setForm(f => ({ ...f, recipe: f.recipe.filter((_, j) => j !== i) }));

  const preview = (() => {
    const mat = form.recipe.reduce((sum, r) => {
      const m = materials.find(x => x.id === r.material_id);
      return sum + (m ? Number(m.unit_cost) * Number(r.quantity || 0) : 0);
    }, 0);
    const cost = mat + Number(form.labor_cost || 0);
    const price = cost * (1 + Number(form.margin || 0) / 100);
    return { mat, cost, price };
  })();

  const save = async () => {
    setError('');
    try {
      const clean = form.recipe.filter(r => r.material_id && Number(r.quantity) > 0)
        .map(r => ({ material_id: r.material_id, quantity: Number(r.quantity) }));
      await axios.post(`${API}/products`, {
        name: form.name, category: form.category, status: form.status,
        labor_cost: Number(form.labor_cost) || 0, margin: Number(form.margin) || 0, recipe: clean
      });
      setOpen(false); setForm(emptyForm); load();
    } catch (e) {
      setError(e.response?.data?.detail?.[0]?.msg || e.response?.data?.detail || 'Kayıt eklenemedi. Bilgileri kontrol edin.');
    }
  };

  return <>
    <div className="page-toolbar">
      <div><p className="page-note">ÜRÜN & REÇETELER / {products.length} KAYIT</p><h2>Ürün maliyet analizi</h2></div>
      <button className="primary" onClick={() => { setForm(emptyForm); setError(''); setOpen(true); }} data-testid="add-product-button"><Plus size={16}/> Yeni ürün</button>
    </div>

    <section className="panel table-panel">
      <div className="table-scroll"><table><thead><tr>
        <th>Ürün</th><th>Kategori</th><th>Malzeme</th><th>İşçilik</th><th>Toplam maliyet</th><th>Önerilen fiyat</th><th>Kâr</th><th></th>
      </tr></thead><tbody>
        {products.map(p => <tr key={p.id}>
          <td><b data-testid={`product-name-${p.id}`}>{p.name}</b><small className="cell-sub">{(p.breakdown || []).length} malzeme</small></td>
          <td>{p.category}</td>
          <td>{money(p.material_cost)}</td>
          <td>{money(p.labor_cost)}</td>
          <td><b data-testid={`product-cost-${p.id}`}>{money(p.cost)}</b></td>
          <td className="positive" data-testid={`product-price-${p.id}`}>{money(p.suggested_price)}</td>
          <td><span className="pill success">%{p.margin}</span></td>
          <td><button className="table-action" onClick={() => setDetail(p)} data-testid={`product-detail-${p.id}`}>Detay</button></td>
        </tr>)}
      </tbody></table>
      {!products.length && <div className="empty" data-testid="products-empty-state">Henüz ürün eklenmemiş. Malzemelerinizi seçip ilk reçetenizi oluşturun.</div>}
      </div>
    </section>

    {open && <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal product-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setOpen(false)} data-testid="close-product-modal"><X/></button>
        <span className="eyebrow">YENİ ÜRÜN REÇETESİ</span>
        <h3>Ürün ve malzeme maliyeti</h3>
        {error && <div className="form-error" role="alert" data-testid="product-form-error">{error}</div>}
        <div className="form-grid">
          <label>Ürün adı<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="product-name-input"/></label>
          <label>Kategori
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} data-testid="product-category-select">
              <option>Masa</option><option>Sandalye</option><option>Dolap</option><option>Yatak</option><option>Koltuk</option><option>Diğer</option>
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>İşçilik (₺)<input type="number" min="0" value={form.labor_cost} onChange={e => setForm({ ...form, labor_cost: e.target.value })} data-testid="product-labor-input"/></label>
          <label>Kâr marjı (%)<input type="number" min="0" value={form.margin} onChange={e => setForm({ ...form, margin: e.target.value })} data-testid="product-margin-input"/></label>
        </div>

        <div className="recipe-head">
          <span className="eyebrow"><Layers size={12}/> MALZEME REÇETESİ</span>
          <button className="table-action" onClick={addRecipeRow} data-testid="add-recipe-row"><Plus size={12}/> Malzeme ekle</button>
        </div>

        {!materials.length && <div className="hint">Önce malzeme ekleyin, sonra reçete oluşturabilirsiniz.</div>}
        {form.recipe.map((r, i) => {
          const m = materials.find(x => x.id === r.material_id);
          return <div className="recipe-row" key={i}>
            <select value={r.material_id} onChange={e => setRecipe(i, 'material_id', e.target.value)} data-testid={`recipe-material-${i}`}>
              <option value="">Malzeme seçin...</option>
              {materials.map(x => <option key={x.id} value={x.id}>{x.name} ({money(x.unit_cost)} / {x.unit})</option>)}
            </select>
            <input type="number" placeholder="Miktar" min="0" step="0.01" value={r.quantity} onChange={e => setRecipe(i, 'quantity', e.target.value)} data-testid={`recipe-quantity-${i}`}/>
            <span className="line-cost">{m ? money(Number(m.unit_cost) * Number(r.quantity || 0)) : '—'}</span>
            <button className="icon-del" onClick={() => delRecipe(i)} aria-label="Sil" data-testid={`recipe-remove-${i}`}><Trash2 size={14}/></button>
          </div>;
        })}

        <div className="cost-preview" data-testid="cost-preview">
          <div><small>Malzeme</small><b>{money(preview.mat)}</b></div>
          <div><small>+ İşçilik</small><b>{money(Number(form.labor_cost) || 0)}</b></div>
          <div><small>= Maliyet</small><b>{money(preview.cost)}</b></div>
          <div className="highlight"><small>Önerilen fiyat</small><b>{money(preview.price)}</b></div>
        </div>

        <button className="primary full" onClick={save} data-testid="save-product-button">Reçeteyi kaydet</button>
      </div>
    </div>}

    {detail && <div className="modal-backdrop" onClick={() => setDetail(null)}>
      <div className="modal product-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setDetail(null)} data-testid="close-detail-modal"><X/></button>
        <span className="eyebrow">MALİYET DÖKÜMÜ</span>
        <h3>{detail.name}</h3>
        <div className="detail-summary">
          <div><small>Malzeme</small><b>{money(detail.material_cost)}</b></div>
          <div><small>İşçilik</small><b>{money(detail.labor_cost)}</b></div>
          <div><small>Toplam maliyet</small><b>{money(detail.cost)}</b></div>
          <div className="highlight"><small>Önerilen fiyat (%{detail.margin})</small><b>{money(detail.suggested_price)}</b></div>
        </div>
        <div className="recipe-list">
          {(detail.breakdown || []).length ? detail.breakdown.map(b => <div className="recipe-detail-row" key={b.material_id}>
            <div><b>{b.name}</b><small>{b.quantity} {b.unit} × {money(b.unit_cost)}</small></div>
            <span>{money(b.line_cost)}</span>
          </div>) : <div className="empty">Bu ürüne henüz malzeme eklenmemiş.</div>}
        </div>
      </div>
    </div>}
  </>;
}
