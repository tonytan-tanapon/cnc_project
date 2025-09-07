# routers/v1/__init__.py
from fastapi import APIRouter

# นำเข้า router รายโดเมน (แก้ให้ตรงกับไฟล์ที่คุณมีจริง)
from . import (
    auth,customers, pos, employees, materials, batches,
    lots,lot_uses,travelers, traveler_steps,suppliers, subcon, payroll, time_clock,
    parts, users, pay_periods,payroll_extras
)

api_v1 = APIRouter()
api_v1.include_router(auth.router)
api_v1.include_router(customers.router)
api_v1.include_router(pos.router)
api_v1.include_router(employees.router)
api_v1.include_router(materials.router)
api_v1.include_router(batches.router)
api_v1.include_router(lots.router)
api_v1.include_router(lot_uses.router)
api_v1.include_router(travelers.router)
api_v1.include_router(traveler_steps.router)
api_v1.include_router(suppliers.router)
api_v1.include_router(subcon.router)
api_v1.include_router(payroll.router)
api_v1.include_router(time_clock.timeclock_router)
api_v1.include_router(time_clock.breaks_router)
api_v1.include_router(parts.parts_router)
api_v1.include_router(parts.part_revisions_router)
api_v1.include_router(users.router)
api_v1.include_router(pay_periods.router)
api_v1.include_router(payroll.router)          # เส้นเดิม /payroll/...
api_v1.include_router(payroll.periods_router)  # ใหม่ /pay-periods/...
api_v1.include_router(payroll.rates_router)    # ใหม่ /pay-rates/...
api_v1.include_router(payroll_extras.router)
__all__ = ["api_v1"]
