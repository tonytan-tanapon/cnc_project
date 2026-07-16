import fitz

doc = fitz.open(r"C:\Users\TPSERVER\Desktop\02-1410 C 08-12-22.pdf")

page = doc.load_page(0)

pix = page.get_pixmap(matrix=fitz.Matrix(4,4))

pix.save(r"C:\Users\TPSERVER\Desktop\page.png")

import cv2

img = cv2.imread(r"C:\Users\TPSERVER\Desktop\page.png")

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# ลด Noise
gray = cv2.GaussianBlur(gray, (5,5), 0)

circles = cv2.HoughCircles(
    gray,
    cv2.HOUGH_GRADIENT,
    dp=1.2,
    minDist=30,
    param1=80,
    param2=18,
    minRadius=8,
    maxRadius=30
)

if circles is None:
    raise Exception("No circles found")

circles = circles[0]

for c in circles:
    x,y,r = c

    cv2.circle(img,(int(x),int(y)),int(r),(0,255,0),2)
print("print")
cv2.imwrite(r"C:\Users\TPSERVER\Desktop\bubble.png",img)

import easyocr

reader = easyocr.Reader(['en'])

bubbles=[]

for c in circles:

    x,y,r = map(int,c)

    pad = 5

    roi = gray[
        max(0, y-r-pad):min(gray.shape[0], y+r+pad),
        max(0, x-r-pad):min(gray.shape[1], x+r+pad)
    ]

    text = reader.readtext(roi,detail=0)

    if text:

        bubbles.append({
            "bubble":text[0],
            "x":x,
            "y":y
        })

print(bubbles)

results = reader.readtext(r"C:\Users\TPSERVER\Desktop\page.png")

for r in results:
    print(r)

from math import hypot

inspection=[]

for b in bubbles:

    best=None
    dist=999999

    for item in results:

        box,text,conf=item

        cx=sum([p[0] for p in box])/4
        cy=sum([p[1] for p in box])/4

        d=hypot(cx-b["x"],cy-b["y"])

        if d<dist:
            dist=d
            best=text

    inspection.append({
        "bubble":b["bubble"],
        "dimension":best
    })

print(inspection)


import json

with open("inspection.json","w") as f:
    json.dump(
        inspection,
        f,
        indent=4
    )