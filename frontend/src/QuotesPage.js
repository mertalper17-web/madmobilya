import { useEffect, useState } from 'react';
import axios from 'axios';
import jsPDF from 'jspdf';
import { FileText, X, FileDown, ShoppingCart, Trash2 } from 'lucide-react';
import './QuotesPage.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const money = (n = 0) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
const STATUSES = ['Taslak', 'Gönderildi', 'Onaylandı', 'Reddedildi'];
// ASCII-safe for jsPDF standard fonts
const ascii = (s = '') => s.replace(/ş/g, 's').replace(/Ş/g, 'S').replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/ğ/g, 'g').replace(/Ğ/g, 'G').replace(/ü/g, 'u').replace(/Ü/g, 'U').replace(/ö/g, 'o').replace(/Ö/g, 'O').replace(/ç/g, 'c').replace(/Ç/g, 'C');

function generateQuotePDF(q) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setDrawColor(60, 45, 25); doc.setLineWidth(0.5); doc.rect(8, 8, 194, 281);
  doc.setFontSize(20); doc.setFont('helvetica', 'bold');
  doc.text('MAD MOBILYA', 14, 22);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text('Kalite - Tasarim - Guven', 14, 28);
  doc.setFontSize(15); doc.setFont('helvetica', 'bold');
  doc.text('FIYAT TEKLIFI', 196, 22, { align: 'right' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Teklif No: ${q.quote_no}`, 196, 28, { align: 'right' });
  doc.text(`Tarih: ${q.date}`, 196, 33, { align: 'right' });
  doc.setLineWidth(0.3); doc.line(14, 38, 196, 38);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('MUSTERI', 14, 46);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(ascii(q.customer_name || '-'), 14, 52);
  if (q.customer_phone) doc.text(`Tel: ${ascii(q.customer_phone)}`, 14, 57);
  if (q.customer_address) doc.text(`Adres: ${ascii(q.customer_address)}`, 14, 62, { maxWidth: 120 });

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(ascii(q.name), 14, 74);
  doc.setLineWidth(0.3); doc.line(14, 77, 196, 77);

  // BOM table
  let y = 85;
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('MALZEME', 14, y); doc.text('MIKTAR', 120, y); doc.text('BIRIM', 145, y); doc.text('TUTAR', 196, y, { align: 'right' });
  doc.setLineWidth(0.2); doc.line(14, y + 2, 196, y + 2);
  y += 8; doc.setFont('helvetica', 'normal');
  (q.bom || []).forEach(b => {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text(ascii(b.name).slice(0, 55), 14, y);
    doc.text(String(b.quantity), 120, y);
    doc.text(ascii(b.unit || ''), 145, y);
    doc.text(money(b.line_cost), 196, y, { align: 'right' });
    y += 6;
  });

  y += 4; doc.setLineWidth(0.3); doc.line(120, y, 196, y); y += 7;
  doc.setFontSize(9);
  doc.text('Toplam Maliyet:', 120, y); doc.text(money(q.cost), 196, y, { align: 'right' }); y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Liste Fiyati:', 120, y); doc.text(money(q.suggested_price), 196, y, { align: 'right' }); y += 6;
  if (q.discount_rate > 0) {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(198, 85, 62);
    doc.text(`Iskonto (${ascii(q.discount_name || '')} %${q.discount_rate}):`, 120, y);
    doc.text('- ' + money(q.suggested_price - q.final_price), 196, y, { align: 'right' }); y += 7;
    doc.setTextColor(0, 0, 0);
  }
  doc.setFillColor(184, 135, 58); doc.rect(120, y - 5, 76, 9, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255, 255, 255);
  doc.text('NET FIYAT:', 123, y + 1); doc.text(money(q.final_price), 194, y + 1, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  y += 18; doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  if (q.notes) { doc.text('Not: ' + ascii(q.notes), 14, y, { maxWidth: 180 }); y += 8; }
  doc.text('Bu teklif 15 gun gecerlidir. Fiyatlara KDV dahil degildir.', 14, 280);
  doc.save(`teklif-${q.quote_no}.pdf`);
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState([]);
  const [banner, setBanner] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = async () => {
    const { data } = await axios.get(`${API}/quotes?t=${Date.now()}`);
    setQuotes(data);
  };
  useEffect(() => { load(); }, []);

  const setStatus = async (q, status) => {
    try { await axios.patch(`${API}/quotes/${q.id}`, { status }); load(); }
    catch (e) { setBanner({ kind: 'err', text: e.response?.data?.detail || 'Güncellenemedi' }); }
  };

  const convert = async (q) => {
    if (!window.confirm(`"${q.name}" teklifini siparişe dönüştürmek istiyor musunuz?`)) return;
    try {
      await axios.post(`${API}/quotes/${q.id}/convert`);
      setBanner({ kind: 'ok', text: `${q.quote_no} siparişe dönüştürüldü. Siparişler sayfasında görebilirsiniz.` });
      load();
    } catch (e) { setBanner({ kind: 'err', text: e.response?.data?.detail || 'Dönüştürülemedi' }); }
  };

  const remove = async (q) => {
    if (!window.confirm(`"${q.name}" teklifini silmek istiyor musunuz?`)) return;
    try { await axios.delete(`${API}/quotes/${q.id}`); load(); }
    catch (e) { setBanner({ kind: 'err', text: e.response?.data?.detail || 'Silinemedi' }); }
  };

  return <>
    <div className="page-toolbar">
      <div><p className="page-note">TEKLİF YÖNETİMİ / {quotes.length} KAYIT</p><h2>Teklifler</h2></div>
    </div>

    {banner && <div className={`order-banner ${banner.kind}`} data-testid="quote-banner">
      <span>{banner.text}</span>
      <button onClick={() => setBanner(null)} className="modal-close" style={{ position: 'static' }}><X size={14}/></button>
    </div>}

    <p className="config-lead">Teklif Hazırla ekranında oluşturduğunuz teklifler burada listelenir. PDF çıktısı alabilir, durumunu güncelleyebilir ve onaylanan teklifi tek tıkla siparişe dönüştürebilirsiniz.</p>

    <section className="panel table-panel">
      <div className="table-scroll"><table><thead><tr>
        <th>Teklif No</th><th>Ürün / Müşteri</th><th>Net Fiyat</th><th>İskonto</th><th>Durum</th><th></th>
      </tr></thead><tbody>
        {quotes.map(q => <tr key={q.id}>
          <td><b data-testid={`quote-no-${q.id}`}>{q.quote_no}</b><small className="cell-sub">{q.date}</small></td>
          <td><b>{q.name}</b><small className="cell-sub">{q.customer_name || 'Müşteri belirtilmemiş'}</small></td>
          <td><b className="positive">{money(q.final_price)}</b>{q.discount_rate > 0 && <small className="cell-sub">Liste: {money(q.suggested_price)}</small>}</td>
          <td>{q.discount_rate > 0 ? <span className="pill">{q.discount_name} %{q.discount_rate}</span> : '—'}</td>
          <td>
            <select className="status-select" value={q.status} onChange={e => setStatus(q, e.target.value)} disabled={!!q.converted_order_id} data-testid={`quote-status-${q.id}`}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {q.converted_order_id && <span className="pill success" style={{ marginLeft: 6 }}>Siparişe döndü</span>}
          </td>
          <td><div className="row-actions">
            <button className="table-action" onClick={() => setDetail(q)} data-testid={`quote-detail-${q.id}`}>Detay</button>
            <button className="table-action" onClick={() => generateQuotePDF(q)} data-testid={`quote-pdf-${q.id}`}><FileDown size={12}/> PDF</button>
            {!q.converted_order_id && <button className="table-action" onClick={() => convert(q)} data-testid={`quote-convert-${q.id}`}><ShoppingCart size={12}/> Siparişe</button>}
            <button className="table-action muted-action" onClick={() => remove(q)} data-testid={`quote-delete-${q.id}`}><Trash2 size={12}/></button>
          </div></td>
        </tr>)}
      </tbody></table>
      {!quotes.length && <div className="empty" data-testid="quotes-empty-state">Henüz teklif yok. "Teklif Hazırla" ekranında hesaplayıp "Teklif olarak kaydet" ile ekleyin.</div>}
      </div>
    </section>

    {detail && <div className="modal-backdrop" onClick={() => setDetail(null)}>
      <div className="modal product-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setDetail(null)} data-testid="close-quote-detail"><X/></button>
        <span className="eyebrow"><FileText size={11}/> TEKLİF DETAYI · {detail.quote_no}</span>
        <h3>{detail.name}</h3>
        <div className="detail-summary">
          <div><small>Müşteri</small><b>{detail.customer_name || '—'}</b></div>
          <div><small>Maliyet</small><b>{money(detail.cost)}</b></div>
          <div><small>Liste fiyatı</small><b>{money(detail.suggested_price)}</b></div>
          <div className="highlight"><small>Net fiyat{detail.discount_rate > 0 ? ` (%${detail.discount_rate})` : ''}</small><b>{money(detail.final_price)}</b></div>
        </div>
        <div className="recipe-list">
          {(detail.bom || []).map((b, i) => <div className="recipe-detail-row" key={i}>
            <div><b>{b.name}</b><small>{b.quantity} {b.unit} × {money(b.unit_cost)}</small></div>
            <span>{money(b.line_cost)}</span>
          </div>)}
        </div>
        <button className="primary full" onClick={() => generateQuotePDF(detail)} data-testid="quote-detail-pdf"><FileDown size={14}/> PDF olarak indir</button>
      </div>
    </div>}
  </>;
}
