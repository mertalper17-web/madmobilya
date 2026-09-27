import { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, X, PackageCheck, AlertTriangle, CalendarClock, Clock, CalendarDays } from 'lucide-react';
import './OrdersPage.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const money = (n = 0) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
const STATUSES = ['Planlandı', 'Üretimde', 'Hazır', 'Tamamlandı', 'İptal'];

const emptyForm = { name: '', customer: '', product_id: '', quantity: '1', amount: '', due_date: '', notes: '', discount_id: '' };

const daysLeft = (due) => {
  if (!due) return null;
  const d = new Date(due + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
};
const deadlineLabel = (n) => {
  if (n === null) return { text: '—', cls: '' };
  if (n < 0) return { text: `${Math.abs(n)} gün gecikti`, cls: 'overdue' };
  if (n === 0) return { text: 'Bugün teslim', cls: 'today' };
  if (n <= 3) return { text: `${n} gün kaldı`, cls: 'soon' };
  return { text: `${n} gün kaldı`, cls: 'ok' };
};

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [summary, setSummary] = useState({ stats: {} });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState(null);

  const load = async () => {
    const [o, p, d, s] = await Promise.all([
      axios.get(`${API}/orders?t=${Date.now()}`),
      axios.get(`${API}/products?t=${Date.now()}`),
      axios.get(`${API}/discounts?t=${Date.now()}`),
      axios.get(`${API}/orders/summary?t=${Date.now()}`),
    ]);
    setOrders(o.data); setProducts(p.data);
    setDiscounts(d.data.filter(x => x.active)); setSummary(s.data);
  };
  useEffect(() => { load(); }, []);

  const selectedProduct = products.find(x => x.id === form.product_id);
  const selectedDiscount = discounts.find(x => x.id === form.discount_id);
  const baseAmount = form.amount ? Number(form.amount) : (selectedProduct ? Number(selectedProduct.suggested_price || 0) * Number(form.quantity || 1) : 0);
  const discountRate = selectedDiscount ? Number(selectedDiscount.rate) : 0;
  const finalAmount = baseAmount * (1 - discountRate / 100);

  const save = async () => {
    setError('');
    try {
      await axios.post(`${API}/orders`, {
        name: form.name, customer: form.customer, product_id: form.product_id || null,
        quantity: Number(form.quantity) || 1,
        amount: form.amount ? Number(form.amount) : baseAmount,
        due_date: form.due_date, notes: form.notes, status: 'Planlandı',
        discount_rate: discountRate, discount_name: selectedDiscount?.name || '',
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
      if (res.data.warnings?.length) setBanner({ kind: 'warn', text: `Stok uyarısı: ${res.data.warnings.join(', ')}` });
      else if (res.data.stock_updates?.length) setBanner({ kind: 'ok', text: `Stok güncellendi: ${res.data.stock_updates.length} malzeme düşüldü` });
      load();
    } catch (e) {
      setBanner({ kind: 'err', text: e.response?.data?.detail || 'Sipariş güncellenemedi' });
    }
  };

  const st = summary.stats || {};

  return <>
    <div className="page-toolbar">
      <div><p className="page-note">ÜRETİM & SİPARİŞ / {orders.length} KAYIT</p><h2>Sipariş ve teslimat takibi</h2></div>
      <button className="primary" onClick={() => { setForm(emptyForm); setError(''); setOpen(true); }} data-testid="add-order-button"><Plus size={16}/> Yeni sipariş</button>
    </div>

    <div className="order-summary">
      <div className="osum-card" data-testid="summary-today"><div className="osum-ic today"><CalendarDays size={18}/></div><div><b>{st.today_count || 0}</b><small>Bugün açılan</small></div></div>
      <div className="osum-card" data-testid="summary-active"><div className="osum-ic active"><Clock size={18}/></div><div><b>{st.active_count || 0}</b><small>Aktif sipariş</small></div></div>
      <div className="osum-card" data-testid="summary-soon"><div className="osum-ic soon"><CalendarClock size={18}/></div><div><b>{st.due_soon_count || 0}</b><small>3 gün içinde teslim</small></div></div>
      <div className="osum-card" data-testid="summary-overdue"><div className="osum-ic overdue"><AlertTriangle size={18}/></div><div><b>{st.overdue_count || 0}</b><small>Geciken sipariş</small></div></div>
    </div>

    {banner && <div className={`order-banner ${banner.kind}`} data-testid="order-banner">
      {banner.kind === 'warn' && <AlertTriangle size={16}/>}
      {banner.kind === 'ok' && <PackageCheck size={16}/>}
      <span>{banner.text}</span>
      <button onClick={() => setBanner(null)} className="modal-close" style={{ position: 'static' }}><X size={14}/></button>
    </div>}

    <section className="panel table-panel">
      <div className="table-scroll"><table><thead><tr>
        <th>Sipariş</th><th>Müşteri</th><th>Ürün</th><th>Adet</th><th>Tutar</th><th>Termin</th><th>Kalan süre</th><th>Durum</th>
      </tr></thead><tbody>
        {orders.map(o => {
          const active = o.status !== 'Tamamlandı' && o.status !== 'İptal';
          const dl = active ? deadlineLabel(daysLeft(o.due_date)) : { text: '—', cls: '' };
          return <tr key={o.id}>
            <td><b data-testid={`order-name-${o.id}`}>{o.name}</b><small className="cell-sub">{o.date}</small></td>
            <td>{o.customer || '—'}</td>
            <td>{o.product_name || '—'}</td>
            <td>{o.quantity || 1}</td>
            <td>{money(o.amount)}{o.discount_name && <small className="cell-sub">{o.discount_name} %{o.discount_rate}</small>}</td>
            <td>{o.due_date || '—'}</td>
            <td><span className={`deadline ${dl.cls}`} data-testid={`order-deadline-${o.id}`}>{dl.text}</span></td>
            <td>
              <select className={`status-select status-${(o.status || '').toLowerCase()}`} value={o.status || 'Planlandı'}
                disabled={o.status === 'Tamamlandı' || o.status === 'İptal'}
                onChange={e => changeStatus(o, e.target.value)}
                data-testid={`order-status-${o.id}`}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </td>
          </tr>;
        })}
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
        <div className="form-grid">
          <label>Tutar (₺)<input type="number" placeholder={selectedProduct ? `Otomatik: ${money(baseAmount)}` : ''} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} data-testid="order-amount-input"/></label>
          <label>İskonto
            <select value={form.discount_id} onChange={e => setForm({ ...form, discount_id: e.target.value })} data-testid="order-discount-select">
              <option value="">— İskonto yok —</option>
              {discounts.map(d => <option key={d.id} value={d.id}>{d.name} · %{d.rate}</option>)}
            </select>
          </label>
        </div>
        {discountRate > 0 && baseAmount > 0 && <div className="hint" data-testid="order-discount-hint">
          Liste tutarı {money(baseAmount)} · İskonto %{discountRate} → <b>Net tutar: {money(finalAmount)}</b>
        </div>}
        {selectedProduct && <div className="hint">Bu sipariş "Tamamlandı" olduğunda ürün reçetesine göre {selectedProduct.name} için {form.quantity || 1} adet malzeme düşülecek.</div>}
        <button className="primary full" onClick={save} data-testid="save-order-button">Siparişi kaydet</button>
      </div>
    </div>}
  </>;
}
