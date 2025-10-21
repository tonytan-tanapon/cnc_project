# reset_password.py
from deps.auth import get_password_hash
from database import SessionLocal
from models import User

db = SessionLocal()

username = "tony"
new_pw = "1234"

user = db.query(User).filter(User.username == username).first()
if not user:
    print("❌ User not found")
else:
    user.password_hash = get_password_hash(new_pw)
    db.commit()
    print(f"✅ Password for '{username}' has been reset (bcrypt applied)")
