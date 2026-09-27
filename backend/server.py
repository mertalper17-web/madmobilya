from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
import os, uuid

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from configurator import get_public_templates, estimate, DEFAULT_MATERIALS
from auth import (LoginIn, UserCreate, UserUpdate, ROLES,
                  hash_pw, verify_pw, create_token, decode_token,
                  get_current_user_from, seed_admin, COOKIE_MAX_AGE)

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]
app = FastAPI(title='MAD Mobilya API')
api = APIRouter(prefix='/api')


# ---- auth dependencies ----
async def current_user(request: Request):
    return await get_current_user_from(request, db)


def require_roles(*allowed: str):
    async def _dep(user=Depends(current_user)):
        if user.get("role") not in allowed:
            raise HTTPException(status_code=403, detail=f"Bu işlem için yetkiniz yok ({', '.join(allowed)} gerekli)")
        return user
    return _dep


admin_only = require_roles("admin")
warehouse = require_roles("admin", "depo")
accounting = require_roles("admin", "muhasebe")
shipping = require_roles("admin", "sevkiyat", "muhasebe")


# ---- auth endpoints ----
@api.post('/auth/login')
async def login(payload: LoginIn, response: Response):
    user = await db.users.find_one({"username": payload.username})
    if not user or not verify_pw(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Kullanıcı adı veya şifre hatalı")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Hesabınız pasif durumda")
    token = create_token(user["id"], user["username"], user["role"])
    response.set_cookie("access_token", token, httponly=True, secure=True,
                        samesite="none", max_age=COOKIE_MAX_AGE, path="/")
    return {"user": {"id": user["id"], "username": user["username"],
                     "name": user.get("name", ""), "role": user["role"]}, "token": token}


@api.post('/auth/logout')
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get('/auth/me')
async def me(user=Depends(current_user)):
    return user


# ---- user management (admin only) ----
@api.get('/users')
async def list_users(user=Depends(admin_only)):
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(200)


@api.post('/users')
async def create_user(payload: UserCreate, user=Depends(admin_only)):
    if payload.role not in ROLES:
        raise HTTPException(status_code=400, detail=f"Geçersiz rol. Seçenekler: {', '.join(ROLES)}")
    if await db.users.find_one({"username": payload.username}):
        raise HTTPException(status_code=409, detail="Bu kullanıcı adı zaten kayıtlı")
    doc = {
        "id": str(uuid.uuid4()),
        "username": payload.username, "name": payload.name or payload.username,
        "role": payload.role, "active": payload.active,
        "password_hash": hash_pw(payload.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    return {k: v for k, v in doc.items() if k not in ("_id", "password_hash")}


@api.patch('/users/{user_id}')
async def update_user(user_id: str, payload: UserUpdate, user=Depends(admin_only)):
    updates = {}
    p = payload.model_dump(exclude_unset=True)
    if "name" in p: updates["name"] = p["name"]
    if "active" in p: updates["active"] = p["active"]
    if "role" in p:
        if p["role"] not in ROLES:
            raise HTTPException(status_code=400, detail="Geçersiz rol")
        updates["role"] = p["role"]
    if p.get("password"): updates["password_hash"] = hash_pw(p["password"])
    if not updates:
        raise HTTPException(status_code=400, detail="Güncellenecek alan yok")
    r = await db.users.update_one({"id": user_id}, {"$set": updates})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    return await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})


