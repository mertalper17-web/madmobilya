import { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, X, Percent, Trash2, Power } from 'lucide-react';
import './DiscountsPage.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const emptyForm = { name: '', rate: '', description: '' };

export default function DiscountsPage() {
  const [tiers, setTiers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [editRate, setEditRate] = useState({});

  const load = async () => {
    const { data } = await axios.get(`${API}/discounts?t=${Date.now()}`);
    setTiers(data);
    setEditRate(Object.fromEntries(data.map(d => [d.id, d.rate])));
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setError('');
    if (!form.name.trim()) return setError('İskonto adı gerekli.');
    try {
      await axios.post(`${API}/discounts`, { name: form.name, rate: Number(form.rate) || 0, description: form.description });
      setOpen(false); setForm(emptyForm); load();
    } catch (e) { setError(e.response?.data?.detail || 'İskonto eklenemedi.'); }
  };

  const saveRate = async (t) => {
    try { await axios.patch(`${API}/discounts/${t.id}`, { rate: Number(editRate[t.id]) || 0 }); load(); }
    catch (e) { setError(e.response?.data?.detail || 'Güncellenemedi.'); }
  };

  const toggle = async (t) => {
    await axios.patch(`${API}/discounts/${t.id}`, { active: !t.active }); load();
  };

  const remove = async (t) => {
    if (!window.confirm(`"${t.name}" iskontosunu silmek istiyor musunuz?`)) return;
    await axios.delete(`${API}/discounts/${t.id}`); load();
  };

  return <>
    <div className="page-toolbar">
      <div><p className="page-note">FİYATLANDIRMA / {tiers.length} KADEME</p><h2>İskonto kademeleri</h2></div>
      <button className="primary" onClick={() => { setForm(emptyForm); setError(''); setOpen(true); }} data-testid="add-discount-button"><Plus size={16}/> Yeni iskonto</button>
    </div>
    {error && <div className="form-error" style={{ maxWidth: 500 }} data-testid="discount-page-error">{error}</div>}

    <p className="config-lead">Bayi, şube, personel ve özel durum iskontolarını burada tanımlayın. Bu oranlar teklif hazırlarken ve sipariş oluştururken uygulanabilir.</p>

    <div className="disc-grid">
      {tiers.map(t => <div className={`disc-card${t.active ? '' : ' off'}`} key={t.id} data-testid={`discount-card-${t.id}`}>
        <div className="disc-top">
          <div className="disc-icon"><Percent size={18}/></div>
          <div style={{ flex: 1 }}>
            <b data-testid={`discount-name-${t.id}`}>{t.name}</b>
            <small>{t.description || '—'}</small>
          </div>
          <button className="disc-toggle" onClick={() => toggle(t)} title={t.active ? 'Pasifleştir' : 'Aktifleştir'} data-testid={`discount-toggle-${t.id}`}>
            <Power size={15}/>
          </button>
        </div>
        <div className="disc-rate">
          <input type="number" min="0" max="100" step="0.1" value={editRate[t.id] ?? ''} onChange={e => setEditRate({ ...editRate, [t.id]: e.target.value })} data-testid={`discount-rate-${t.id}`}/>
          <span>%</span>
          <button className="table-action" onClick={() => saveRate(t)} data-testid={`save-rate-${t.id}`}>Kaydet</button>
          <button className="icon-del" onClick={() => remove(t)} aria-label="Sil" data-testid={`delete-discount-${t.id}`}><Trash2 size={14}/></button>
        </div>
        <span className={`disc-status ${t.active ? 'on' : 'off'}`}>{t.active ? 'Aktif' : 'Pasif'}</span>
      </div>)}
      {!tiers.length && <div className="empty">Henüz iskonto kademesi yok.</div>}
    </div>

    {open && <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setOpen(false)} data-testid="close-discount-modal"><X/></button>
        <span className="eyebrow">YENİ İSKONTO</span><h3>İskonto kademesi ekle</h3>
        {error && <div className="form-error" data-testid="discount-form-error">{error}</div>}
        <label>İskonto adı<input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="discount-name-input"/></label>
        <label>Oran (%)<input type="number" min="0" max="100" step="0.1" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} data-testid="discount-rate-input"/></label>
        <label>Açıklama<input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} data-testid="discount-desc-input"/></label>
        <button className="primary full" onClick={create} data-testid="save-discount-button">Kaydet</button>
      </div>
    </div>}
  </>;
}
