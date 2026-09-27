import { useEffect, useState } from 'react';
import axios from 'axios';
import { BrowserRouter, NavLink, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, Package, Boxes, ShoppingCart, ReceiptText, ClipboardList, Plus, Bell, Search, ArrowUpRight, Menu, X, UserRound, Calculator, Users, LogOut, Percent, AlertTriangle, FileText, Wrench } from 'lucide-react';
import CustomerPage from '@/CustomerPage';
import ProductsPage from '@/ProductsPage';
import OrdersPage from '@/OrdersPage';
import ConfiguratorPage from '@/ConfiguratorPage';
import MaterialsPage from '@/MaterialsPage';
import DiscountsPage from '@/DiscountsPage';
import QuotesPage from '@/QuotesPage';
import AssemblyPage from '@/AssemblyPage';
import UsersPage from '@/UsersPage';
import LoginPage from '@/LoginPage';
import { AuthProvider, useAuth, canAccess } from '@/AuthContext';
import '@/App.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const money = (n = 0) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
const NAV = [
  { to: '/', label: 'Genel Bakış', icon: LayoutDashboard, key: 'dashboard' },
  { to: '/configurator', label: 'Teklif Hazırla', icon: Calculator, key: 'configurator' },
  { to: '/quotes', label: 'Teklifler', icon: FileText, key: 'quotes' },
  { to: '/products', label: 'Ürünler & Reçeteler', icon: Package, key: 'products' },
  { to: '/materials', label: 'Malzemeler & Stok', icon: Boxes, key: 'materials' },
  { to: '/customers', label: 'Müşteriler & Cari', icon: UserRound, key: 'customers' },
  { to: '/orders', label: 'Siparişler', icon: ClipboardList, key: 'orders' },
  { to: '/assembly', label: 'Montaj Portalı', icon: Wrench, key: 'assembly' },
  { to: '/discounts', label: 'İskontolar', icon: Percent, key: 'discounts' },
  { to: '/sales', label: 'Satışlar', icon: ShoppingCart, key: 'sales' },
  { to: '/expenses', label: 'Giderler', icon: ReceiptText, key: 'expenses' },
  { to: '/users', label: 'Kullanıcılar', icon: Users, key: 'users' },
];
const ROLE_LABEL = { admin: 'Yönetici', muhasebe: 'Muhasebe', depo: 'Depo', sevkiyat: 'Sevkiyat', montaj: 'Montaj', bayi: 'Bayi' };

