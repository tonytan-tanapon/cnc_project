step:
    doc -> docx template -> json -> db -> docx real

Template:
    shop_teamplate.docx: 

File:

doc_to_docx_working.ps1
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
    