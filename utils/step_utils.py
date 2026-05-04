
def calculate_step_status(receive, accept, reject, is_first):
    total = accept + reject

    # Step 1 (no planned_qty)
    if is_first:
        if accept > 0:
            return "passed"   # ✅ FIX
        if total == 0:
            return "pending"
        return "running"

    # normal steps
    if receive == 0 and total == 0:
        return "pending"

    if total > 0 and total < receive:
        return "running"

    if receive > 0 and total == receive:
        return "passed"

    return "pending"