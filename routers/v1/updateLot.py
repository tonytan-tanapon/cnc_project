# from fastapi import APIRouter, HTTPException
# from pydantic import BaseModel

# from database_import.import_excel_to_database import import_excel

# router = APIRouter(prefix="/updateLot", tags=["updateLot"])


# class ImportRequest(BaseModel):
#     file_path: str


# @router.post("/updatelot")
# def run_import(req: ImportRequest):
#     try:
#         import_excel(req.file_path)
#         return {"status": "success"}
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))
