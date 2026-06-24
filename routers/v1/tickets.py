# routers/v1/tickets.py

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Ticket

router = APIRouter(
    prefix="/tickets",
    tags=["tickets"]
)

@router.get("")
def get_tickets(
    db: Session = Depends(get_db)
):

    rows = (
        db.query(Ticket)
        .all()
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

from pydantic import BaseModel

class TicketCreate(BaseModel):
    emp_id: int | None = None
    title: str
    description: str | None = None
    category: str | None = None
    priority: str = "normal"

@router.post("")
def create_ticket(
    payload: TicketCreate,
    db: Session = Depends(get_db)
):

    row = Ticket(
        emp_id=payload.emp_id,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        priority=payload.priority,
        status="open"
    )

    db.add(row)
    db.commit()

    return {"ok": True}

from datetime import datetime, timezone

@router.put("/{ticket_id}/close")
def close_ticket(
    ticket_id: int,
    db: Session = Depends(get_db)
):

    row = db.get(Ticket, ticket_id)

    row.status = "closed"
    row.closed_at = datetime.now(timezone.utc)

    db.commit()

    return {"ok": True}


from pydantic import BaseModel

class TicketUpdate(BaseModel):

    title: str | None = None
    description: str | None = None
    category: str | None = None
    priority: str | None = None
    status: str | None = None


@router.put("/{ticket_id}")
def update_ticket(
    ticket_id: int,
    payload: TicketUpdate,
    db: Session = Depends(get_db)
):

    row = db.get(
        Ticket,
        ticket_id
    )

    if not row:
        return {
            "error": "not found"
        }

    if payload.title is not None:
        row.title = payload.title

    if payload.description is not None:
        row.description = payload.description

    if payload.category is not None:
        row.category = payload.category

    if payload.priority is not None:
        row.priority = payload.priority

    if payload.status is not None:
        row.status = payload.status

    db.commit()

    return {
        "ok": True
    }



@router.delete("/{ticket_id}")
def delete_ticket(
    ticket_id: int,
    db: Session = Depends(get_db)
):

    row = db.get(
        Ticket,
        ticket_id
    )

    if not row:
        return {
            "error": "not found"
        }

    db.delete(row)
    db.commit()

    return {
        "ok": True
    }