@api.delete('/users/{user_id}')
async def delete_user(user_id: str, user=Depends(admin_only)):
    if user["id"] == user_id:
        raise HTTPException(status_code=400, detail="Kendinizi silemezsiniz")
    r = await db.users.delete_one({"id": user_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    return {"ok": True}


# ---- protect existing routes ----
protected = Depends(current_user)


class RecipeItem(BaseModel):
    material_id: str
    quantity: float = Field(gt=0)


class Material(BaseModel):
    name: str = Field(min_length=1)
    category: str = 'Ahşap'
    unit: str = 'm²'
    stock: float = 0
    min_stock: float = 0
    unit_cost: float = Field(ge=0, default=0)
    supplier: str = ''
    role: str = ''


class MaterialUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    stock: Optional[float] = None
    min_stock: Optional[float] = None
    unit_cost: Optional[float] = Field(default=None, ge=0)
    supplier: Optional[str] = None
    role: Optional[str] = None


class Product(BaseModel):
    name: str = Field(min_length=1)
    category: str = 'Masa'
    status: str = 'Aktif'
    labor_cost: float = Field(ge=0, default=0)
    margin: float = Field(ge=0, default=30)
    recipe: List[RecipeItem] = []


class Transaction(BaseModel):
    type: str
    description: str = Field(min_length=1)
    amount: float = Field(gt=0)
    status: str = 'Tamamlandı'


class OrderCreate(BaseModel):
    name: str = Field(min_length=1)
    customer: str = ''
    product_id: Optional[str] = None
    quantity: int = Field(gt=0, default=1)
    amount: float = Field(ge=0, default=0)
    status: str = 'Planlandı'
    due_date: str = ''
    notes: str = ''
    discount_rate: float = Field(ge=0, le=100, default=0)
    discount_name: str = ''


class StockEntry(BaseModel):
    quantity: float = Field(gt=0)
    unit_cost: float = Field(ge=0, default=0)
    supplier: str = ''
    note: str = ''
    date: str = ''


class DiscountTier(BaseModel):
    name: str = Field(min_length=1)
    rate: float = Field(ge=0, le=100, default=0)
    description: str = ''
    active: bool = True


class DiscountUpdate(BaseModel):
    name: Optional[str] = None
    rate: Optional[float] = Field(default=None, ge=0, le=100)
    description: Optional[str] = None
    active: Optional[bool] = None


class OrderUpdate(BaseModel):
    status: str = Field(min_length=1)


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1)
    phone: str = ''
    address: str = ''
    tax_number: str = ''
    notes: str = ''


class CreditSale(BaseModel):
    description: str = Field(min_length=1)
    amount: float = Field(gt=0)
    due_date: str = Field(min_length=1)
    promissory_no: str = ''


class CustomerPayment(BaseModel):
    amount: float = Field(gt=0)
    payment_method: str = 'Nakit'
    note: str = ''


def clean(doc):
    return {k: v for k, v in doc.items() if k != '_id'}


async def docs(collection, limit=200, query=None):
    return await db[collection].find(query or {}, {'_id': 0}).sort('created_at', -1).to_list(limit)


async def log_price_change(material, old_cost, new_cost, source):
    await db.price_history.insert_one({
        'id': str(uuid.uuid4()), 'material_id': material['id'],
        'material_name': material.get('name', ''),
        'old_cost': round(float(old_cost), 2), 'new_cost': round(float(new_cost), 2),
        'source': source, 'date': datetime.now(timezone.utc).strftime('%d.%m.%Y'),
        'created_at': datetime.now(timezone.utc).isoformat(),
    })


async def calc_product_cost(product):
    materials = await docs('materials', 500)
    m_map = {m['id']: m for m in materials}
    material_cost = 0.0
    breakdown = []
    for r in product.get('recipe', []):
        m = m_map.get(r.get('material_id'))
        if not m:
            continue
        qty = float(r.get('quantity', 0))
        line = qty * float(m.get('unit_cost', 0))
        material_cost += line
        breakdown.append({'material_id': m['id'], 'name': m['name'], 'unit': m['unit'],
                          'quantity': qty, 'unit_cost': m.get('unit_cost', 0), 'line_cost': round(line, 2)})
    labor = float(product.get('labor_cost', 0))
    margin = float(product.get('margin', 30))
    cost = labor + material_cost
    return round(cost, 2), round(cost * (1 + margin / 100), 2), round(material_cost, 2), breakdown


@api.get('/')
async def root():
    return {'message': 'Atölye360 API hazır'}


@api.get('/dashboard')
async def dashboard():
    materials = await docs('materials')
    products = await docs('products')
    transactions = await docs('transactions', 40)
    orders = await docs('orders', 40)
    sales = sum(x['amount'] for x in transactions if x.get('type') in ('sale', 'credit_sale'))
    expenses = sum(x['amount'] for x in transactions if x.get('type') == 'expense')
    return {'materials': materials, 'products': products, 'transactions': transactions, 'orders': orders,
            'stats': {'sales': sales, 'expenses': expenses, 'profit': sales - expenses,
                      'low_stock': sum(1 for x in materials if x.get('stock', 0) <= x.get('min_stock', 0)),
                      'product_count': len(products), 'order_count': len(orders)}}


@api.get('/materials')
async def get_materials():
    return await docs('materials')


@api.post('/materials')
async def create_material(item: Material):
    doc = item.model_dump()
    doc.update(id=str(uuid.uuid4()), created_at=datetime.now(timezone.utc).isoformat())
    await db.materials.insert_one(doc)
    return clean(doc)


@api.patch('/materials/{material_id}')
async def update_material(material_id: str, payload: MaterialUpdate):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail='Güncellenecek alan yok')
    current = await db.materials.find_one({'id': material_id}, {'_id': 0})
    if not current:
        raise HTTPException(status_code=404, detail='Malzeme bulunamadı')
    old_cost = float(current.get('unit_cost', 0))
    await db.materials.update_one({'id': material_id}, {'$set': updates})
    if 'unit_cost' in updates and float(updates['unit_cost']) != old_cost:
        await log_price_change(current, old_cost, float(updates['unit_cost']), 'manual')
    return await db.materials.find_one({'id': material_id}, {'_id': 0})


