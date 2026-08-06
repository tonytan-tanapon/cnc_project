from sqlalchemy.orm import Session

from models import (
    ProductionLot,
    ShopTraveler,
)


def calculate_final_qty(traveler: ShopTraveler) -> float:
    """
    Return good quantity of the last production step.
    """

    if not traveler:
        return 0

    final_qty = 0

    steps_sorted = sorted(
        traveler.steps or [],
        key=lambda s: (
            int("".join(filter(str.isdigit, str(s.step_code or "0"))))
            if any(ch.isdigit() for ch in str(s.step_code or ""))
            else 999999
        ),
    )

    if not steps_sorted:
        return 0

    final_step = steps_sorted[-1]

    for log in final_step.logs or []:
        final_qty += log.qty_accept or 0

    return final_qty


def update_completed_qty(db: Session, lot_id: int):
    """
    Update ProductionLot.completed_qty
    """

    lot = (
        db.query(ProductionLot)
        .filter(ProductionLot.id == lot_id)
        .first()
    )

    if not lot:
        return

    traveler = (
        db.query(ShopTraveler)
        .filter(ShopTraveler.lot_id == lot_id)
        .first()
    )

    if not traveler:
        lot.completed_qty = 0
        db.commit()
        return
    
    final_qty = calculate_final_qty(traveler)
    print(f"Updating completed_qty for lot_id {lot_id}: {final_qty}")
    lot.completed_qty = final_qty

    db.commit()