# from sqlalchemy import create_engine
# from sqlalchemy.orm import sessionmaker, declarative_base

# DATABASE_URL = "postgresql://postgres:1234@localhost:5432/mydb"

# engine = create_engine(DATABASE_URL)
# SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
# Base = declarative_base()
# database.py
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base, Session

# ระบุไดรเวอร์ให้ชัดเจน (แนะนำ)
# - psycopg2:  postgresql+psycopg2://user:pass@host:5432/db
# - psycopg v3: postgresql+psycopg://user:pass@host:5432/db
DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost:5432/mydb"
# DATABASE_URL = "postgresql+psycopg2://postgres:1234@100.88.56.126:5432/mydb"
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,   # ช่วยตัด connection ที่ตายแล้ว
    future=True,
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

Base = declarative_base()

def get_db() -> Generator[Session, None, None]:
    """Dependency สำหรับ FastAPI: เปิด session ต่อคำขอ แล้วปิดให้เสมอ"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
