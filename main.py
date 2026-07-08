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


from apscheduler.schedulers.background import BackgroundScheduler
from services.pay_period_auto import ensure_next_pay_period
from services.traveler_close_auto import run_traveler_close
from databaseExport import database_backup
from database_import import update_lot_shippment
import os


# ------------------------------
# App bootstrap
# ------------------------------


app = FastAPI(title="MFG API", version="1.0")


scheduler = BackgroundScheduler()

@app.on_event("startup")
def start_scheduler():

    # เปิด Scheduler เฉพาะตอนที่ตั้ง Environment Variable
    # print("os.getenv(ABLE_SCHEDULER)",os.getenv("ENABLE_SCHEDULER"))
    if os.getenv("ENABLE_SCHEDULER") != "1":
        print("Scheduler disabled.")
        return
   
    scheduler.add_job(
        ensure_next_pay_period,
        "cron",
        hour=0,
        minute=1,
        id="pay_period"
    )

    scheduler.add_job(
        run_traveler_close,
        "cron",
        day_of_week="mon-fri",
        hour=1,
        minute=0,
        id="traveler_close"
    )

    scheduler.add_job(
        run_traveler_close,
        "cron",
        day_of_week="mon-fri",
        hour=1,
        minute=0,
        id="update_lot_shippment"
    )

    scheduler.add_job(
        database_backup,
        "cron",
        day=28,
        hour=1,      # ตัวอย่าง รันตี 1
        minute=0,
        id="database_export"
    )
    scheduler.start()
    ensure_next_pay_period()

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
    return RedirectResponse(url="/static/manage-lot-shipment-status.html")

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
