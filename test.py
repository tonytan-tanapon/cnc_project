
from datetime import datetime
import re
def next_code_yearly(width: int = 4, year: int | None = None) -> str:
    """
    Running แยกปี: PREFIX-YYYY-#### เช่น PO-2025-0001
    """
    y = (year or datetime.now().year) % 100  # ✅ เอาแค่สองหลักท้าย
    print(y)
    # base = f"{y}-"
    # pat = re.compile(rf"^{re.escape()}-{y}-(\d+)$")
    # max_n = 0
    
    # print( f"{base}{str(max_n+1).zfill(width)}")
    return ""
next_code_yearly()