# ------------------- CONFIGURATOR -------------------

class EstimateRequest(BaseModel):
    product_type: str = Field(min_length=1)
    dims: Dict[str, float]
    options: Dict[str, Any] = {}
    labor: float = Field(ge=0, default=0)
    margin: float = Field(ge=0, default=40)
    discount_rate: float = Field(ge=0, le=100, default=0)


class SaveConfiguredProduct(BaseModel):
    name: str = Field(min_length=1)
    product_type: str
    dims: Dict[str, float]
    options: Dict[str, Any] = {}
    labor: float = Field(ge=0, default=0)
    margin: float = Field(ge=0, default=40)


@api.get('/configurator/templates')
async def configurator_templates():
    return {'templates': get_public_templates()}


@api.post('/configurator/seed-materials')
async def seed_default_materials():
    """Idempotent: create default materials for missing roles."""
    existing = await db.materials.find({'role': {'$ne': ''}}, {'_id': 0}).to_list(200)
    have_roles = {m.get('role') for m in existing if m.get('role')}
    added = []
    for m in DEFAULT_MATERIALS:
        if m['role'] in have_roles:
            continue
        doc = {**m, 'stock': 0, 'min_stock': 0, 'supplier': '',
               'id': str(uuid.uuid4()), 'created_at': datetime.now(timezone.utc).isoformat()}
        await db.materials.insert_one(doc)
        added.append(clean(doc))
    return {'added': added, 'count': len(added)}


@api.post('/configurator/estimate')
async def configurator_estimate(req: EstimateRequest):
    materials = await db.materials.find({}, {'_id': 0}).to_list(500)
    try:
        result = estimate(req.product_type, req.dims, req.options, req.labor, req.margin, materials)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if req.discount_rate and req.discount_rate > 0:
        result['discount_rate'] = req.discount_rate
        result['final_price'] = round(result['suggested_price'] * (1 - req.discount_rate / 100), 2)
        result['discount_amount'] = round(result['suggested_price'] - result['final_price'], 2)
    return result


