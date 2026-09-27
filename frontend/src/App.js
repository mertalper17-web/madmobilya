import { useEffect, useState } from 'react';
import axios from 'axios';
import { BrowserRouter, NavLink, Routes, Route, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, Boxes, ShoppingCart, ReceiptText, ClipboardList, Plus, Bell, Search, ArrowUpRight, Menu, X, UserRound } from 'lucide-react';
import CustomerPage from '@/CustomerPage';
import ProductsPage from '@/ProductsPage';
import OrdersPage from '@/OrdersPage';
import '@/App.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const money = (n = 0) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
const nav = [
  { to: '/', label: 'Genel Bakış', icon: LayoutDashboard },
  { to: '/products', label: 'Ürünler & Reçeteler', icon: Package },
  { to: '/materials', label: 'Malzemeler', icon: Boxes },
  { to: '/customers', label: 'Müşteriler & Cari', icon: UserRound },
  { to: '/orders', label: 'Siparişler', icon: ClipboardList },
  { to: '/sales', label: 'Satışlar', icon: ShoppingCart },
  { to: '/expenses', label: 'Giderler', icon: ReceiptText },
];

function Shell({ children }) {
  const [open, setOpen] = useState(false); const [notice, setNotice] = useState(false); const loc = useLocation();
  const title = nav.find(x => x.to === loc.pathname)?.label || 'Genel Bakış';
  return <div className="app-shell">
    <aside className={open ? 'sidebar open' : 'sidebar'}>
      <div className="brand">
        <img src="/logo.jpg" alt="MAD Mobilya" className="brand-logo" data-testid="brand-logo"/>
        <div className="brand-text"><b>MAD<span> MOBİLYA</span></b><small>Kalite · Tasarım · Güven</small></div>
        <button className="close-menu" onClick={() => setOpen(false)} data-testid="close-menu-button"><X size={18}/></button>
      </div>
      <nav>{nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''} data-testid={`nav-${label.toLowerCase().replaceAll(' ', '-').replaceAll('&', 'and')}`}><Icon size={18}/><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-foot"><div className="avatar">MM</div><div><b>MAD Mobilya</b><small>Yönetici hesabı</small></div></div>
    </aside>
    <main className="main">
      <header>
        <button className="menu-btn" onClick={() => setOpen(true)} data-testid="open-menu-button"><Menu/></button>
        <div><p className="eyebrow">MAD MOBİLYA · İŞLETME PANELİ</p><h1>{title}</h1></div>
        <div className="header-actions">
          <div className="search"><Search size={16}/><input placeholder="Ara..." data-testid="global-search-input"/></div>
          <button className="icon-btn" onClick={() => setNotice(!notice)} aria-label="Bildirimleri aç" data-testid="notifications-button"><Bell size={18}/><em/></button>
          {notice && <span className="notice-popover" data-testid="notifications-popover">Yeni bildirim yok</span>}
        </div>
      </header>
      {children}
    </main>
  </div>;
}

function Stat({ label, value, change, positive = true, accent }) {
  return <div className="stat" data-testid={`stat-${label.toLowerCase().replaceAll(' ', '-')}`}>
    <div className="stat-top"><span>{label}</span><span className={`trend ${positive ? 'up' : 'down'}`}><ArrowUpRight size={13}/>{change}</span></div>
    <strong style={{ color: accent }}>{value}</strong><small>Önceki aya göre</small>
  </div>;
}

