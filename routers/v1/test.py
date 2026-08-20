from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Ticket

router = APIRouter(
    prefix="/test",
    tags=["test"]
)

@router.get("")
def get_tickets(
    db: Session = Depends(get_db)
):
    rows = (
        db.query(Ticket).all()
    )
    
    return [
        {
            "id": r.id,
            "title": r.title,
            "description": r.description,
            "category": r.category,
            "priority": r.priority,
            "status": r.status,
            "employee": (
                r.employee.name
                if r.employee else ""
            ),
            "created_at": r.created_at,
            "closed_at": r.closed_at
        }
        for r in rows
    ]