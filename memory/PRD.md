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
- P2: Multi-user auth, role-based access
- P2: Aggregation pipelines for large datasets
- P2: Transactional stock deduction (rollback on partial failure)
- P3: Bulk import (CSV) for materials/products
- P3: Reports export (PDF for sales report, monthly ekstre)
