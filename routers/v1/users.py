# routers/users.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List

from database import get_db
from models import User, Employee, Role, Permission, UserRole, RolePermission
from schemas import (
    UserCreate, UserUpdate, UserOut,
    SetPasswordIn, AssignRoleIn, RoleOut, PermissionOut
)

# ---------- Robust password hasher (with fallback) ----------
# พยายามใช้ utils.security.hash_password ถ้ามี
try:
    from importlib import import_module
    _sec = import_module("utils.security")
    if hasattr(_sec, "hash_password"):
        hash_password = _sec.hash_password  # type: ignore[attr-defined]
    else:
        raise ImportError("utils.security.hash_password not found")
except Exception:
    # Fallback แบบง่าย: SHA-256 (แนะนำให้เปลี่ยนเป็น passlib/bcrypt ใน production)
    import hashlib, os
    def hash_password(raw: str) -> str:
        salt = os.getenv("APP_PW_SALT", "")
        return hashlib.sha256((salt + raw).encode("utf-8")).hexdigest()
# ------------------------------------------------------------

router = APIRouter(prefix="/users", tags=["users"])


# ---------------------------
# Helpers
# ---------------------------
def _get_user_or_404(db: Session, user_id: int) -> User:
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    return u

def _get_role_or_404(db: Session, role_code: str) -> Role:
    r = db.query(Role).filter(Role.code == role_code).first()
    if not r:
        raise HTTPException(404, "Role not found")
    return r


# ---------------------------
# CRUD Users
# ---------------------------
@router.post("", response_model=UserOut)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(409, "Username already exists")

    if payload.email and db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(409, "Email already exists")

    u = User(
    username=payload.username.strip(),
    email=payload.email,
    password_hash=hash_password(payload.password),  # ใช้ตัวนี้
    is_active=payload.is_active if payload.is_active is not None else True,
    is_superuser=payload.is_superuser if payload.is_superuser is not None else False,
    employee_id=payload.employee_id,
)

    db.add(u)
    db.commit()
    db.refresh(u)
    return u

@router.get("", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).order_by(User.id.desc()).all()

@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    return _get_user_or_404(db, user_id)

@router.put("/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db)):
    u = _get_user_or_404(db, user_id)

    if payload.email:
        exists = db.query(User).filter(and_(User.email == payload.email, User.id != user_id)).first()
        if exists:
            raise HTTPException(409, "Email already exists")

    for k, v in payload.dict(exclude_unset=True).items():
        setattr(u, k, v)

    db.commit()
    db.refresh(u)
    return u

@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    u = _get_user_or_404(db, user_id)
    db.delete(u)
    db.commit()
    return {"message": "User deleted"}


# ---------------------------
# Password management
# ---------------------------
@router.post("/{user_id}/set-password")
def set_password(user_id: int, payload: SetPasswordIn, db: Session = Depends(get_db)):
    u = _get_user_or_404(db, user_id)
    if not payload.new_password or len(payload.new_password) < 6:
        raise HTTPException(422, "Password must be at least 6 characters")
    u.password_hash = hash_password(payload.new_password)  # ใช้ตัวนี้
    db.commit()
    return {"message": "Password updated"}



# ---------------------------
# Activate / Deactivate
# ---------------------------
@router.post("/{user_id}/activate")
def activate_user(user_id: int, db: Session = Depends(get_db)):
    u = _get_user_or_404(db, user_id)
    u.is_active = True
    db.commit()
    return {"message": "User activated"}

@router.post("/{user_id}/deactivate")
def deactivate_user(user_id: int, db: Session = Depends(get_db)):
    u = _get_user_or_404(db, user_id)
    u.is_active = False
    db.commit()
    return {"message": "User deactivated"}


# ---------------------------
# Roles
# ---------------------------
@router.get("/{user_id}/roles", response_model=List[RoleOut])
def list_user_roles(user_id: int, db: Session = Depends(get_db)):
    _get_user_or_404(db, user_id)
    rows = (
        db.query(Role)
        .join(UserRole, UserRole.role_id == Role.id)
        .filter(UserRole.user_id == user_id)
        .order_by(Role.code.asc())
        .all()
    )
    return rows

@router.post("/{user_id}/roles")
def assign_role(user_id: int, payload: AssignRoleIn, db: Session = Depends(get_db)):
    _get_user_or_404(db, user_id)
    role = _get_role_or_404(db, payload.role_code.strip().upper())

    exists = (
        db.query(UserRole)
        .filter(UserRole.user_id == user_id, UserRole.role_id == role.id)
        .first()
    )
    if exists:
        return {"message": "Role already assigned"}

    db.add(UserRole(user_id=user_id, role_id=role.id))
    db.commit()
    return {"message": "Role assigned"}

@router.delete("/{user_id}/roles/{role_code}")
def unassign_role(user_id: int, role_code: str, db: Session = Depends(get_db)):
    _get_user_or_404(db, user_id)
    role = _get_role_or_404(db, role_code.strip().upper())

    ur = (
        db.query(UserRole)
        .filter(UserRole.user_id == user_id, UserRole.role_id == role.id)
        .first()
    )
    if not ur:
        raise HTTPException(404, "Role not assigned to this user")

    db.delete(ur)
    db.commit()
    return {"message": "Role unassigned"}


# ---------------------------
# Permissions
# ---------------------------
@router.get("/{user_id}/permissions", response_model=List[PermissionOut])
def list_user_permissions(user_id: int, db: Session = Depends(get_db)):
    _get_user_or_404(db, user_id)

    q = (
        db.query(Permission)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(UserRole, UserRole.role_id == RolePermission.role_id)
        .filter(UserRole.user_id == user_id)
        .distinct()
        .order_by(Permission.code.asc())
    )
    return q.all()
