from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, List
import os, uuid

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]
app = FastAPI(title='Atölye360 API')
api = APIRouter(prefix='/api')

class Material(BaseModel):
    name: str
    category: str = 'Ahşap'
    unit: str = 'm²'
    stock: float = 0
    min_stock: float = 0
    unit_cost: float = 0
    supplier: str = ''

class Product(BaseModel):
    name: str
    category: str = 'Masa'
    status: str = 'Aktif'
    labor_cost: float = 0
    margin: float = 30
    recipe: list = []

class Transaction(BaseModel):
    type: str
    description: str
    amount: float
    status: str = 'Tamamlandı'

async def docs(collection, limit=100):
    return await db[collection].find({}, {'_id': 0}).sort('created_at', -1).to_list(limit)

@api.get('/')
async def root(): return {'message': 'Atölye360 API hazır'}

@api.get('/dashboard')
async def dashboard():
    materials = await docs('materials')
    products = await docs('products')
    transactions = await docs('transactions', 20)
    orders = await docs('orders', 20)
    sales = sum(x['amount'] for x in transactions if x.get('type') == 'sale')
    expenses = sum(x['amount'] for x in transactions if x.get('type') == 'expense')
    return {'materials': materials, 'products': products, 'transactions': transactions, 'orders': orders,
            'stats': {'sales': sales, 'expenses': expenses, 'profit': sales-expenses,
                      'low_stock': sum(1 for x in materials if x.get('stock', 0) <= x.get('min_stock', 0)),
                      'product_count': len(products), 'order_count': len(orders)}}

@api.get('/materials')
async def get_materials(): return await docs('materials')

@api.post('/materials')
async def create_material(item: Material):
    doc = item.model_dump(); doc.update(id=str(uuid.uuid4()), created_at=datetime.now(timezone.utc).isoformat())
    await db.materials.insert_one(doc); return {k: v for k, v in doc.items() if k != '_id'}

@api.get('/products')
async def get_products(): return await docs('products')

@api.post('/products')
async def create_product(item: Product):
    doc = item.model_dump(); material_docs = await db.materials.find({}, {'_id': 0}).to_list(100)
    cost = item.labor_cost + sum((next((m.get('unit_cost', 0) for m in material_docs if m.get('id') == r.get('material_id')), r.get('unit_cost', 0)) * r.get('quantity', 0)) for r in item.recipe)
    doc.update(id=str(uuid.uuid4()), cost=round(cost, 2), suggested_price=round(cost * (1 + item.margin/100), 2), created_at=datetime.now(timezone.utc).isoformat())
    await db.products.insert_one(doc); return {k: v for k, v in doc.items() if k != '_id'}

@api.get('/transactions')
async def get_transactions(): return await docs('transactions')

@api.post('/transactions')
async def create_transaction(item: Transaction):
    doc = item.model_dump(); doc.update(id=str(uuid.uuid4()), date=datetime.now(timezone.utc).strftime('%d.%m.%Y'), created_at=datetime.now(timezone.utc).isoformat())
    await db.transactions.insert_one(doc); return {k: v for k, v in doc.items() if k != '_id'}

@api.get('/orders')
async def get_orders(): return await docs('orders')

@api.post('/orders')
async def create_order(item: dict):
    doc = dict(item); doc.update(id=str(uuid.uuid4()), created_at=datetime.now(timezone.utc).isoformat())
    await db.orders.insert_one(doc); return {k: v for k, v in doc.items() if k != '_id'}

app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','), allow_methods=['*'], allow_headers=['*'])

@app.on_event('shutdown')
async def shutdown(): client.close()