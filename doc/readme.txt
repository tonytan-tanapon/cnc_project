In this process we  need to convert file.doc to file.docx to database. 

Step 1: 
    convert file.doc to doc.ps1 as a script 
    use generate.ps1 run in VS-code powershell using 
        powershell -ExecutionPolicy Bypass -File "C:\Users\TPSERVER\dev\cnc_project\doc\generate.ps1"
   
    # ================== CONFIG ==================
    $InputRoot   = "Z:\Topnotch Group\Public\AS9100\Shop Traveler\SHOP TRAVELER\"
    $OutputRoot  = "C:\docs\shop_travelers\output"     # mirror structure
    $OutputRoot2 = "C:\docs\shop_travelers\result"    # flat
    $ScriptRoot  = "C:\docs\shop_travelers\scripts"
    # ============================================

Step 2: 
    convert file.doc.ps1 to file.docx as a script 
    use generate.ps1 run in VS-code powershell using 
        powershell -ExecutionPolicy Bypass -File "C:\Users\TPSERVER\dev\cnc_project\doc\runall.ps1"
   
    # ================== CONFIG ==================
    $ScriptRoot = "C:\docs\shop_travelers\scripts""
    # ============================================

    the file will be created at $OutputRoot2 = "C:\docs\shop_travelers\result"    # flat

Step 3: 
    convert docx to db 
    use docx_to_db.py in vs-code cmd using
        python doc/docx_to_db.py

    path = Path(r"C:\docs\shop_travelers\result")





step:
    doc -> docx template -> json -> db -> docx real

Template:
    shop_teamplate.docx: 

File:

doc_to_docx_working.bat
   doc -> docx template 

   convert doc to docx
    
docx_to_db.py  
    docx template -> json -> db 

    import data in docx file to database
    step: convert docx to json then insert to table

jsontodoc.py
    json -> (db )-> docx real

    convert json to doc 
    when we habe json file, we can convert to docx 
    **Need to implement in prodcution again.


parse_st.py 
    convert doc to json
    