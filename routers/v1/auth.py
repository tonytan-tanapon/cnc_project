from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import SessionLocal


from deps.auth import (
    login_for_access_token,
    get_current_user,
    get_password_hash,
    require_superadmin,
)
from models import User


router = APIRouter(prefix="/auth", tags=["auth"])




# =========================================================
# LOGIN
# =========================================================

@router.post("/token")
def issue_token(resp=Depends(login_for_access_token)):
    return resp


# =========================================================
# CURRENT USER
# =========================================================

@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "username": user.username,
        "is_active": user.is_active,
        "is_superuser": user.is_superuser,
    }



# =========================================================
# CHANGE MY PASSWORD
# =========================================================

class ResetPasswordIn(BaseModel):
    password: str


@router.post("/reset-password")
def reset_password(
    data: ResetPasswordIn,
    current_user: User = Depends(get_current_user),
):

    db = SessionLocal()

    try:
        user = db.get(User, current_user.id)

        if not user:
            raise HTTPException(
                status_code=404,
                detail="User not found"
            )

        user.password_hash = get_password_hash(
            data.password
        )

        db.commit()

        return {
            "message": "Password updated successfully"
        }

    finally:
        db.close()


# =========================================================
# SUPER ADMIN RESET USER PASSWORD
# =========================================================

class AdminResetPasswordIn(BaseModel):
    target_username: str
    new_password: str


@router.post(
    "/admin-reset-password",
    dependencies=[Depends(require_superadmin)]
)
def admin_reset_password(
    data: AdminResetPasswordIn,
):

    # -----------------------------------------
    # SUPER ADMIN ONLY
    # -----------------------------------------



    db = SessionLocal()

    try:
        user = (
            db.query(User)
            .filter(
                User.username == data.target_username
            )
            .first()
        )

        if not user:
            raise HTTPException(
                status_code=404,
                detail="User not found"
            )

        user.password_hash = get_password_hash(
            data.new_password
        )

        user.is_active = True

        db.commit()

        return {
            "message": "Password reset success"
        }

    finally:
        db.close()


