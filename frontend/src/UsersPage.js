import { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, X, Shield, UserCog, Trash2, KeyRound } from 'lucide-react';
import { useAuth } from '@/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ROLES = [
  { key: 'admin', label: 'Yönetici (Tüm yetkiler)' },
  { key: 'muhasebe', label: 'Muhasebe' },
  { key: 'depo', label: 'Depo' },
  { key: 'sevkiyat', label: 'Sevkiyat' },
  { key: 'montaj', label: 'Montaj' },
  { key: 'bayi', label: 'Bayi' },
];
const ROLE_LABEL = Object.fromEntries(ROLES.map(r => [r.key, r.label]));
const ACCESS_OPTIONS = [
  { key: 'dashboard', label: 'Genel Bakış' },
  { key: 'configurator', label: 'Teklif Hazırla' },
  { key: 'quotes', label: 'Teklifler' },
  { key: 'products', label: 'Ürünler' },
  { key: 'materials', label: 'Malzemeler' },
  { key: 'customers', label: 'Müşteriler' },
  { key: 'orders', label: 'Siparişler' },
  { key: 'assembly', label: 'Montaj Portalı' },
  { key: 'discounts', label: 'İskontolar' },
  { key: 'sales', label: 'Satışlar' },
  { key: 'expenses', label: 'Giderler' },
];

export default function UsersPage() {
  const { user: me } = useAuth();
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(null); // 'new' | user object
  const [form, setForm] = useState({ username: '', password: '', name: '', role: 'muhasebe', active: true, access: [] });
  const [error, setError] = useState('');

  const load = () => axios.get(`${API}/users`).then(r => setList(r.data));
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm({ username: '', password: '', name: '', role: 'muhasebe', active: true, access: [] }); setError(''); setOpen('new'); };
  const openEdit = (u) => { setForm({ username: u.username, password: '', name: u.name || '', role: u.role, active: u.active, access: u.access || [] }); setError(''); setOpen(u); };

  const toggleAccess = (key) => setForm(f => ({ ...f, access: f.access.includes(key) ? f.access.filter(k => k !== key) : [...f.access, key] }));

  const save = async () => {
    setError('');
    try {
      if (open === 'new') {
        await axios.post(`${API}/users`, form);
      } else {
        const upd = { name: form.name, role: form.role, active: form.active, access: form.access };
        if (form.password) upd.password = form.password;
        await axios.patch(`${API}/users/${open.id}`, upd);
      }
      setOpen(null); load();
    } catch (e) {
      setError(e.response?.data?.detail?.[0]?.msg || e.response?.data?.detail || 'Kayıt başarısız');
    }
  };

  const del = async (u) => {
    if (!window.confirm(`${u.username} kullanıcısını silmek istiyor musunuz?`)) return;
    try { await axios.delete(`${API}/users/${u.id}`); load(); }
    catch (e) { alert(e.response?.data?.detail || 'Silinemedi'); }
  };

  return <>
    <div className="page-toolbar">
      <div><p className="page-note">KULLANICI YÖNETİMİ / {list.length} KAYIT</p><h2>Kullanıcılar ve roller</h2></div>
      <button className="primary" onClick={openNew} data-testid="add-user-button"><Plus size={16}/> Yeni kullanıcı</button>
    </div>

    <section className="panel table-panel">
      <div className="table-scroll"><table><thead><tr>
        <th>Kullanıcı</th><th>Ad Soyad</th><th>Rol</th><th>Durum</th><th></th>
      </tr></thead><tbody>
        {list.map(u => <tr key={u.id}>
          <td><b data-testid={`user-username-${u.id}`}>{u.username}</b>{u.id === me?.id && <small className="cell-sub">(Siz)</small>}</td>
          <td>{u.name || '—'}</td>
          <td><span className="pill">{ROLE_LABEL[u.role] || u.role}</span></td>
          <td><span className={u.active ? 'pill success' : 'pill danger'}>{u.active ? 'Aktif' : 'Pasif'}</span></td>
          <td><div className="row-actions">
            <button className="table-action" onClick={() => openEdit(u)} data-testid={`edit-user-${u.id}`}><UserCog size={12}/> Düzenle</button>
            {u.id !== me?.id && <button className="table-action muted-action" onClick={() => del(u)} data-testid={`delete-user-${u.id}`}><Trash2 size={12}/></button>}
          </div></td>
        </tr>)}
      </tbody></table></div>
    </section>

    {open && <div className="modal-backdrop" onClick={() => setOpen(null)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setOpen(null)} data-testid="close-user-modal"><X/></button>
        <span className="eyebrow"><Shield size={11}/> {open === 'new' ? 'YENİ KULLANICI' : 'KULLANICI DÜZENLE'}</span>
        <h3>{open === 'new' ? 'Kullanıcı ekle' : open.username}</h3>
        {error && <div className="form-error" data-testid="user-form-error">{error}</div>}
        {open === 'new' && <label>Kullanıcı adı<input value={form.username} onChange={e => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, '') })} data-testid="user-username-input"/></label>}
        <label>Ad soyad<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="user-name-input"/></label>
        <label>Rol
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} data-testid="user-role-select">
            {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        {form.role !== 'admin' && <div className="access-block" data-testid="user-access-block">
          <span className="eyebrow">ÖZEL SAYFA ERİŞİMİ (opsiyonel)</span>
          <p className="access-hint">İşaretlerseniz kullanıcı yalnızca seçtiğiniz sayfaları görür. Boş bırakırsanız rolün varsayılan erişimi geçerli olur.</p>
          <div className="access-grid">
            {ACCESS_OPTIONS.map(o => <label key={o.key} className={`access-chip${form.access.includes(o.key) ? ' on' : ''}`} data-testid={`access-${o.key}`}>
              <input type="checkbox" checked={form.access.includes(o.key)} onChange={() => toggleAccess(o.key)}/>
              <span>{o.label}</span>
            </label>)}
          </div>
        </div>}
        <label>Şifre {open !== 'new' && <span className="optional">boş bırakırsanız değişmez</span>}
          <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} data-testid="user-password-input" placeholder={open !== 'new' ? 'Değiştirmek için yeni şifre' : ''}/>
        </label>
        {open !== 'new' && <label className="opt-toggle" style={{ background: 'var(--surface2)', padding: '11px 14px', borderRadius: 6, border: '1px solid var(--line)' }}>
          <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} data-testid="user-active-toggle"/>
          <span>Aktif kullanıcı (giriş yapabilir)</span>
        </label>}
        <button className="primary full" onClick={save} data-testid="save-user-button"><KeyRound size={14}/> Kaydet</button>
      </div>
    </div>}
  </>;
}
