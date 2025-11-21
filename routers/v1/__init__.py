# routers/v1/__init__.py
from fastapi import APIRouter

from . import (
    auth, customers, pos, employees, materials, batches, lots, reports,#lot_uses, 
    travelers, traveler_steps, suppliers, subcon, payroll, time_clock,
    parts, users, pay_periods, payroll_extras, data, data_detail,part_selections,lookups, 
    part_materials,report_materials, po_lines,
    reports_due_date_monitor,lots_browse, shipment_status,customer_shipments,
    lot_materials,inventory,lot_shippments,lot_summary,



    ############ auto routers ######################
    suppliers_auto
)

api_v1 = APIRouter()
api_v1.include_router(lot_summary.router)
# api_v1.include_router(lot_summary.router)
api_v1.include_router(lots_browse.router)  
# Routers ที่ export เป็น .router
api_v1.include_router(auth.router)
api_v1.include_router(customers.router)
api_v1.include_router(employees.router)
api_v1.include_router(materials.router)
api_v1.include_router(batches.router)
api_v1.include_router(lots.router)
# api_v1.include_router(lot_uses.router)
api_v1.include_router(travelers.router)
api_v1.include_router(traveler_steps.router)



# api_v1.include_router(suppliers.router)



api_v1.include_router(subcon.router)
api_v1.include_router(users.router)
api_v1.include_router(pay_periods.router)
api_v1.include_router(payroll_extras.router)
api_v1.include_router(data.router)
api_v1.include_router(data_detail.router)
api_v1.include_router(reports.router)
# time_clock แยกเป็น 2 ตัว
api_v1.include_router(time_clock.timeclock_router)
api_v1.include_router(time_clock.breaks_router)

# parts: ใช้ parts_router (revisions อยู่ภายในไฟล์เดียวกัน)
api_v1.include_router(parts.parts_router)
api_v1.include_router(part_selections.sel_router)
# pos: ใช้ pos_router
api_v1.include_router(pos.pos_router)
api_v1.include_router(po_lines.router)
api_v1.include_router(lookups.lookups)
# payroll: main + subrouters
api_v1.include_router(payroll.router)          # /payroll/...
api_v1.include_router(payroll.periods_router)  # /pay-periods/...
api_v1.include_router(payroll.rates_router)    # /pay-rates/...
api_v1.include_router(part_materials.router)    # /pay-rates/...

api_v1.include_router(report_materials.router)   
api_v1.include_router(reports_due_date_monitor.router) 
   
api_v1.include_router(customer_shipments.shipment_router) 
api_v1.include_router(lot_materials.router) 
api_v1.include_router(inventory.router)
api_v1.include_router(lot_shippments.router) 
############### auto routers ######################
api_v1.include_router(shipment_status.router)

__all__ = ["api_v1"]
