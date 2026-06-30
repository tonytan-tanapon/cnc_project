
def calculate_step_status(
    receive,
    accept,
    reject,
    is_material,
    input_mode=None,
    supplier_po=None,
    prev_step_code=None,
):

    total = accept + reject

    # ====================================
    # ⭐ MACHINE CUT / MATERIAL MODE
    # ====================================
    if input_mode == "machine_cut":

        # if supplier PO exists -> passed
        if supplier_po and str(supplier_po).strip():
            return "passed"

        return "pending"

    # ====================================
    # ⭐ AFTER M STEP
    # Example:
    # M1 -> 010
    # if 010 has any input -> passed
    # ====================================
    if (
        prev_step_code
        and str(prev_step_code).upper().startswith("M")
    ):

        if total > 0:
            return "passed"

        return "pending"

    # ====================================
    # ⭐ FIRST STEP
    # ====================================
    if is_material:

        if accept > 0:
            return "passed"

        if total == 0:
            return "pending"

        return "running"

    # ====================================
    # ⭐ NORMAL STEP
    # ====================================
    if receive == 0 and total == 0:
        return "pending"

    if total > 0 and total < receive:
        return "running"

    if receive > 0 and total >= receive:
        return "passed"

    return "pending"


# def calculate_step_status(
#     receive,
#     accept,
#     reject,
#     is_first,
#     input_mode=None,
#     supplier_po=None,
# ):

#     total = accept + reject

#     # ====================================
#     # ⭐ MACHINE CUT / MATERIAL MODE
#     # ====================================
#     if input_mode == "machine_cut":

#         # if PO exists -> passed
#         if supplier_po and str(supplier_po).strip():
#             return "passed"

#         return "pending"

#     # ====================================
#     # STEP 1
#     # ====================================
#     if is_first:

#         if accept > 0:
#             return "passed"

#         if total == 0:
#             return "pending"

#         return "running"

#     # ====================================
#     # NORMAL STEP
#     # ====================================
#     if receive == 0 and total == 0:
#         return "pending"

#     if total > 0 and total < receive:
#         return "running"

#     if receive > 0 and total >= receive:
#         return "passed"

#     return "pending"