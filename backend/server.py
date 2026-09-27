from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
import os, uuid

from configurator import get_public_templates, estimate, DEFAULT_MATERIALS

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]
app = FastAPI(title='Atölye360 API')
api = APIRouter(prefix='/api')


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
    r = await db.materials.update_one({'id': material_id}, {'$set': updates})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail='Malzeme bulunamadı')
    doc = await db.materials.find_one({'id': material_id}, {'_id': 0})
    return doc


# ------------------- CONFIGURATOR -------------------

class EstimateRequest(BaseModel):
    product_type: str = Field(min_length=1)
    dims: Dict[str, float]
    options: Dict[str, Any] = {}
    labor: float = Field(ge=0, default=0)
    margin: float = Field(ge=0, default=40)


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


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
                   allow_methods=['*'], allow_headers=['*'])


@app.on_event('shutdown')
async def shutdown():
    client.close()
