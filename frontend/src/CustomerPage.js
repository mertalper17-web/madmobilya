import { useEffect, useState } from 'react';
import axios from 'axios';
import jsPDF from 'jspdf';
import { Plus, X, WalletCards, FileText, UserRound, History, Download, Eye } from 'lucide-react';
import './CustomerPage.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const money = (n = 0) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
const num = (n = 0) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function tryToTurkishWords(n) {
  const ones = ['', 'BİR', 'İKİ', 'ÜÇ', 'DÖRT', 'BEŞ', 'ALTI', 'YEDİ', 'SEKİZ', 'DOKUZ'];
  const tens = ['', 'ON', 'YİRMİ', 'OTUZ', 'KIRK', 'ELLİ', 'ALTMIŞ', 'YETMİŞ', 'SEKSEN', 'DOKSAN'];
  const scale = ['', 'BİN', 'MİLYON', 'MİLYAR'];
  const hundred = (x) => {
    let s = '';
    const h = Math.floor(x / 100), rest = x % 100;
    if (h) s += (h === 1 ? '' : ones[h]) + 'YÜZ';
    if (rest) s += tens[Math.floor(rest / 10)] + ones[rest % 10];
    return s;
  };
  const int = Math.floor(n);
  if (!int) return 'SIFIR';
  let parts = [], k = int, i = 0;
  while (k > 0) {
    const chunk = k % 1000;
    if (chunk) {
      let w = hundred(chunk);
      if (i === 1 && chunk === 1) w = '';
      parts.unshift(w + scale[i]);
    }
    k = Math.floor(k / 1000); i++;
  }
  const kur = Math.round((n - int) * 100);
  return parts.join(' ') + ' TL' + (kur ? ` ${kur} KRŞ` : '');
}