function Dashboard({ data }) {
  const t = data.transactions || [];
  return <>
    <section className="welcome">
      <div><span className="tag">MAD MOBİLYA · KONTROL PANELİ</span><h2>Hoş geldiniz, <span>MAD Mobilya.</span></h2><p>Atölyenizin bugünkü performansına birlikte bakalım.</p></div>
      <img src="https://images.unsplash.com/photo-1712171984530-e25a4aaa46dd?q=85&fm=jpg&crop=entropy&cs=srgb" alt="Atölyede ahşap masa" data-testid="workshop-image"/>
    </section>
    <div className="stats">
      <Stat label="Bu ay satış" value={money(data.stats?.sales)} change="12.8%" accent="#d8a15d"/>
      <Stat label="Toplam gider" value={money(data.stats?.expenses)} change="4.2%" positive={false} accent="#e27861"/>
      <Stat label="Net kâr" value={money(data.stats?.profit)} change="18.6%" accent="#9acb9b"/>
      <Stat label="Aktif sipariş" value={data.stats?.order_count || 0} change="3 yeni" accent="#d8a15d"/>
    </div>
    <div className="grid-main">
      <section className="panel chart-panel">
        <div className="panel-head"><div><span className="eyebrow">FİNANSAL ÖZET</span><h3>Gelir ve gider akışı</h3></div>
          <select data-testid="chart-period-select"><option>Son 6 ay</option><option>Bu yıl</option></select></div>
        <div className="chart">
          <div className="y-labels"><span>₺40k</span><span>₺30k</span><span>₺20k</span><span>₺10k</span><span>₺0</span></div>
          <div className="bars">{['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz'].map((m, i) => <div className="bar-col" key={m}>
            <div className="bar-wrap"><div className="bar income" style={{ height: [48, 62, 55, 72, 66, 82][i] + '%' }}/><div className="bar expense" style={{ height: [28, 40, 34, 45, 39, 51][i] + '%' }}/></div><small>{m}</small></div>)}</div>
          <div className="legend"><span><i className="dot gold"/>Gelir</span><span><i className="dot coral"/>Gider</span></div>
        </div>
      </section>
      <section className="panel activity">
        <div className="panel-head"><div><span className="eyebrow">SON HAREKETLER</span><h3>Finansal akış</h3></div>
          <NavLink to="/sales" className="text-link" data-testid="view-all-transactions-link">Tümünü gör →</NavLink></div>
        {t.length ? t.slice(0, 5).map((x, i) => <div className="activity-row" key={x.id || i}>
          <div className={`activity-icon ${x.type}`}><span>{x.type === 'sale' || x.type === 'credit_sale' ? '↗' : '↘'}</span></div>
          <div><b>{x.description}</b><small>{x.date || 'Bugün'}</small></div>
          <strong className={x.type === 'expense' ? 'negative' : 'positive'}>{x.type === 'expense' ? '-' : '+'}{money(x.amount)}</strong>
        </div>) : <div className="empty">Henüz finansal hareket yok.</div>}
      </section>
    </div>
    <div className="bottom-grid">
      <section className="panel stock">
        <div className="panel-head"><div><span className="eyebrow">STOK DURUMU</span><h3>Takip gerektiren malzemeler</h3></div>
          <NavLink to="/materials" className="text-link" data-testid="view-materials-link">Stok yönetimi →</NavLink></div>
        {(data.materials || []).slice(0, 4).map(x => <div className="stock-row" key={x.id}>
          <div><b>{x.name}</b><small>{x.supplier || 'Tedarikçi belirtilmemiş'}</small></div>
          <span className={x.stock <= x.min_stock ? 'low' : ''}>{x.stock} {x.unit}</span></div>)}
        {!(data.materials || []).length && <div className="empty">Henüz malzeme yok.</div>}
      </section>
      <section className="panel spotlight">
        <div className="spot-img"><img src="https://images.unsplash.com/photo-1546484396-fb3fc6f95f98?q=85&fm=jpg&crop=entropy&cs=srgb" alt="Ahşap dokusu"/></div>
        <div><span className="eyebrow">ATÖLYE NOTU</span><h3>Sipariş tamamlanınca stok otomatik düşer</h3>
          <p>Siparişi "Tamamlandı" olarak işaretlediğinizde ürün reçetesindeki malzemeler otomatik olarak stoktan düşülür.</p>
          <NavLink to="/orders" className="text-link" data-testid="review-materials-link">Siparişleri yönet →</NavLink></div>
      </section>
    </div>
  </>;
}

