# scripts/fix_step_status.py
from database import SessionLocal
from models import ShopTravelerStep

ALLOWED = {"pending", "running", "passed", "failed", "skipped"}

def main():
    with SessionLocal() as db:
        # ดูว่ามีสถานะนอกเหนือจากที่อนุญาตมั้ย
        bad = (
            db.query(ShopTravelerStep)
              .filter(~ShopTravelerStep.status.in_(ALLOWED))
              .all()
        )
        print(f"found invalid rows: {len(bad)}")
        if bad:
            # แก้ 'done' ให้เป็น 'passed' (ปรับตามความหมายของระบบคุณ)
            updated = (
                db.query(ShopTravelerStep)
                  .filter(ShopTravelerStep.status == "done")
                  .update({ShopTravelerStep.status: "passed"},
                          synchronize_session=False)
            )
            db.commit()
            print(f"updated 'done' -> 'passed': {updated} row(s)")

        # ตรวจซ้ำอีกรอบ
        still_bad = (
            db.query(ShopTravelerStep.status)
              .filter(~ShopTravelerStep.status.in_(ALLOWED))
              .distinct()
              .all()
        )
        print("remaining invalid statuses:", still_bad)

if __name__ == "__main__":
    main()
