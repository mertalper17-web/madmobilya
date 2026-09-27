# Atölye360 — Mobilya Üreticisi ERP

## Problem Statement
Furniture manufacturer needs an app to: analyze materials, calculate cost, track sales/expenses/orders, and manage customers with promissory sales (senetli satış).

## Architecture
- Backend: FastAPI + Motor (MongoDB async), all endpoints under `/api`
- Frontend: React SPA (react-router-dom), custom CSS design system (dark warm palette, gold/coral/green accents, Playfair Display + DM Sans fonts)
- PDF: jsPDF (client-side senet generation)

## Personas
- Furniture workshop owner (single-user, Turkish)

## Core Features (Implemented)
- Dashboard: sales/expenses/profit/order stats, transactions feed, low-stock warnings
- Materials: catalog with unit cost, stock, min_stock, supplier
- Products & Recipes: multi-material recipe builder with live cost preview (material cost + labor + margin → suggested price), detail breakdown modal
- Orders: product-linked orders with quantity, status workflow (Planlandı → Üretimde → Hazır → Tamamlandı/İptal), **stock auto-deduction on completion**
- Customers/Cari: registration + senetli satış + tahsilat, running balance, hesap ekstresi modal
- **PDF Senet**: A5 landscape printable senet/bono with amount in Turkish words, customer info, signature area

## Completed (Feb 2026)
- Backend endpoints: POST/GET materials, products (with live recompute), orders + PATCH stock deduction, customers summary/history/credit-sales/payments
- Frontend: dedicated ProductsPage, OrdersPage, CustomerPage with jsPDF senet export
- Form validation UX (form-error styling), zero/negative amount rejection on both client and server

## Backlog
- P1: Material/product PATCH & DELETE endpoints (currently create-only)
- P1: Editable order details before completion
- P2: Aggregation pipelines for large datasets
- P2: Transactional stock deduction (rollback on partial failure)
- P3: Bulk import (CSV) for materials/products
- P3: Reports export (PDF for sales report, monthly ekstre)

## Phase 1 — Auth & RBAC (Completed, earlier fork)
- JWT auth (bcrypt), 5 roles (admin/muhasebe/depo/sevkiyat/montaj), protected routes, UsersPage, LoginPage.

## Phase 2 — Stock, Cost, Deadlines & Discounts (Completed, Jun 2026)
Implemented and tested 100% (backend 12/12 pytest + full frontend E2E, iteration_8):
- **Stok Giriş Takibi**: `stock_entries` collection. POST/GET `/api/materials/{id}/stock-entries`. Each intake logs qty, alış birim fiyatı, tedarikçi, not, tarih; increases stock and (if given) updates unit_cost.
- **Maliyet Analizi & Fiyat Geçmişi**: `price_history` collection. GET `/api/materials/{id}/price-history`. Logs old→new on stock entry or manual edit (source flag). Configured product costs auto-recompute on material price change (GET /api/products).
- **Malzeme kartları (MaterialsPage.js)**: editable cards, stock-entry modal, edit modal, history+cost-analysis modal, low-stock highlight.
- **Günlük Sipariş Özeti & Termin**: GET `/api/orders/summary` → today/active/due_soon(≤3 gün)/overdue buckets with days_left. OrdersPage shows 4 summary cards + colored "Kalan süre" column.
- **İskonto Kademeleri**: `discounts` collection, seeded Bayi 15 / Şube 10 / Personel 20 / Özel Durum 0. Full CRUD `/api/discounts` (admin/muhasebe). DiscountsPage.js manage UI. Applied in order creation (POST /api/orders discount_rate → net amount, gross_amount stored) and configurator estimate (final_price/discount_amount).
- **Kritik stok uyarısı**: GET `/api/materials/low-stock`; header bell shows red dot + list, link to materials.

### Phase 2 files
- Backend: server.py (StockEntry/DiscountTier models, stock-entry/price-history/low-stock/orders-summary/discounts endpoints, seed_discounts, log_price_change).
- Frontend: MaterialsPage.js/.css, DiscountsPage.js/.css, OrdersPage.js (summary+deadline+discount), ConfiguratorPage.js (discount), App.js (nav + low-stock notifications), AuthContext.js (discounts access).

## Phase 3 & 4 — Upcoming
- P1: Cargo/Shipping API integration.
- P1: Assembly requests & results tracking.
- P1: Mobile assembly portal with photo upload (MUST use Emergent Object Storage via integration_expert).
- P2: Personnel tracking (Puantaj, Sigorta, izin).
- P2: PDF quote generation from configurator.

### Known minor note
- Benign hydration console warning "<span> cannot be a child of <option>" from visual-editor build wrapper — cosmetic, no functional impact.
