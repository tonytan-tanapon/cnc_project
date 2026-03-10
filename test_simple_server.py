from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def home():
    return {"message": "Server is working!"}

@app.get("/ping")
def ping():
    return {"status": "ok"}