function Shell({ children }) {
  const [open, setOpen] = useState(false); const [notice, setNotice] = useState(false); const loc = useLocation();
  const { user, logout } = useAuth();
  const [lowStock, setLowStock] = useState([]);
  useEffect(() => {
    axios.get(`${API}/materials/low-stock`).then(r => setLowStock(r.data.materials || [])).catch(() => {});
  }, [loc.pathname]);
  const items = NAV.filter(n => canAccess(user, n.key));
  const title = items.find(x => x.to === loc.pathname)?.label || 'Genel Bakış';
  return <div className="app-shell">
    <aside className={open ? 'sidebar open' : 'sidebar'}>
      <div className="brand">
        <img src="/logo.jpg" alt="MAD Mobilya" className="brand-logo" data-testid="brand-logo"/>
        <div className="brand-text"><b>MAD<span> MOBİLYA</span></b><small>Kalite · Tasarım · Güven</small></div>
        <button className="close-menu" onClick={() => setOpen(false)} data-testid="close-menu-button"><X size={18}/></button>
      </div>
      <nav>{items.map(({ to, label, icon: Icon, key }) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''} data-testid={`nav-${key}`}><Icon size={18}/><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-foot">
        <div className="avatar">{(user?.name || user?.username || 'M').slice(0, 2).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{user?.name || user?.username}</b>
          <small>{ROLE_LABEL[user?.role] || user?.role}</small>
        </div>
        <button className="icon-btn" onClick={logout} aria-label="Çıkış" title="Çıkış Yap" data-testid="logout-button" style={{ background: 'transparent', border: 0, color: '#c4bfae' }}><LogOut size={16}/></button>
      </div>
    </aside>
    <main className="main">
      <header>
        <button className="menu-btn" onClick={() => setOpen(true)} data-testid="open-menu-button"><Menu/></button>
        <div><p className="eyebrow">MAD MOBİLYA · {ROLE_LABEL[user?.role]?.toUpperCase() || 'PANEL'}</p><h1>{title}</h1></div>
        <div className="header-actions">
          <div className="search"><Search size={16}/><input placeholder="Ara..." data-testid="global-search-input"/></div>
          <button className="icon-btn" onClick={() => setNotice(!notice)} aria-label="Bildirimler" data-testid="notifications-button"><Bell size={18}/>{lowStock.length > 0 && <em/>}</button>
          {notice && <div className="notice-popover" data-testid="notifications-popover">
            {lowStock.length ? <>
              <div className="notice-title"><AlertTriangle size={13}/> Kritik stok ({lowStock.length})</div>
              {lowStock.slice(0, 6).map(m => <div className="notice-item" key={m.id} data-testid={`lowstock-item-${m.id}`}>
                <span>{m.name}</span><b>{m.stock} {m.unit}</b></div>)}
              {canAccess(user, 'materials') && <NavLink to="/materials" className="text-link" onClick={() => setNotice(false)} data-testid="notice-goto-materials">Stok yönetimine git →</NavLink>}
            </> : 'Kritik stok yok, her şey yolunda.'}
          </div>}
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
  const { user } = useAuth();
  const t = data.transactions || [];
  return <>
    <section className="welcome">
      <div><span className="tag">MAD MOBİLYA · KONTROL PANELİ</span><h2>Hoş geldiniz, <span>{user?.name || user?.username}</span></h2><p>Atölyenizin bugünkü performansına birlikte bakalım.</p></div>
      <img src="https://images.unsplash.com/photo-1712171984530-e25a4aaa46dd?q=85&fm=jpg&crop=entropy&cs=srgb" alt="Atölye" data-testid="workshop-image"/>
    </section>
    <div className="stats">
      <Stat label="Bu ay satış" value={money(data.stats?.sales)} change="12.8%" accent="#b8873a"/>
      <Stat label="Toplam gider" value={money(data.stats?.expenses)} change="4.2%" positive={false} accent="#c6553e"/>
      <Stat label="Net kâr" value={money(data.stats?.profit)} change="18.6%" accent="#3e8054"/>
      <Stat label="Aktif sipariş" value={data.stats?.order_count || 0} change="3 yeni" accent="#b8873a"/>
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
        <div className="spot-img"><img src="https://images.unsplash.com/photo-1546484396-fb3fc6f95f98?q=85&fm=jpg&crop=entropy&cs=srgb" alt="Ahşap"/></div>
        <div><span className="eyebrow">İPUCU</span><h3>Konfigüratörle ürün maliyeti hesaplayın</h3>
          <p>Ölçü ve seçenekleri girin, güncel malzeme fiyatınıza göre maliyet ve satış fiyatı anında çıksın.</p>
          <NavLink to="/configurator" className="text-link">Konfigüratöre git →</NavLink></div>
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
      {!items?.length && <div className="empty">Henüz kayıt bulunmuyor.</div>}
    </div></section>
    {modal && <div className="modal-backdrop" onClick={() => setModal(false)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setModal(false)} data-testid="close-modal-button"><X/></button>
        <span className="eyebrow">YENİ KAYIT</span>
        <h3>{isMaterials ? 'Malzeme ekle' : type === 'sales' ? 'Satış ekle' : 'Gider ekle'}</h3>
        {error && <div className="form-error" data-testid="record-form-error">{error}</div>}
        <label>Ad / açıklama<input autoFocus value={name} onChange={e => setName(e.target.value)} data-testid="record-name-input"/></label>
        <label>{isMaterials ? 'Birim maliyet (₺)' : 'Tutar (₺)'}<input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} data-testid="record-amount-input"/></label>
        <button className="primary full" onClick={add} data-testid="save-record-button">Kaydet</button>
      </div>
    </div>}
  </>;
}

function Protected() {
  const { user } = useAuth();
  const [data, setData] = useState({ stats: {} });
  const refresh = () => axios.get(`${API}/dashboard?fresh=${Date.now()}`).then(r => setData(r.data)).catch(() => {});
  useEffect(() => { if (user) refresh(); }, [user]);

  if (user === undefined) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--muted)' }}>Yükleniyor...</div>;
  if (!user) return <LoginPage/>;

  const guard = (key, node) => canAccess(user, key) ? node : <Navigate to="/" replace/>;

  return <Shell><Routes>
    <Route path="/" element={<Dashboard data={data}/>}/>
    <Route path="/configurator" element={guard('configurator', <ConfiguratorPage/>)}/>
    <Route path="/quotes" element={guard('quotes', <QuotesPage/>)}/>
    <Route path="/products" element={guard('products', <ProductsPage/>)}/>
    <Route path="/materials" element={guard('materials', <MaterialsPage/>)}/>
    <Route path="/customers" element={guard('customers', <CustomerPage/>)}/>
    <Route path="/orders" element={guard('orders', <OrdersPage/>)}/>
    <Route path="/assembly" element={guard('assembly', <AssemblyPage/>)}/>
    <Route path="/discounts" element={guard('discounts', <DiscountsPage/>)}/>
    <Route path="/sales" element={guard('sales', <TablePage type="sales" data={data} refresh={refresh}/>)}/>
    <Route path="/expenses" element={guard('expenses', <TablePage type="expenses" data={data} refresh={refresh}/>)}/>
    <Route path="/users" element={guard('users', <UsersPage/>)}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></Shell>;
}

export default function App() {
  return <BrowserRouter><AuthProvider><Protected/></AuthProvider></BrowserRouter>;
}