@api.post('/configurator/save')
async def configurator_save(req: SaveConfiguredProduct):
    materials = await db.materials.find({}, {'_id': 0}).to_list(500)
    try:
        result = estimate(req.product_type, req.dims, req.options, req.labor, req.margin, materials)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # store as product with 'config' snapshot
    doc = {
        'id': str(uuid.uuid4()),
        'name': req.name,
        'category': req.product_type,
        'status': 'Aktif',
        'labor_cost': req.labor,
        'margin': req.margin,
        'recipe': [],  # legacy field kept empty
        'config': {'product_type': req.product_type, 'dims': req.dims, 'options': req.options},
        'cost': result['cost'],
        'material_cost': result['material_cost'],
        'suggested_price': result['suggested_price'],
        'bom_snapshot': result['bom'],
        'created_at': datetime.now(timezone.utc).isoformat(),
    }
    await db.products.insert_one(doc)
    return clean(doc)


# ---------------------------------------------------


@api.get('/products')
async def get_products():
    products = await docs('products')
    for p in products:
        if p.get('config') and p.get('bom_snapshot'):
            # configured product — recompute with current material prices
            materials = await db.materials.find({}, {'_id': 0}).to_list(500)
            try:
                res = estimate(p['config']['product_type'], p['config']['dims'], p['config'].get('options', {}),
                               float(p.get('labor_cost', 0)), float(p.get('margin', 30)), materials)
                p['cost'] = res['cost']; p['material_cost'] = res['material_cost']
                p['suggested_price'] = res['suggested_price']; p['breakdown'] = res['bom']
            except Exception:
                p['breakdown'] = p.get('bom_snapshot', [])
        else:
            cost, price, mat_cost, breakdown = await calc_product_cost(p)
            p['cost'] = cost; p['material_cost'] = mat_cost
            p['suggested_price'] = price; p['breakdown'] = breakdown
    return products


@api.post('/products')
async def create_product(item: Product):
    doc = item.model_dump()
    cost, price, mat_cost, breakdown = await calc_product_cost(doc)
    doc.update(id=str(uuid.uuid4()), cost=cost, material_cost=mat_cost, suggested_price=price,
               created_at=datetime.now(timezone.utc).isoformat())
    await db.products.insert_one(doc)
    return {**clean(doc), 'breakdown': breakdown}


@api.get('/transactions')
async def get_transactions():
    return await docs('transactions')


@api.post('/transactions')
async def create_transaction(item: Transaction):
    if item.type not in ('sale', 'expense'):
        raise HTTPException(status_code=400, detail='Geçersiz işlem tipi')
    doc = item.model_dump()
    doc.update(id=str(uuid.uuid4()), date=datetime.now(timezone.utc).strftime('%d.%m.%Y'),
               created_at=datetime.now(timezone.utc).isoformat())
    await db.transactions.insert_one(doc)
    return clean(doc)


@api.get('/orders')
async def get_orders():
    return await docs('orders')


@api.post('/orders')
async def create_order(item: OrderCreate):
    doc = item.model_dump()
    if doc.get('product_id'):
        product = await db.products.find_one({'id': doc['product_id']}, {'_id': 0})
        if not product:
            raise HTTPException(status_code=404, detail='Ürün bulunamadı')
        doc['product_name'] = product['name']
        if not doc.get('amount'):
            doc['amount'] = float(product.get('suggested_price', 0)) * doc['quantity']
    rate = float(doc.get('discount_rate', 0) or 0)
    if rate > 0:
        doc['gross_amount'] = round(float(doc.get('amount', 0)), 2)
        doc['amount'] = round(float(doc.get('amount', 0)) * (1 - rate / 100), 2)
    doc.update(id=str(uuid.uuid4()),
               date=datetime.now(timezone.utc).strftime('%d.%m.%Y'),
               created_at=datetime.now(timezone.utc).isoformat())
    await db.orders.insert_one(doc)
    return clean(doc)


