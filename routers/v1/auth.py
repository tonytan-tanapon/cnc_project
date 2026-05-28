# routers/auth.py
from fastapi import APIRouter, Depends
from deps.auth import login_for_access_token, get_current_user
from models import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/token")
def issue_token(resp=Depends(login_for_access_token)):
    return resp


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "username": user.username,
        "is_superuser": user.is_superuser,
    }



from pydantic import BaseModel
from passlib.context import CryptContext
from database import SessionLocal
from models import User

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

class RegisterIn(BaseModel):
    username: str
    password: str
    role: str = "operator"

@router.post("/register")
def register(data: RegisterIn):

    db = SessionLocal()

    try:

        exists = (
            db.query(User)
            .filter(User.username == data.username)
            .first()
        )

        if exists:
            return {
                "error": "Username already exists"
            }

        user = User(
            username=data.username,

            password_hash=pwd_context.hash(
                data.password
            ),

            is_superuser=False,
is_active=False
        )

        db.add(user)
        db.commit()

        return {
            "message": "Register success"
        }

    finally:
        db.close()


# =========================
# RESET PASSWORD
# =========================

class ResetPasswordIn(BaseModel):
    username: str
    password: str


from fastapi import HTTPException
@router.post("/reset-password")
def reset_password(data: ResetPasswordIn):

    db = SessionLocal()

    try:

        user = (
            db.query(User)
            .filter(
                User.username == data.username
            )
            .first()
        )

        if not user:

            raise HTTPException(
                status_code=404,
                detail="User not found"
            )

        # =========================
        # HASH NEW PASSWORD
        # =========================

        user.password_hash = (
            pwd_context.hash(
                data.password
            )
        )

        db.commit()

        return {
            "message":
                "Password updated successfully"
        }

    finally:
        db.close()



from deps.auth import (
    login_for_access_token,
    get_current_user,
    verify_password,
    get_password_hash
)

class AdminResetPasswordIn(BaseModel):

    admin_username: str
    admin_password: str

    target_username: str
    new_password: str




@router.post("/admin-reset-password")
def admin_reset_password(
    data: AdminResetPasswordIn
):

    db = SessionLocal()

    try:

        # =========================
        # VERIFY ADMIN
        # =========================

        admin = (
            db.query(User)
            .filter(
                User.username ==
                data.admin_username
            )
            .first()
        )

        if (
            not admin or
            not admin.is_superuser
        ):

            raise HTTPException(
                403,
                "Invalid admin"
            )

        # password verify
        if not verify_password(
            data.admin_password,
            admin.password_hash
        ):

            raise HTTPException(
                403,
                "Invalid admin password"
            )

        # =========================
        # TARGET USER
        # =========================

        user = (
            db.query(User)
            .filter(
                User.username ==
                data.target_username
            )
            .first()
        )

        if not user:

            raise HTTPException(
                404,
                "User not found"
            )

        # =========================
        # RESET
        # =========================

        user.password_hash = (
            get_password_hash(
                data.new_password
            )
        )

        user.is_active = True

        db.commit()

        return {
            "message":
              "Password reset success"
        }

    finally:

        db.close()