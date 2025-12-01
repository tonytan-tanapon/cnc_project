from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import requests

app = FastAPI()

# ใส่ token ที่นายได้จาก LINE Console
CHANNEL_ACCESS_TOKEN = "QwkhmeW5/XhOlWWY4ZaXueRYo9NxvCoU9A7fO4XxFw4f5lBZdoODXaUdmYEH3htQi7zzG+EclPjqyQl9WdRSWP6YTNPONKhXPpc//vl76cbAefExvKXoSlP8AYfDCwfObIv+Vrg/x1SK93y59piIdAdB04t89/1O/w1cDnyilFU="
to_user = "U07753617368febe0b8a358f2caf23650"
def send_line_message(to_user: str, message: str):
    url = "https://api.line.me/v2/bot/message/push"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {CHANNEL_ACCESS_TOKEN}"
    }
    payload = {
        "to": to_user,
        "messages": [
            {"type": "text", "text": message}
        ]
    }
    r = requests.post(url, json=payload, headers=headers)
    print("LINE response:", r.text)

@app.post("/webhook")
async def webhook_receiver(request: Request):
    body = await request.body()
    print("📥 received:", body.decode())

    # ✅ ตัวอย่างส่งข้อความตอบกลับเข้า LINE user
    
    send_line_message(to_user, "🔥 Hello from webhook server!")

    return JSONResponse("OK", status_code=200)

@app.get("/")
def home():
    return {"message": "server running ✅"}