@api.patch('/orders/{order_id}')
async def update_order(order_id: str, payload: OrderUpdate):
    order = await db.orders.find_one({'id': order_id}, {'_id': 0})
    if not order:
        raise HTTPException(status_code=404, detail='Sipariş bulunamadı')
    if order.get('status') == 'Tamamlandı' and payload.status != 'Tamamlandı':
        raise HTTPException(status_code=400, detail='Tamamlanmış sipariş güncellenemez')
    stock_updates = []
    stock_warnings = []
    if payload.status == 'Tamamlandı' and order.get('status') != 'Tamamlandı' and order.get('product_id'):
        product = await db.products.find_one({'id': order['product_id']}, {'_id': 0})
        if product:
            qty = int(order.get('quantity', 1))
            for r in product.get('recipe', []):
                m = await db.materials.find_one({'id': r['material_id']}, {'_id': 0})
                if not m:
                    continue
                need = float(r['quantity']) * qty
                new_stock = float(m.get('stock', 0)) - need
                await db.materials.update_one({'id': m['id']}, {'$set': {'stock': round(new_stock, 3)}})
                stock_updates.append({'material_id': m['id'], 'name': m['name'], 'used': need, 'remaining': round(new_stock, 3)})
                if new_stock < 0:
                    stock_warnings.append(f"{m['name']} stoğu eksiye düştü")
                elif new_stock <= float(m.get('min_stock', 0)):
                    stock_warnings.append(f"{m['name']} kritik seviyede")
    await db.orders.update_one({'id': order_id}, {'$set': {'status': payload.status,
                                                             'completed_at': datetime.now(timezone.utc).isoformat() if payload.status == 'Tamamlandı' else None}})
    updated = await db.orders.find_one({'id': order_id}, {'_id': 0})
    return {'order': updated, 'stock_updates': stock_updates, 'warnings': stock_warnings}


@api.get('/customers/summary')
async def customer_summary():
    customers = await docs('customers', 500)
    sales = await db.transactions.find({'type': 'credit_sale'}, {'_id': 0}).to_list(2000)
    payments = await db.customer_payments.find({}, {'_id': 0}).to_list(2000)
    result = []
    for customer in customers:
        cid = customer['id']
        c_sales = [x for x in sales if x.get('customer_id') == cid]
        c_pay = [x for x in payments if x.get('customer_id') == cid]
        tp = sum(x.get('amount', 0) for x in c_sales)
        tpaid = sum(x.get('amount', 0) for x in c_pay)
        result.append({**customer, 'total_purchases': tp, 'total_paid': tpaid,
                       'balance': max(tp - tpaid, 0),
                       'purchase_count': len(c_sales),
                       'last_purchase': c_sales[-1].get('date') if c_sales else None})
    return {'customers': result, 'stats': {'customer_count': len(result),
             'open_balance': sum(x['balance'] for x in result),
             'credit_sales': sum(x['total_purchases'] for x in result),
             'payments': sum(x['total_paid'] for x in result)}}


@api.get('/customers/{customer_id}/history')
async def customer_history(customer_id: str):
    customer = await db.customers.find_one({'id': customer_id}, {'_id': 0})
    if not customer:
        raise HTTPException(status_code=404, detail='Müşteri bulunamadı')
    sales = await db.transactions.find({'type': 'credit_sale', 'customer_id': customer_id}, {'_id': 0}).sort('created_at', -1).to_list(500)
    payments = await db.customer_payments.find({'customer_id': customer_id}, {'_id': 0}).sort('created_at', -1).to_list(500)
    tp = sum(x.get('amount', 0) for x in sales)
    tpaid = sum(x.get('amount', 0) for x in payments)
    return {'customer': customer, 'sales': sales, 'payments': payments,
            'totals': {'purchases': tp, 'paid': tpaid, 'balance': max(tp - tpaid, 0)}}


@api.post('/customers')
async def create_customer(item: CustomerCreate):
    doc = item.model_dump()
    doc.update(id=str(uuid.uuid4()), created_at=datetime.now(timezone.utc).isoformat())
    await db.customers.insert_one(doc)
    return clean(doc)


