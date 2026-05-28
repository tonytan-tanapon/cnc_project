from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from jose import jwt
from datetime import datetime, timedelta

router = APIRouter()

SECRET_KEY = "mysecretkey"

class LoginIn(BaseModel):
    username: str
    password: str

@router.post("/login")
def login(data: LoginIn):

    # ตัวอย่างเช็ค user
    if data.username != "admin" or data.password != "1234":
        raise HTTPException(401, "Invalid username/password")

    payload = {
        "sub": data.username,
        "exp": datetime.utcnow() + timedelta(hours=8)
    }

    token = jwt.encode(
        payload,
        SECRET_KEY,
        algorithm="HS256"
    )

    return {
        "access_token": token
    }