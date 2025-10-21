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