@api.post('/customers/{customer_id}/credit-sales')
async def create_credit_sale(customer_id: str, item: CreditSale):
    customer = await db.customers.find_one({'id': customer_id}, {'_id': 0})
    if not customer:
        raise HTTPException(status_code=404, detail='Müşteri bulunamadı')
    doc = item.model_dump()
    doc.update(id=str(uuid.uuid4()), customer_id=customer_id, customer_name=customer['name'],
               type='credit_sale', sale_type='Senetli', status='Açık',
               date=datetime.now(timezone.utc).strftime('%d.%m.%Y'),
               created_at=datetime.now(timezone.utc).isoformat())
    await db.transactions.insert_one(doc)
    return clean(doc)


@api.post('/customers/{customer_id}/payments')
async def create_customer_payment(customer_id: str, item: CustomerPayment):
    customer = await db.customers.find_one({'id': customer_id}, {'_id': 0})
    if not customer:
        raise HTTPException(status_code=404, detail='Müşteri bulunamadı')
    doc = item.model_dump()
    doc.update(id=str(uuid.uuid4()), customer_id=customer_id, customer_name=customer['name'],
               date=datetime.now(timezone.utc).strftime('%d.%m.%Y'),
               created_at=datetime.now(timezone.utc).isoformat())
    await db.customer_payments.insert_one(doc)
    return clean(doc)


# ------------------- STOCK ENTRIES & PRICE HISTORY -------------------

@api.post('/materials/{material_id}/stock-entries')
async def add_stock_entry(material_id: str, item: StockEntry, user=Depends(warehouse)):
    m = await db.materials.find_one({'id': material_id}, {'_id': 0})
    if not m:
        raise HTTPException(status_code=404, detail='Malzeme bulunamadı')
    old_cost = float(m.get('unit_cost', 0))
    new_stock = round(float(m.get('stock', 0)) + item.quantity, 3)
    updates = {'stock': new_stock}
    new_cost = old_cost
    if item.unit_cost and item.unit_cost > 0:
        new_cost = float(item.unit_cost)
        updates['unit_cost'] = new_cost
    if item.supplier:
        updates['supplier'] = item.supplier
    await db.materials.update_one({'id': material_id}, {'$set': updates})
    date = item.date or datetime.now(timezone.utc).strftime('%d.%m.%Y')
    entry = {
        'id': str(uuid.uuid4()), 'material_id': material_id, 'material_name': m.get('name', ''),
        'quantity': item.quantity, 'unit_cost': new_cost, 'total_cost': round(item.quantity * new_cost, 2),
        'supplier': item.supplier or m.get('supplier', ''), 'note': item.note, 'date': date,
        'created_at': datetime.now(timezone.utc).isoformat(),
    }
    await db.stock_entries.insert_one(entry)
    if new_cost != old_cost:
        await log_price_change(m, old_cost, new_cost, 'stock_entry')
    return {'entry': clean(entry), 'stock': new_stock, 'unit_cost': new_cost}


@api.get('/materials/{material_id}/stock-entries')
async def list_stock_entries(material_id: str):
    return await db.stock_entries.find({'material_id': material_id}, {'_id': 0}).sort('created_at', -1).to_list(500)


@api.get('/materials/{material_id}/price-history')
async def list_price_history(material_id: str):
    return await db.price_history.find({'material_id': material_id}, {'_id': 0}).sort('created_at', -1).to_list(500)


@api.get('/stock-entries')
async def all_stock_entries():
    return await docs('stock_entries', 300)


@api.get('/materials/low-stock')
async def low_stock_materials():
    mats = await db.materials.find({}, {'_id': 0}).to_list(500)
    low = [m for m in mats if float(m.get('stock', 0)) <= float(m.get('min_stock', 0))]
    return {'materials': low, 'count': len(low)}


# ------------------- ORDER SUMMARY & DEADLINES -------------------

