





app = FastAPI()
# Hellofrom fastapi import FastAPI
print("test")
@app.get("/")
def read_root():
    return {"message": "Hello, FastAPI!"}