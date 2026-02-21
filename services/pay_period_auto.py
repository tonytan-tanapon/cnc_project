from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from models import PayPeriod
from database import SessionLocal

PAY_PERIOD_LENGTH = 14
TRIGGER_DAYS = 7

def ensure_next_pay_period():
    db: Session = SessionLocal()

    try:
        latest = (
            db.query(PayPeriod)
            .order_by(PayPeriod.start_at.desc())
            .first()
        )

        if not latest:
            return

        from datetime import datetime, timedelta, timezone

        today = datetime.now(timezone.utc)
        trigger_date = latest.start_at + timedelta(days=TRIGGER_DAYS)

        if today < trigger_date:
            return

        next_start = latest.end_at
        next_end = next_start + timedelta(days=PAY_PERIOD_LENGTH)

        exists = (
            db.query(PayPeriod)
            .filter(
                PayPeriod.start_at == next_start,
                PayPeriod.end_at == next_end,
            )
            .first()
        )

        if exists:
            return

        db.add(
            PayPeriod(
                start_at=next_start,
                end_at=next_end,
                status="open",
                notes="auto-created",
            )
        )

        db.commit()
        print("Auto-created next pay period")

    finally:
        db.close()
