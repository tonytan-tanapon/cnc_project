# scheduler.py
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
# from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select, update, and_
from models import TimeEntry, Break
from database import SessionLocal

LA = ZoneInfo("America/Los_Angeles")

def next_22_la(now=None):
    now = now or datetime.now(tz=LA)
    target = datetime.combine(now.date(), time(22, 0), tzinfo=LA)
    if now > target:
        target = target + timedelta(days=1)
    return target

async def auto_clockout_job():
    la_now = datetime.now(tz=LA)
    cutoff = datetime.combine(la_now.date(), time(22, 0), tzinfo=LA)
    # แปลงเป็น UTC ก่อนเขียนลงฐานถ้าคอลัมน์เป็น timestamptz
    cutoff_utc = cutoff.astimezone(tz=None).astimezone()  # หรือ cutoff.astimezone(ZoneInfo("UTC"))

    db = SessionLocal()
    try:
        # 1) ปิด break ที่ยังไม่ปิด
        open_breaks = db.execute(
            select(Break).where(Break.end_at.is_(None))
        ).scalars().all()
        for b in open_breaks:
            b.end_at = cutoff_utc

        # 2) ปิด time entries ที่ยังไม่ปิด
        open_tes = db.execute(
            select(TimeEntry).where(TimeEntry.clock_out_at.is_(None))
        ).scalars().all()
        for te in open_tes:
            # กันกรณี clock_in หลัง 22:00 ให้ไม่ย้อนเวลากลับ
            te.clock_out_at = max(cutoff_utc, te.clock_in_at)

        db.commit()
    finally:
        db.close()

# def setup_scheduler(app):
#     sch = AsyncIOScheduler(timezone=str(LA))
#     # รันทุกวัน 22:01 LA
#     sch.add_job(auto_clockout_job, "cron", hour=22, minute=1)
#     sch.start()
#     return sch
