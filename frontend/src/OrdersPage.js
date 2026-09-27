import { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, X, PackageCheck, AlertTriangle } from 'lucide-react';
import './OrdersPage.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const money = (n = 0) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
const STATUSES = ['Planlandı', 'Üretimde', 'Hazır', 'Tamamlandı', 'İptal'];

const emptyForm = { name: '', customer: '', product_id: '', quantity: '1', amount: '', due_date: '', notes: '' };

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState(null);

  const load = async () => {
    const [o, p] = await Promise.all([
      axios.get(`${API}/orders?t=${Date.now()}`),
      axios.get(`${API}/products?t=${Date.now()}`)
    ]);
    setOrders(o.data); setProducts(p.data);
  };
  useEffect(() => { load(); }, []);

  const selectedProduct = products.find(x => x.id === form.product_id);
  const autoAmount = selectedProduct ? Number(selectedProduct.suggested_price || 0) * Number(form.quantity || 1) : 0;

  const save = async () => {
    setError('');
    try {
      await axios.post(`${API}/orders`, {
        name: form.name, customer: form.customer, product_id: form.product_id || null,
        quantity: Number(form.quantity) || 1,
        amount: form.amount ? Number(form.amount) : autoAmount,
        due_date: form.due_date, notes: form.notes, status: 'Planlandı'
      });
      setOpen(false); setForm(emptyForm); load();
    } catch (e) {
      setError(e.response?.data?.detail?.[0]?.msg || e.response?.data?.detail || 'Sipariş kaydedilemedi.');
    }
  };

  const changeStatus = async (order, status) => {
    setBanner(null);
    try {
      const res = await axios.patch(`${API}/orders/${order.id}`, { status });
      if (res.data.warnings?.length) {
        setBanner({ kind: 'warn', text: `Stok uyarısı: ${res.data.warnings.join(', ')}` });
      } else if (res.data.stock_updates?.length) {
        setBanner({ kind: 'ok', text: `Stok güncellendi: ${res.data.stock_updates.length} malzeme düşüldü` });
      }
      load();
    } catch (e) {
      setBanner({ kind: 'err', text: e.response?.data?.detail || 'Sipariş güncellenemedi' });
    }
  };

  return <>
    <div className="page-toolbar">
      <div><p className="page-note">ÜRETİM & SİPARİŞ / {orders.length} KAYIT</p><h2>Sipariş ve teslimat takibi</h2></div>
      <button className="primary" onClick={() => { setForm(emptyForm); setError(''); setOpen(true); }} data-testid="add-order-button"><Plus size={16}/> Yeni sipariş</button>
    </div>

    {banner && <div className={`order-banner ${banner.kind}`} data-testid="order-banner">
      {banner.kind === 'warn' && <AlertTriangle size={16}/>}
      {banner.kind === 'ok' && <PackageCheck size={16}/>}
      <span>{banner.text}</span>
      <button onClick={() => setBanner(null)} className="modal-close" style={{position:'static'}}><X size={14}/></button>
    </div>}

    <section className="panel table-panel">
      <div className="table-scroll"><table><thead><tr>
        <th>Sipariş</th><th>Müşteri</th><th>Ürün</th><th>Adet</th><th>Tutar</th><th>Termin</th><th>Durum</th>
      </tr></thead><tbody>
        {orders.map(o => <tr key={o.id}>
          <td><b data-testid={`order-name-${o.id}`}>{o.name}</b><small className="cell-sub">{o.date}</small></td>
          <td>{o.customer || '—'}</td>
          <td>{o.product_name || '—'}</td>
          <td>{o.quantity || 1}</td>
          <td>{money(o.amount)}</td>
          <td>{o.due_date || '—'}</td>
          <td>
            <select className={`status-select status-${(o.status || '').toLowerCase()}`} value={o.status || 'Planlandı'}
              disabled={o.status === 'Tamamlandı' || o.status === 'İptal'}
              onChange={e => changeStatus(o, e.target.value)}
              data-testid={`order-status-${o.id}`}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </td>
        </tr>)}
      </tbody></table>
      {!orders.length && <div className="empty" data-testid="orders-empty-state">Henüz sipariş yok. İlk siparişinizi oluşturun.</div>}
      </div>
    </section>

    {open && <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal order-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setOpen(false)} data-testid="close-order-modal"><X/></button>
        <span className="eyebrow">YENİ SİPARİŞ</span>
        <h3>Sipariş oluştur</h3>
        {error && <div className="form-error" role="alert" data-testid="order-form-error">{error}</div>}
        <label>Sipariş adı / referans<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="order-name-input"/></label>
        <label>Müşteri<input value={form.customer} onChange={e => setForm({ ...form, customer: e.target.value })} data-testid="order-customer-input"/></label>
        <label>Ürün (stok düşümü için)
          <select value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })} data-testid="order-product-select">
            <option value="">— Ürünsüz sipariş —</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name} · {money(p.suggested_price)}</option>)}
          </select>
        </label>
        <div className="form-grid">
          <label>Adet<input type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} data-testid="order-quantity-input"/></label>
          <label>Termin tarihi<input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} data-testid="order-duedate-input"/></label>
        </div>
        <label>Tutar (₺)<input type="number" placeholder={selectedProduct ? `Otomatik: ${money(autoAmount)}` : ''} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} data-testid="order-amount-input"/></label>
        {selectedProduct && <div className="hint">Bu sipariş "Tamamlandı" olduğunda ürün reçetesine göre {selectedProduct.name} için {form.quantity || 1} adet malzeme düşülecek.</div>}
        <button className="primary full" onClick={save} data-testid="save-order-button">Siparişi kaydet</button>
      </div>
    </div>}
  </>;
}
