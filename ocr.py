import fitz

doc = fitz.open(r"C:\Users\TPSERVER\Desktop\02-1410 C 08-12-22.pdf")

page = doc.load_page(0)

pix = page.get_pixmap(matrix=fitz.Matrix(4,4))

pix.save(r"C:\Users\TPSERVER\Desktop\page.png")