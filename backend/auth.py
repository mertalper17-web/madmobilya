"""JWT auth for MAD Mobilya ERP.
- Admin-managed user creation (no public signup)
- Username + password (bcrypt) + role-based access
- Access token via httpOnly cookie + Bearer fallback
"""
import os, uuid, bcrypt, jwt
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import Request, HTTPException, Depends, APIRouter, Response
from pydantic import BaseModel, Field

JWT_ALGORITHM = "HS256"
ACCESS_TTL_MIN = 60 * 8   # 8h session
COOKIE_MAX_AGE = ACCESS_TTL_MIN * 60

ROLES = ["admin", "muhasebe", "depo", "sevkiyat", "montaj"]


# ---------- password ----------
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


# ---------- jwt ----------
def _secret() -> str:
    return os.environ["JWT_SECRET"]


def create_token(user_id: str, username: str, role: str) -> str:
    return jwt.encode({
        "sub": user_id, "username": username, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MIN),
        "type": "access",
    }, _secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError()
    return payload


# ---------- dependency ----------
def _get_token(request: Request) -> str:
    tok = request.cookies.get("access_token")
    if not tok:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            tok = auth[7:]
    if not tok:
        raise HTTPException(status_code=401, detail="Giriş gerekli")
    return tok


async def get_current_user_from(request: Request, db):
    try:
        payload = decode_token(_get_token(request))
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Oturum süresi doldu, tekrar giriş yapın")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı veya pasif")
    return user


def require_roles(*allowed: str):
    async def _dep(user=Depends(lambda: None)):
        # placeholder; actual dep injected in server.py where db is bound
        return user
    return _dep


# ---------- schemas ----------
class LoginIn(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=4)
    name: str = ""
    role: str = "muhasebe"
    active: bool = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=4)


# ---------- seed ----------
async def seed_admin(db):
    username = os.environ.get("ADMIN_USERNAME", "admin")
    password = os.environ.get("ADMIN_PASSWORD", "admin")
    existing = await db.users.find_one({"username": username})
    if not existing:
        doc = {
            "id": str(uuid.uuid4()),
            "username": username, "password_hash": hash_pw(password),
            "name": "Sistem Yöneticisi", "role": "admin", "active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(doc)
        print(f"[auth] admin created: {username}")
    elif not verify_pw(password, existing["password_hash"]):
        await db.users.update_one({"username": username}, {"$set": {"password_hash": hash_pw(password)}})
        print(f"[auth] admin password refreshed: {username}")
    try:
        await db.users.create_index("username", unique=True)
    except Exception:
        pass
