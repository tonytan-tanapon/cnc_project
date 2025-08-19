# deps/authz.py
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from deps.auth import get_current_user          # << ชี้มาที่ deps.auth
from models import User, Permission, RolePermission, UserRole

def require_perm(perm_code: str):
    def dep(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
        if getattr(user, "is_superuser", False):
            return
        q = (
            db.query(Permission.id)
              .join(RolePermission, RolePermission.permission_id == Permission.id)
              .join(UserRole, UserRole.role_id == RolePermission.role_id)
              .filter(UserRole.user_id == user.id, Permission.code == perm_code)
        )
        has_perm = db.query(q.exists()).scalar()
        if not has_perm:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail=f"Missing permission: {perm_code}")
    return dep

def require_any(*perm_codes: str):
    def dep(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
        if getattr(user, "is_superuser", False):
            return
        q = (
            db.query(Permission.id)
              .join(RolePermission, RolePermission.permission_id == Permission.id)
              .join(UserRole, UserRole.role_id == RolePermission.role_id)
              .filter(UserRole.user_id == user.id, Permission.code.in_(perm_codes))
        )
        if not db.query(q.exists()).scalar():
            need = ", ".join(perm_codes)
            raise HTTPException(403, detail=f"Need any of: {need}")
    return dep
