from sqlalchemy.inspection import inspect

def sa_to_dict(obj):
    """แปลง SQLAlchemy object -> dict (เฉพาะคอลัมน์)"""
    if obj is None:
        return None
    mapper = inspect(obj.__class__)
    data = {}
    for col in mapper.columns:
        data[col.key] = getattr(obj, col.key)
    return data

def sa_update_from_dict(obj, data: dict, allow_fields=None):
    """อัปเดตค่าใน obj จาก dict (จำกัดฟิลด์ที่อนุญาตได้)"""
    if allow_fields is None:
        allow_fields = data.keys()
    for k in allow_fields:
        if k in data:
            setattr(obj, k, data[k])
    return obj
