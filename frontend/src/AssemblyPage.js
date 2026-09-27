import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Wrench, X, Plus, Camera, Play, CheckCircle2, MapPin, User, Clock, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '@/AuthContext';
import './AssemblyPage.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const STATUS_FLOW = { 'Bekliyor': 'Başladı', 'Başladı': 'Tamamlandı' };
const statusCls = { 'Bekliyor': 'wait', 'Başladı': 'progress', 'Tamamlandı': 'done' };

function Photo({ path, caption, onClick }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let revoke;
    axios.get(`${API}/files/${path}`, { responseType: 'blob' })
      .then(r => { const u = URL.createObjectURL(r.data); revoke = u; setUrl(u); })
      .catch(() => {});
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [path]);
  return <button className="asm-photo" onClick={onClick} data-testid="assembly-photo">
    {url ? <img src={url} alt={caption || 'montaj'} /> : <div className="asm-photo-load"><ImageIcon size={18}/></div>}
    {caption && <span>{caption}</span>}
  </button>;
}

export default function AssemblyPage() {
  const { user } = useAuth();
  const canCreate = ['admin', 'muhasebe'].includes(user?.role);
  const canWork = ['admin', 'montaj'].includes(user?.role);
  const [jobs, setJobs] = useState([]);
  const [banner, setBanner] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ order_name: '', customer: '', address: '', note: '' });
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  const load = useCallback(async () => {
    const { data } = await axios.get(`${API}/assembly?t=${Date.now()}`);
    setJobs(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const createJob = async () => {
    setError('');
    if (!form.order_name.trim()) return setError('İş / sipariş adı gerekli.');
    try {
      await axios.post(`${API}/assembly`, form);
      setAddOpen(false); setForm({ order_name: '', customer: '', address: '', note: '' }); load();
    } catch (e) { setError(e.response?.data?.detail || 'Montaj işi oluşturulamadı.'); }
  };

  const advance = async (job) => {
    const next = STATUS_FLOW[job.status];
    if (!next) return;
    try { await axios.patch(`${API}/assembly/${job.id}`, { status: next }); load(); }
    catch (e) { setBanner({ kind: 'err', text: e.response?.data?.detail || 'Güncellenemedi' }); }
  };

  const uploadPhoto = async (job, fileList, caption) => {
    const file = fileList?.[0];
    if (!file) return;
    setUploading(job.id); setBanner(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      await axios.post(`${API}/assembly/${job.id}/photos?caption=${encodeURIComponent(caption || '')}`, fd);
      setBanner({ kind: 'ok', text: 'Fotoğraf yüklendi.' });
      load();
    } catch (e) {
      setBanner({ kind: 'err', text: e.response?.data?.detail || 'Fotoğraf yüklenemedi' });
    } finally { setUploading(null); }
  };

  const counts = {
    wait: jobs.filter(j => j.status === 'Bekliyor').length,
    progress: jobs.filter(j => j.status === 'Başladı').length,
    done: jobs.filter(j => j.status === 'Tamamlandı').length,
  };

  return <>
    <div className="page-toolbar">
      <div><p className="page-note">MONTAJ PORTALI / {jobs.length} İŞ</p><h2>Montaj takibi</h2></div>
      {canCreate && <button className="primary" onClick={() => { setForm({ order_name: '', customer: '', address: '', note: '' }); setError(''); setAddOpen(true); }} data-testid="add-assembly-button"><Plus size={16}/> Yeni montaj işi</button>}
    </div>

    <div className="asm-summary">
      <div className="asm-sum wait" data-testid="asm-count-wait"><b>{counts.wait}</b><small>Bekliyor</small></div>
      <div className="asm-sum progress" data-testid="asm-count-progress"><b>{counts.progress}</b><small>Devam ediyor</small></div>
      <div className="asm-sum done" data-testid="asm-count-done"><b>{counts.done}</b><small>Tamamlandı</small></div>
    </div>

    {banner && <div className={`order-banner ${banner.kind}`} data-testid="assembly-banner">
      <span>{banner.text}</span>
      <button onClick={() => setBanner(null)} className="modal-close" style={{ position: 'static' }}><X size={14}/></button>
    </div>}

    <div className="asm-grid">
      {jobs.map(j => <div className={`asm-card ${statusCls[j.status]}`} key={j.id} data-testid={`assembly-card-${j.id}`}>
        <div className="asm-head">
          <div><b data-testid={`assembly-name-${j.id}`}>{j.order_name}</b><small>{j.date}</small></div>
          <span className={`asm-badge ${statusCls[j.status]}`} data-testid={`assembly-status-${j.id}`}>{j.status}</span>
        </div>
        <div className="asm-info">
          {j.customer && <div><User size={13}/> {j.customer}</div>}
          {j.address && <div><MapPin size={13}/> {j.address}</div>}
          {j.note && <div className="asm-note">{j.note}</div>}
          {j.started_at && <div className="asm-time"><Clock size={12}/> Başlangıç: {new Date(j.started_at).toLocaleString('tr-TR')}</div>}
          {j.completed_at && <div className="asm-time done"><CheckCircle2 size={12}/> Bitiş: {new Date(j.completed_at).toLocaleString('tr-TR')}</div>}
        </div>

        {(j.photos || []).length > 0 && <div className="asm-photos">
          {j.photos.map((p, i) => <Photo key={p.id || i} path={p.storage_path} caption={p.caption} onClick={() => setLightbox(p.storage_path)} />)}
        </div>}

        {canWork && <div className="asm-actions">
          {STATUS_FLOW[j.status] && <button className="asm-btn primary-btn" onClick={() => advance(j)} data-testid={`assembly-advance-${j.id}`}>
            {j.status === 'Bekliyor' ? <><Play size={13}/> Montaja Başla</> : <><CheckCircle2 size={13}/> Tamamlandı</>}
          </button>}
          <label className="asm-btn upload-btn" data-testid={`assembly-upload-label-${j.id}`}>
            {uploading === j.id ? <span className="calc-spin"/> : <Camera size={13}/>} Fotoğraf ekle
            <input type="file" accept="image/*" hidden disabled={uploading === j.id}
              onChange={e => uploadPhoto(j, e.target.files, j.status === 'Tamamlandı' ? 'Montaj sonrası' : 'Montaj öncesi')}
              data-testid={`assembly-file-${j.id}`}/>
          </label>
        </div>}
      </div>)}
      {!jobs.length && <div className="empty" data-testid="assembly-empty-state">Bekleyen montaj işi yok. Siparişler sayfasından "Montaja Gönder" ile iş oluşturabilirsiniz.</div>}
    </div>

    {addOpen && <div className="modal-backdrop" onClick={() => setAddOpen(false)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setAddOpen(false)} data-testid="close-assembly-modal"><X/></button>
        <span className="eyebrow"><Wrench size={11}/> YENİ MONTAJ İŞİ</span><h3>Montaj işi oluştur</h3>
        {error && <div className="form-error" data-testid="assembly-form-error">{error}</div>}
        <label>İş / sipariş adı<input autoFocus value={form.order_name} onChange={e => setForm({ ...form, order_name: e.target.value })} data-testid="assembly-name-input"/></label>
        <label>Müşteri<input value={form.customer} onChange={e => setForm({ ...form, customer: e.target.value })} data-testid="assembly-customer-input"/></label>
        <label>Adres<input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} data-testid="assembly-address-input"/></label>
        <label>Montaj notu<input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} data-testid="assembly-note-input"/></label>
        <button className="primary full" onClick={createJob} data-testid="save-assembly-button">Oluştur</button>
      </div>
    </div>}

    {lightbox && <div className="modal-backdrop" onClick={() => setLightbox(null)} data-testid="assembly-lightbox">
      <div className="asm-lightbox" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setLightbox(null)}><X/></button>
        <Photo path={lightbox} />
      </div>
    </div>}
  </>;
}
