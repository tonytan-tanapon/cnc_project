from sqlalchemy import create_engine
from models import Base

DATABASE_URL = "postgresql+psycopg2://postgres:1234@100.88.56.126:5432/mydb"

engine = create_engine(DATABASE_URL)

# 🔥 สร้างทุก table จาก models
Base.metadata.create_all(engine)

print("✅ Tables created successfully")