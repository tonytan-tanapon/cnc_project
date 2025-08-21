# main.py (organized CRUD API)
from __future__ import annotations

from fastapi import FastAPI, Depends, APIRouter, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates


from routers.v1 import api_v1

from sqlalchemy import func, text


# --- Local utils & DB ---
from utils.code_generator import next_code, next_code_yearly
from database import SessionLocal, engine, get_db


# ------------------------------
# App bootstrap
# ------------------------------


app = FastAPI(title="MFG API", version="1.0")

origins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static & templates (optional)
try:
    app.mount("/static", StaticFiles(directory="static"), name="static")
    templates = Jinja2Templates(directory="templates")
except Exception:  # pragma: no cover
    templates = None

from fastapi.responses import HTMLResponse, RedirectResponse
@app.get("/", include_in_schema=False)
def root():
    # เปิด / แล้วให้ไป login (ง่ายสุด)
    return RedirectResponse(url="/static/index.html")

@app.get("/index", include_in_schema=False)
def index():
    return RedirectResponse(url="/static/index.html")

@app.get("/login", include_in_schema=False)
def login_page():
    return RedirectResponse(url="/static/login.html")


@app.get("/time-clock", include_in_schema=False)
def time_clock_page():
    return RedirectResponse(url="/static/time_clock.html")

@app.get("/index", include_in_schema=False)
def time_clock_page():
    return RedirectResponse(url="/static/travelers.html")

@app.get("/index", include_in_schema=False)
def time_clock_page():
    return RedirectResponse(url="/static/traveler_steps.html")


ui_router = APIRouter(prefix="/ui", tags=["ui"])
templates = Jinja2Templates(directory="templates")

@ui_router.get("/travelers", response_class=HTMLResponse)
def ui_travelers(request: Request):
    # หน้า list ทั้งหมด
    return templates.TemplateResponse("travelers.html", {"request": request})

@ui_router.get("/travelers/{traveler_id}/steps", response_class=HTMLResponse)
def ui_traveler_steps(traveler_id: int, request: Request):
    # หน้า list steps ของ traveler_id
    return templates.TemplateResponse(
        "traveler_steps.html",
        {"request": request, "traveler_id": traveler_id}
    )

app.include_router(api_v1, prefix="/api/v1")
