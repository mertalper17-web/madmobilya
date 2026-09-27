# Atölye360 — Ürün Gereksinimleri

## Orijinal problem
Mobilya üreticisinin ürünlerde kullanılan malzemeleri analiz etmesi, malzeme maliyetlerini hesaplaması ve satış, gider, sipariş detaylarını tek uygulamadan yönetmesi.

## Kullanıcı ve varsayımlar
- Tek işletme yöneticisi; Türkçe arayüz ve Türk lirası.
- İlk sürümde manuel malzeme/reçete girişi ve otomatik maliyet hesaplama.
- Ana kullanıcı: üretim, stok ve finansı aynı anda takip eden mobilya atölyesi sahibi.

## Mimari kararlar
- React frontend, FastAPI backend, MongoDB veri katmanı.
- Frontend API çağrıları yalnızca `REACT_APP_BACKEND_URL` üzerinden yapılır.
- MongoDB kayıtları UUID alanlarıyla tutulur; `_id` API yanıtlarına taşınmaz.
- Ana modüller ayrı rotalarda: Genel Bakış, Ürünler, Malzemeler, Siparişler, Satışlar, Giderler.

## Çekirdek gereksinimler
- Dashboard: satış, gider, net kâr, aktif sipariş, gelir-gider akışı ve kritik stok görünümü.
- Ürün/reçete: ürün maliyeti, işçilik, malzeme satırları ve önerilen satış fiyatı.
- Malzeme/stok: birim, stok seviyesi, minimum stok, birim maliyeti ve tedarikçi.
- Satış, gider ve sipariş kayıtları.
- Mobil uyumlu, Türkçe ve hızlı işletme paneli.

## Uygulananlar — 2026-09-27
- Atölye360 karanlık/ahşap tonlu yönetim paneli ve responsive sidebar oluşturuldu.
- Dashboard istatistikleri, finansal grafik, stok uyarıları ve son hareketler eklendi.
- Malzeme, ürün, işlem ve sipariş CRUD API uçları oluşturuldu.
- Ürün oluştururken reçete malzemeleri ve işçilik üzerinden maliyet/önerilen fiyat hesaplandı.
- Tüm ana menüler, kayıt modalları, hızlı kayıt ve bildirim durumu çalışır hale getirildi.
- API ve tarayıcı akışları doğrulandı; sipariş yenileme ve önbellek sorunu giderildi.

## Öncelikli backlog
- P0: Ürün reçetesinde malzeme seçme ve miktar satırlarını arayüzden düzenleme.
- P1: Sipariş durumları, teslim tarihi ve sipariş detay sayfası.
- P1: Tedarikçi özel yönetimi ve stok giriş/çıkış hareketleri.
- P2: Dönemsel rapor dışa aktarma ve kullanıcı yetkileri.

## Sonraki işler
1. Ürün ekleme formuna malzeme arama, miktar ve birim seçimi ekle.
2. Siparişlerde müşteri, teslim tarihi ve üretim aşamalarını göster.
3. Aylık kârlılık raporu ve CSV/PDF dışa aktarma ekle.