function generateSenetPDF(customer, sale) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' });
  doc.setFont('helvetica', 'normal');
  doc.setDrawColor(60, 45, 25); doc.setLineWidth(0.6);
  doc.rect(6, 6, 198, 136);
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text('SENET / BONO', 105, 18, { align: 'center' });
  doc.setLineWidth(0.2); doc.line(60, 20, 150, 20);

  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Senet No: ${sale.promissory_no || sale.id.slice(0, 8).toUpperCase()}`, 12, 30);
  doc.text(`Duzenlenme Tarihi: ${sale.date}`, 12, 36);
  doc.text(`Vade Tarihi: ${sale.due_date || '—'}`, 12, 42);

  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text(`Tutar: ${money(sale.amount)}`, 145, 30);
  doc.setFontSize(8); doc.setFont('helvetica', 'italic');
  doc.text(`(${tryToTurkishWords(sale.amount)})`, 145, 36, { maxWidth: 55 });

  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  const body = `Isbu senet karsiliginda yukarida yazili vade tarihinde ${money(sale.amount)} (${tryToTurkishWords(sale.amount)}) tutarindaki bedeli kayitsiz ve sartsiz odeyecegimi taahhut ederim.`;
  doc.text(body, 12, 62, { maxWidth: 186 });

  doc.setFont('helvetica', 'bold');
  doc.text('BORCLU:', 12, 92);
  doc.setFont('helvetica', 'normal');
  doc.text(customer.name, 32, 92);
  if (customer.address) doc.text(`Adres: ${customer.address}`, 12, 100, { maxWidth: 120 });
  if (customer.phone) doc.text(`Telefon: ${customer.phone}`, 12, 108);
  if (customer.tax_number) doc.text(`VKN/TCKN: ${customer.tax_number}`, 12, 114);

  doc.setFont('helvetica', 'bold'); doc.text('ALACAKLI:', 12, 124);
  doc.setFont('helvetica', 'normal'); doc.text('Atolye360 Mobilya', 32, 124);

  doc.setDrawColor(140, 120, 90); doc.line(145, 128, 195, 128);
  doc.setFontSize(9); doc.text('Imza', 165, 133);

  doc.text(`Aciklama: ${sale.description}`, 12, 132, { maxWidth: 120 });
  doc.save(`senet-${customer.name.replace(/\s+/g, '_')}-${(sale.promissory_no || sale.id.slice(0, 6))}.pdf`);
}

export default function CustomerPage() {
  const [data, setData] = useState({ customers: [], stats: {} });
  const [mode, setMode] = useState(null);
  const [error, setError] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [history, setHistory] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', tax_number: '', notes: '', description: '', amount: '', due_date: '', promissory_no: '', payment_method: 'Nakit', note: '' });

  const load = () => axios.get(`${API}/customers/summary?fresh=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } }).then(r => setData(r.data)).catch(console.error);
  useEffect(() => { load(); }, []);

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const reset = () => setForm({ name: '', phone: '', address: '', tax_number: '', notes: '', description: '', amount: '', due_date: '', promissory_no: '', payment_method: 'Nakit', note: '' });

  const save = async () => {
    setError('');
    if ((mode === 'sale' || mode === 'payment') && (!form.amount || Number(form.amount) <= 0)) {
      setError('Tutar 0 TL üzeri olmalı.'); return;
    }
    if (mode === 'sale' && !form.due_date) { setError('Vade tarihi seçin.'); return; }
    try {
      if (mode === 'customer') await axios.post(`${API}/customers`, { name: form.name, phone: form.phone, address: form.address, tax_number: form.tax_number, notes: form.notes });
      if (mode === 'sale') await axios.post(`${API}/customers/${customerId}/credit-sales`, { description: form.description, amount: Number(form.amount), due_date: form.due_date, promissory_no: form.promissory_no });
      if (mode === 'payment') await axios.post(`${API}/customers/${customerId}/payments`, { amount: Number(form.amount), payment_method: form.payment_method, note: form.note });
      setMode(null); reset(); load();
      if (history) openHistory(customerId);
    } catch (e) {
      setError(e.response?.data?.detail?.[0]?.msg || e.response?.data?.detail || 'Kayıt sırasında bir sorun oluştu.');
    }
  };

  const openHistory = async (id) => {
    try {
      const r = await axios.get(`${API}/customers/${id}/history?t=${Date.now()}`);
      setHistory(r.data); setCustomerId(id);
    } catch (e) { console.error(e); }
  };

  const selected = data.customers.find(x => x.id === customerId);

  return <>
    <div className="page-toolbar">
      <div><p className="page-note">CARİ HESAPLAR / {data.stats.customer_count || 0} MÜŞTERİ</p><h2>Müşteriler ve tahsilatlar</h2></div>
      <button className="primary" onClick={() => { reset(); setError(''); setMode('customer'); }} data-testid="add-customer-button"><Plus size={16}/> Yeni müşteri</button>
    </div>

    <div className="customer-stats">
      <div className="customer-stat"><UserRound size={18}/><span>Toplam müşteri<strong data-testid="customer-count">{data.stats.customer_count || 0}</strong></span></div>
      <div className="customer-stat"><FileText size={18}/><span>Senetli satış<strong data-testid="credit-sales-total">{money(data.stats.credit_sales)}</strong></span></div>
      <div className="customer-stat warning"><WalletCards size={18}/><span>Kalan bakiye<strong data-testid="open-balance-total">{money(data.stats.open_balance)}</strong></span></div>
      <div className="customer-stat success"><History size={18}/><span>Tahsil edilen<strong data-testid="payments-total">{money(data.stats.payments)}</strong></span></div>
    </div>

    <section className="panel table-panel customer-panel">
      <div className="customer-table-head">
        <div><span className="eyebrow">CARİ LİSTESİ</span><h3>Alışveriş ve bakiye bilgileri</h3></div>
        <span className="table-hint">Detay için müşteriye tıklayın · Senetli satış ve tahsilat ekleyin</span>
      </div>
      <div className="table-scroll"><table><thead><tr>
        <th>Müşteri</th><th>İletişim</th><th>Alışveriş</th><th>Ödenen</th><th>Kalan bakiye</th><th>İşlemler</th>
      </tr></thead><tbody>
        {data.customers.map(x => <tr key={x.id}>
          <td><b data-testid={`customer-name-${x.id}`}>{x.name}</b><small className="cell-sub">{x.purchase_count} alışveriş</small></td>
          <td>{x.phone || '—'}</td>
          <td>{money(x.total_purchases)}</td>
          <td className="positive">{money(x.total_paid)}</td>
          <td><span className={x.balance ? 'pill danger' : 'pill success'} data-testid={`customer-balance-${x.id}`}>{money(x.balance)}</span></td>
          <td><div className="row-actions">
            <button className="table-action" onClick={() => openHistory(x.id)} data-testid={`view-history-${x.id}`}><Eye size={12}/> Detay</button>
            <button className="table-action" onClick={() => { setCustomerId(x.id); reset(); setError(''); setMode('sale'); }} data-testid={`add-credit-sale-${x.id}`}>+ Senetli satış</button>
            <button className="table-action muted-action" onClick={() => { setCustomerId(x.id); reset(); setError(''); setMode('payment'); }} data-testid={`add-payment-${x.id}`}>Tahsilat</button>
          </div></td>
        </tr>)}
      </tbody></table>
      {!data.customers.length && <div className="empty" data-testid="customers-empty-state">Henüz müşteri kaydı yok. İlk müşterinizi ekleyin.</div>}
      </div>
    </section>

    {mode && <div className="modal-backdrop" onClick={() => setMode(null)}>
      <div className="modal customer-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setMode(null)} data-testid="close-customer-modal"><X/></button>
        <span className="eyebrow">{mode === 'customer' ? 'YENİ CARİ KAYIT' : mode === 'sale' ? 'SENETLİ SATIŞ' : 'TAHSİLAT GİRİŞİ'}</span>
        <h3>{mode === 'customer' ? 'Müşteri ekle' : mode === 'sale' ? `${selected?.name || ''} için satış` : `${selected?.name || ''} için tahsilat`}</h3>
        {error && <div className="form-error" role="alert" data-testid="customer-form-error">{error}</div>}
        {mode === 'customer' ? <>
          <label>Ad soyad / firma<input value={form.name} onChange={e => update('name', e.target.value)} data-testid="customer-name-input"/></label>
          <label>Telefon<input value={form.phone} onChange={e => update('phone', e.target.value)} data-testid="customer-phone-input"/></label>
          <label>Adres<input value={form.address} onChange={e => update('address', e.target.value)} data-testid="customer-address-input"/></label>
          <label>Vergi no <span className="optional">opsiyonel</span><input value={form.tax_number} onChange={e => update('tax_number', e.target.value)} data-testid="customer-tax-input"/></label>
        </> : mode === 'sale' ? <>
          <label>Alışveriş / ürün açıklaması<input value={form.description} onChange={e => update('description', e.target.value)} data-testid="credit-sale-description-input"/></label>
          <label>Satış tutarı (₺)<input type="number" min="0" step="0.01" value={form.amount} onChange={e => update('amount', e.target.value)} data-testid="credit-sale-amount-input"/></label>
          <div className="form-grid">
            <label>Vade tarihi<input type="date" value={form.due_date} onChange={e => update('due_date', e.target.value)} data-testid="credit-sale-due-date-input"/></label>
            <label>Senet no <span className="optional">opsiyonel</span><input value={form.promissory_no} onChange={e => update('promissory_no', e.target.value)} data-testid="promissory-number-input"/></label>
          </div>
        </> : <>
          <label>Tahsilat tutarı (₺)<input type="number" min="0" step="0.01" value={form.amount} onChange={e => update('amount', e.target.value)} data-testid="payment-amount-input"/></label>
          <label>Ödeme yöntemi<select value={form.payment_method} onChange={e => update('payment_method', e.target.value)} data-testid="payment-method-select">
            <option>Nakit</option><option>Havale / EFT</option><option>Kart</option><option>Çek</option>
          </select></label>
          <label>Not <span className="optional">opsiyonel</span><input value={form.note} onChange={e => update('note', e.target.value)} data-testid="payment-note-input"/></label>
        </>}
        <button className="primary full" onClick={save} data-testid={`save-${mode}-button`}>Kaydet</button>
      </div>
    </div>}

    {history && <div className="modal-backdrop" onClick={() => setHistory(null)}>
      <div className="modal customer-modal history-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setHistory(null)} data-testid="close-history-modal"><X/></button>
        <span className="eyebrow">HESAP EKSTRESİ</span>
        <h3>{history.customer.name}</h3>
        <div className="history-summary">
          <div><small>Toplam alışveriş</small><b>{money(history.totals.purchases)}</b></div>
          <div><small>Ödenen</small><b className="positive">{money(history.totals.paid)}</b></div>
          <div className="highlight"><small>Kalan bakiye</small><b>{money(history.totals.balance)}</b></div>
        </div>

        <div className="history-section">
          <span className="eyebrow">SENETLİ SATIŞLAR</span>
          {history.sales.length ? history.sales.map(s => <div className="history-row" key={s.id}>
            <div>
              <b>{s.description}</b>
              <small>{s.date} · Vade {s.due_date} {s.promissory_no ? `· No: ${s.promissory_no}` : ''}</small>
            </div>
            <div className="history-amount">{money(s.amount)}</div>
            <button className="table-action" onClick={() => generateSenetPDF(history.customer, s)} data-testid={`download-senet-${s.id}`}><Download size={12}/> Senet</button>
          </div>) : <div className="empty">Bu müşteri için senetli satış yok.</div>}
        </div>

        <div className="history-section">
          <span className="eyebrow">TAHSİLATLAR</span>
          {history.payments.length ? history.payments.map(p => <div className="history-row" key={p.id}>
            <div>
              <b>{p.payment_method}</b>
              <small>{p.date} {p.note ? `· ${p.note}` : ''}</small>
            </div>
            <div className="history-amount positive">{money(p.amount)}</div>
          </div>) : <div className="empty">Henüz tahsilat kaydı yok.</div>}
        </div>
      </div>
    </div>}
  </>;
}