function TablePage({ type, data, refresh }) {
  const isMaterials = type === 'materials';
  const items = isMaterials ? data.materials : data.transactions?.filter(x => type === 'sales' ? (x.type === 'sale' || x.type === 'credit_sale') : x.type === 'expense');
  const [modal, setModal] = useState(false); const [name, setName] = useState(''); const [amount, setAmount] = useState(''); const [error, setError] = useState('');

  const add = async () => {
    setError('');
    try {
      if (isMaterials) {
        if (!name.trim()) return setError('Malzeme adı gerekli.');
        await axios.post(`${API}/materials`, { name, unit: 'm²', stock: 10, min_stock: 3, unit_cost: Number(amount) || 0, supplier: 'Yeni tedarikçi' });
      } else {
        if (!name.trim()) return setError('Açıklama gerekli.');
        if (!amount || Number(amount) <= 0) return setError('Tutar 0 TL üzeri olmalı.');
        await axios.post(`${API}/transactions`, { type: type === 'sales' ? 'sale' : 'expense', description: name, amount: Number(amount) });
      }
      setModal(false); setName(''); setAmount(''); refresh();
    } catch (e) { setError(e.response?.data?.detail?.[0]?.msg || 'Kayıt eklenemedi.'); }
  };

  const headers = isMaterials ? ['Malzeme', 'Kategori', 'Stok', 'Birim maliyet', 'Tedarikçi'] : ['Açıklama', 'Tarih', 'Tutar', 'Durum'];

  return <>
    <div className="page-toolbar">
      <div><p className="page-note">{items?.length || 0} kayıt</p>
        <h2>{isMaterials ? 'Malzeme ve stok takibi' : type === 'sales' ? 'Satış kayıtları' : 'İşletme giderleri'}</h2></div>
      <button className="primary" onClick={() => { setError(''); setModal(true); }} data-testid={`add-${type}-button`}><Plus size={16}/> Yeni ekle</button>
    </div>
    <section className="panel table-panel"><div className="table-scroll"><table>
      <thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{(items || []).map((x, i) => <tr key={x.id || i}>
        {isMaterials ? <>
          <td><b>{x.name}</b></td><td>{x.category}</td>
          <td><span className={x.stock <= x.min_stock ? 'pill danger' : 'pill'} data-testid={`material-stock-${x.id}`}>{x.stock} {x.unit}</span></td>
          <td>{money(x.unit_cost)}</td><td>{x.supplier || '—'}</td>
        </> : <>
          <td><b>{x.description}</b>{x.sale_type && <small className="cell-sub">{x.sale_type}</small>}</td>
          <td>{x.date || '—'}</td>
          <td className={x.type === 'expense' ? 'negative' : 'positive'}>{money(x.amount)}</td>
          <td><span className="pill success">{x.status}</span></td>
        </>}
      </tr>)}</tbody></table>
      {!items?.length && <div className="empty">Henüz kayıt bulunmuyor. Yeni kayıt ekleyerek başlayın.</div>}
    </div></section>
    {modal && <div className="modal-backdrop" onClick={() => setModal(false)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setModal(false)} data-testid="close-modal-button"><X/></button>
        <span className="eyebrow">YENİ KAYIT</span>
        <h3>{isMaterials ? 'Malzeme ekle' : type === 'sales' ? 'Satış ekle' : 'Gider ekle'}</h3>
        {error && <div className="form-error" role="alert" data-testid="record-form-error">{error}</div>}
        <label>Ad / açıklama<input autoFocus value={name} onChange={e => setName(e.target.value)} data-testid="record-name-input"/></label>
        <label>{isMaterials ? 'Birim maliyet (₺)' : 'Tutar (₺)'}<input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} data-testid="record-amount-input"/></label>
        <button className="primary full" onClick={add} data-testid="save-record-button">Kaydet</button>
      </div>
    </div>}
  </>;
}

function App() {
  const [data, setData] = useState({ stats: {} });
  const refresh = () => axios.get(`${API}/dashboard?fresh=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } }).then(r => setData(r.data)).catch(console.error);
  useEffect(() => { refresh(); }, []);
  return <BrowserRouter><Shell><Routes>
    <Route path="/" element={<Dashboard data={data}/>}/>
    <Route path="/products" element={<ProductsPage/>}/>
    <Route path="/materials" element={<TablePage type="materials" data={data} refresh={refresh}/>}/>
    <Route path="/customers" element={<CustomerPage/>}/>
    <Route path="/orders" element={<OrdersPage/>}/>
    <Route path="/sales" element={<TablePage type="sales" data={data} refresh={refresh}/>}/>
    <Route path="/expenses" element={<TablePage type="expenses" data={data} refresh={refresh}/>}/>
  </Routes></Shell></BrowserRouter>;
}
export default App;
