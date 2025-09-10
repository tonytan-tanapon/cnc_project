# routers/v1/__init__.py
from fastapi import APIRouter

from . import (
    auth, customers, pos, employees, materials, batches, lots, lot_uses,
    travelers, traveler_steps, suppliers, subcon, payroll, time_clock,
    parts, users, pay_periods, payroll_extras
)

api_v1 = APIRouter()

# Routers ที่ export เป็น .router
api_v1.include_router(auth.router)
api_v1.include_router(customers.router)
api_v1.include_router(employees.router)
api_v1.include_router(materials.router)
api_v1.include_router(batches.router)
api_v1.include_router(lots.router)
api_v1.include_router(lot_uses.router)
api_v1.include_router(travelers.router)
api_v1.include_router(traveler_steps.router)
api_v1.include_router(suppliers.router)
api_v1.include_router(subcon.router)
api_v1.include_router(users.router)
api_v1.include_router(pay_periods.router)
api_v1.include_router(payroll_extras.router)

# time_clock แยกเป็น 2 ตัว
api_v1.include_router(time_clock.timeclock_router)
api_v1.include_router(time_clock.breaks_router)

# parts: ใช้ parts_router (revisions อยู่ภายในไฟล์เดียวกัน)
api_v1.include_router(parts.parts_router)

# pos: ใช้ pos_router
api_v1.include_router(pos.pos_router)

# payroll: main + subrouters
api_v1.include_router(payroll.router)          # /payroll/...
api_v1.include_router(payroll.periods_router)  # /pay-periods/...
api_v1.include_router(payroll.rates_router)    # /pay-rates/...

__all__ = ["api_v1"]