@api.get('/orders/summary')
async def orders_summary():
    orders = await docs('orders', 1000)
    today = datetime.now(timezone.utc).date()
    today_str = today.strftime('%d.%m.%Y')

    def parse_due(o):
        d = o.get('due_date')
        if not d:
            return None
        try:
            return datetime.fromisoformat(d).date()
        except Exception:
            return None

    active, overdue, due_soon = [], [], []
    for o in orders:
        if o.get('status') in ('Tamamlandı', 'İptal'):
            continue
        due = parse_due(o)
        days = (due - today).days if due else None
        row = {**o, 'days_left': days}
        active.append(row)
        if days is not None and days < 0:
            overdue.append(row)
        elif days is not None and days <= 3:
            due_soon.append(row)

    active.sort(key=lambda r: (r['days_left'] is None, r['days_left'] if r['days_left'] is not None else 0))
    today_created = [o for o in orders if o.get('date') == today_str]
    return {
        'active': active, 'overdue': overdue, 'due_soon': due_soon,
        'today': today_created,
        'stats': {
            'active_count': len(active), 'overdue_count': len(overdue),
            'due_soon_count': len(due_soon), 'today_count': len(today_created),
        },
    }


# ------------------- DISCOUNT TIERS -------------------

@api.get('/discounts')
async def get_discounts():
    return await db.discounts.find({}, {'_id': 0}).sort('created_at', 1).to_list(100)


@api.post('/discounts')
async def create_discount(item: DiscountTier, user=Depends(accounting)):
    doc = item.model_dump()
    doc.update(id=str(uuid.uuid4()), created_at=datetime.now(timezone.utc).isoformat())
    await db.discounts.insert_one(doc)
    return clean(doc)


@api.patch('/discounts/{discount_id}')
async def update_discount(discount_id: str, payload: DiscountUpdate, user=Depends(accounting)):
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail='Güncellenecek alan yok')
    r = await db.discounts.update_one({'id': discount_id}, {'$set': updates})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail='İskonto bulunamadı')
    return await db.discounts.find_one({'id': discount_id}, {'_id': 0})


@api.delete('/discounts/{discount_id}')
async def delete_discount(discount_id: str, user=Depends(accounting)):
    r = await db.discounts.delete_one({'id': discount_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail='İskonto bulunamadı')
    return {'ok': True}


DEFAULT_DISCOUNTS = [
    {'name': 'Bayi', 'rate': 15, 'description': 'Bayi / toptan satış iskontosu'},
    {'name': 'Şube', 'rate': 10, 'description': 'Şube satış iskontosu'},
    {'name': 'Personel', 'rate': 20, 'description': 'Personel satış iskontosu'},
    {'name': 'Özel Durum', 'rate': 0, 'description': 'Duruma göre ayarlanabilir özel iskonto'},
]


async def seed_discounts(db):
    if await db.discounts.count_documents({}) == 0:
        for d in DEFAULT_DISCOUNTS:
            await db.discounts.insert_one({**d, 'active': True, 'id': str(uuid.uuid4()),
                                           'created_at': datetime.now(timezone.utc).isoformat()})


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
                   allow_methods=['*'], allow_headers=['*'])


PUBLIC_PATHS = {'/api/', '/api/auth/login', '/api/auth/logout'}


@app.middleware('http')
async def auth_gate(request: Request, call_next):
    p = request.url.path
    if request.method == 'OPTIONS' or not p.startswith('/api/') or p in PUBLIC_PATHS:
        return await call_next(request)
    # verify token exists; get_current_user_from raises HTTPException handled by FastAPI
    try:
        user = await get_current_user_from(request, db)
        request.state.user = user
    except HTTPException as e:
        from starlette.responses import JSONResponse
        return JSONResponse({'detail': e.detail}, status_code=e.status_code)
    return await call_next(request)


@app.on_event('startup')
async def startup():
    await seed_admin(db)
    await seed_discounts(db)


@app.on_event('shutdown')
async def shutdown():
    client.close()
