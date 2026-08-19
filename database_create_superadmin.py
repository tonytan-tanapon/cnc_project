from database import SessionLocal
from models import User
from deps.auth import get_password_hash


def create_superadmin():
    db = SessionLocal()

    try:
        username = "superadmin"
        password = "1111"

        # เช็กว่ามีแล้วหรือยัง
        user = (
            db.query(User)
            .filter(User.username == username)
            .first()
        )

        if user:
            print(f"User '{username}' already exists")
            return

        user = User(
            username=username,
            password_hash=get_password_hash(password),
            is_active=True,
            is_superuser=True,
        )

        db.add(user)
        db.commit()
        db.refresh(user)

        print("================================")
        print("Super Admin created")
        print("Username:", username)
        print("================================")

    finally:
        db.close()


if __name__ == "__main__":
    create_superadmin()