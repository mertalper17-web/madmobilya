import { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, X, PackagePlus, History, Pencil, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';
import './MaterialsPage.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const money = (n = 0) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(n);

const emptyMat = { name: '', category: 'Ahşap', unit: 'm²', stock: '0', min_stock: '0', unit_cost: '0', supplier: '' };
const emptyEntry = { quantity: '', unit_cost: '', supplier: '', note: '', date: '' };

export default function MaterialsPage() {
  const [materials, setMaterials] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyMat);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState(null);

  const [editing, setEditing] = useState(null);   // material being price/detail edited
  const [entryFor, setEntryFor] = useState(null);  // material for stock entry
  const [entryForm, setEntryForm] = useState(emptyEntry);
  const [historyFor, setHistoryFor] = useState(null);
  const [history, setHistory] = useState({ entries: [], prices: [] });

  const load = async () => {
    const { data } = await axios.get(`${API}/materials?t=${Date.now()}`);
    setMaterials(data);
  };
  useEffect(() => { load(); }, []);

  const addMaterial = async () => {
    setError('');
    if (!form.name.trim()) return setError('Malzeme adı gerekli.');
    try {
      await axios.post(`${API}/materials`, {
        name: form.name, category: form.category, unit: form.unit,
        stock: Number(form.stock) || 0, min_stock: Number(form.min_stock) || 0,
        unit_cost: Number(form.unit_cost) || 0, supplier: form.supplier,
      });
      setAddOpen(false); setForm(emptyMat); load();
    } catch (e) { setError(e.response?.data?.detail?.[0]?.msg || 'Malzeme eklenemedi.'); }
  };

  const saveEdit = async () => {
    setError('');
    try {
      await axios.patch(`${API}/materials/${editing.id}`, {
        name: editing.name, category: editing.category, unit: editing.unit,
        min_stock: Number(editing.min_stock) || 0, unit_cost: Number(editing.unit_cost) || 0,
        supplier: editing.supplier || '',
      });
      setBanner({ kind: 'ok', text: `${editing.name} güncellendi. İlgili ürün maliyetleri otomatik yenilendi.` });
      setEditing(null); load();
    } catch (e) { setError(e.response?.data?.detail || 'Güncellenemedi.'); }
  };

  const saveEntry = async () => {
    setError('');
    if (!entryForm.quantity || Number(entryForm.quantity) <= 0) return setError('Giriş miktarı 0’dan büyük olmalı.');
    try {
      const res = await axios.post(`${API}/materials/${entryFor.id}/stock-entries`, {
        quantity: Number(entryForm.quantity),
        unit_cost: entryForm.unit_cost ? Number(entryForm.unit_cost) : 0,
        supplier: entryForm.supplier, note: entryForm.note, date: entryForm.date,
      });
      setBanner({ kind: 'ok', text: `${entryFor.name}: ${entryForm.quantity} ${entryFor.unit} giriş yapıldı. Yeni stok: ${res.data.stock} ${entryFor.unit}` });
      setEntryFor(null); setEntryForm(emptyEntry); load();
    } catch (e) { setError(e.response?.data?.detail || 'Stok girişi kaydedilemedi.'); }
  };

  const openHistory = async (m) => {
    setHistoryFor(m);
    const [e, p] = await Promise.all([
      axios.get(`${API}/materials/${m.id}/stock-entries`),
      axios.get(`${API}/materials/${m.id}/price-history`),
    ]);
    setHistory({ entries: e.data, prices: p.data });
  };

  const lowCount = materials.filter(m => Number(m.stock) <= Number(m.min_stock)).length;

  return <>
    <div className="page-toolbar">
      <div><p className="page-note">MALZEME & STOK / {materials.length} KAYIT{lowCount ? ` · ${lowCount} KRİTİK` : ''}</p>
        <h2>Malzeme, stok ve maliyet takibi</h2></div>
      <button className="primary" onClick={() => { setForm(emptyMat); setError(''); setAddOpen(true); }} data-testid="add-material-button"><Plus size={16}/> Yeni malzeme</button>
    </div>

    {banner && <div className={`order-banner ${banner.kind}`} data-testid="material-banner">
      <span>{banner.text}</span>
      <button onClick={() => setBanner(null)} className="modal-close" style={{ position: 'static' }}><X size={14}/></button>
    </div>}

    <div className="mat-grid">
      {materials.map(m => {
        const low = Number(m.stock) <= Number(m.min_stock);
        return <div className={`mat-card${low ? ' low' : ''}`} key={m.id} data-testid={`material-card-${m.id}`}>
          <div className="mat-card-top">
            <div>
              <b data-testid={`material-name-${m.id}`}>{m.name}</b>
              <small>{m.category} · {m.supplier || 'Tedarikçi yok'}</small>
            </div>
            {low && <span className="mat-flag" title="Kritik stok"><AlertTriangle size={14}/></span>}
          </div>
          <div className="mat-metrics">
            <div><small>Stok</small><b className={low ? 'danger' : ''} data-testid={`material-stock-${m.id}`}>{m.stock} {m.unit}</b></div>
            <div><small>Min. stok</small><b>{m.min_stock} {m.unit}</b></div>
            <div><small>Birim maliyet</small><b className="cost" data-testid={`material-cost-${m.id}`}>{money(m.unit_cost)}</b></div>
          </div>
          <div className="mat-actions">
            <button onClick={() => setEntryFor(m) || setEntryForm(emptyEntry) || setError('')} data-testid={`stock-entry-${m.id}`}><PackagePlus size={14}/> Stok girişi</button>
            <button onClick={() => { setEditing({ ...m }); setError(''); }} data-testid={`edit-material-${m.id}`}><Pencil size={14}/> Düzenle</button>
            <button onClick={() => openHistory(m)} data-testid={`history-material-${m.id}`}><History size={14}/> Geçmiş</button>
          </div>
        </div>;
      })}
      {!materials.length && <div className="empty" data-testid="materials-empty-state">Henüz malzeme yok. İlk malzemenizi ekleyin.</div>}
    </div>

    {/* Add material */}
    {addOpen && <div className="modal-backdrop" onClick={() => setAddOpen(false)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setAddOpen(false)} data-testid="close-add-material"><X/></button>
        <span className="eyebrow">YENİ MALZEME</span><h3>Malzeme ekle</h3>
        {error && <div className="form-error" data-testid="material-form-error">{error}</div>}
        <div className="form-grid">
          <label>Malzeme adı<input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="mat-name-input"/></label>
          <label>Kategori
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} data-testid="mat-category-select">
              <option>Ahşap</option><option>Metal</option><option>Aksesuar</option><option>Cam/Ayna</option><option>Kaplama</option><option>Diğer</option>
            </select></label>
        </div>
        <div className="form-grid">
          <label>Birim<input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} data-testid="mat-unit-input"/></label>
          <label>Birim maliyet (₺)<input type="number" min="0" step="0.01" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: e.target.value })} data-testid="mat-cost-input"/></label>
        </div>
        <div className="form-grid">
          <label>Başlangıç stoğu<input type="number" min="0" step="0.01" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} data-testid="mat-stock-input"/></label>
          <label>Min. stok<input type="number" min="0" step="0.01" value={form.min_stock} onChange={e => setForm({ ...form, min_stock: e.target.value })} data-testid="mat-minstock-input"/></label>
        </div>
        <label>Tedarikçi<input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} data-testid="mat-supplier-input"/></label>
        <button className="primary full" onClick={addMaterial} data-testid="save-material-button">Kaydet</button>
      </div>
    </div>}

    {/* Edit material */}
    {editing && <div className="modal-backdrop" onClick={() => setEditing(null)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setEditing(null)} data-testid="close-edit-material"><X/></button>
        <span className="eyebrow">MALZEME DÜZENLE</span><h3>{editing.name}</h3>
        {error && <div className="form-error">{error}</div>}
        <div className="hint">Birim maliyeti değiştirdiğinizde bu malzemeyi kullanan tüm ürünlerin maliyeti otomatik güncellenir.</div>
        <div className="form-grid">
          <label>Malzeme adı<input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} data-testid="edit-name-input"/></label>
          <label>Kategori<input value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })} data-testid="edit-category-input"/></label>
        </div>
        <div className="form-grid">
          <label>Birim maliyet (₺)<input type="number" min="0" step="0.01" value={editing.unit_cost} onChange={e => setEditing({ ...editing, unit_cost: e.target.value })} data-testid="edit-cost-input"/></label>
          <label>Min. stok<input type="number" min="0" step="0.01" value={editing.min_stock} onChange={e => setEditing({ ...editing, min_stock: e.target.value })} data-testid="edit-minstock-input"/></label>
        </div>
        <label>Tedarikçi<input value={editing.supplier || ''} onChange={e => setEditing({ ...editing, supplier: e.target.value })} data-testid="edit-supplier-input"/></label>
        <button className="primary full" onClick={saveEdit} data-testid="update-material-button">Güncelle</button>
      </div>
    </div>}

    {/* Stock entry */}
    {entryFor && <div className="modal-backdrop" onClick={() => setEntryFor(null)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setEntryFor(null)} data-testid="close-stock-entry"><X/></button>
        <span className="eyebrow">STOK GİRİŞİ</span><h3>{entryFor.name}</h3>
        <div className="hint">Mevcut stok: <b>{entryFor.stock} {entryFor.unit}</b> · Mevcut maliyet: <b>{money(entryFor.unit_cost)}</b></div>
        {error && <div className="form-error" data-testid="entry-form-error">{error}</div>}
        <div className="form-grid">
          <label>Giriş miktarı ({entryFor.unit})<input autoFocus type="number" min="0" step="0.01" value={entryForm.quantity} onChange={e => setEntryForm({ ...entryForm, quantity: e.target.value })} data-testid="entry-quantity-input"/></label>
          <label>Alış birim fiyatı (₺)<input type="number" min="0" step="0.01" placeholder="Boşsa maliyet değişmez" value={entryForm.unit_cost} onChange={e => setEntryForm({ ...entryForm, unit_cost: e.target.value })} data-testid="entry-cost-input"/></label>
        </div>
        <div className="form-grid">
          <label>Tedarikçi<input value={entryForm.supplier} onChange={e => setEntryForm({ ...entryForm, supplier: e.target.value })} data-testid="entry-supplier-input"/></label>
          <label>Tarih<input type="date" value={entryForm.date} onChange={e => setEntryForm({ ...entryForm, date: e.target.value })} data-testid="entry-date-input"/></label>
        </div>
        <label>Not<input value={entryForm.note} onChange={e => setEntryForm({ ...entryForm, note: e.target.value })} data-testid="entry-note-input"/></label>
        <button className="primary full" onClick={saveEntry} data-testid="save-entry-button">Girişi kaydet</button>
      </div>
    </div>}

    {/* History */}
    {historyFor && <div className="modal-backdrop" onClick={() => setHistoryFor(null)}>
      <div className="modal wide" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setHistoryFor(null)} data-testid="close-history"><X/></button>
        <span className="eyebrow">GEÇMİŞ & MALİYET ANALİZİ</span><h3>{historyFor.name}</h3>
        <div className="hist-cols">
          <div>
            <div className="hist-head"><PackagePlus size={13}/> STOK GİRİŞLERİ</div>
            <div className="hist-list">
              {history.entries.length ? history.entries.map(e => <div className="hist-row" key={e.id} data-testid={`entry-row-${e.id}`}>
                <div><b>+{e.quantity} {historyFor.unit}</b><small>{e.date}{e.supplier ? ` · ${e.supplier}` : ''}{e.note ? ` · ${e.note}` : ''}</small></div>
                <span>{money(e.unit_cost)}</span>
              </div>) : <div className="empty small">Henüz stok girişi yok.</div>}
            </div>
          </div>
          <div>
            <div className="hist-head"><History size={13}/> FİYAT DEĞİŞİM GEÇMİŞİ</div>
            <div className="hist-list">
              {history.prices.length ? history.prices.map(p => {
                const up = p.new_cost >= p.old_cost;
                return <div className="hist-row" key={p.id} data-testid={`price-row-${p.id}`}>
                  <div><b className={up ? 'up' : 'down'}>{up ? <TrendingUp size={13}/> : <TrendingDown size={13}/>} {money(p.old_cost)} → {money(p.new_cost)}</b>
                    <small>{p.date} · {p.source === 'stock_entry' ? 'Stok girişi' : 'Manuel'}</small></div>
                </div>;
              }) : <div className="empty small">Fiyat değişimi kaydı yok.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>}
  </>;
}
