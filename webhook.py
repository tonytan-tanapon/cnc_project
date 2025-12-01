from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from datetime import datetime
import json
import os

app = FastAPI()

LOG_FILE = "webhook_logs.json"

# make sure log file exists
if not os.path.exists(LOG_FILE):
    with open(LOG_FILE, "w") as f:
        json.dump([], f)

@app.post("/webhook/{webhook_id}")
async def receive_webhook(webhook_id: str, request: Request):
    print("test")
    body = await request.body()
    
    log = {
        "timestamp": datetime.now().isoformat(),
        "webhook_id": webhook_id,
        "method": request.method,
        "body": body.decode(),
        "headers": dict(request.headers)
    }

    # save log
    with open(LOG_FILE, "r+") as f:
        logs = json.load(f)
        logs.append(log)
        f.seek(0)
        json.dump(logs, f, indent=2)

    print("📥 Received webhook:", log)
    return JSONResponse({"status": "OK"}, status_code=200)

@app.get("/logs")
def read_logs():
    with open(LOG_FILE, "r") as f:
        return json.load(f)
