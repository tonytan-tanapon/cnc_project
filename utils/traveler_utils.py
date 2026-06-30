from datetime import date


def calculate_traveler_steps(sorted_steps):
    """
    Calculate receive/accept/reject/remain for traveler steps.

    Returns:
        [
            {
                "step": ShopTravelerStep,
                "receive": float,
                "accept": float,
                "reject": float,
                "remain": float,
                "latest_po": str | None,
                "prev_step_code": str | None,
                "is_material": bool,
            }
        ]
    """

    result = []

    m_accept_total = 0
    prev_accept = 0
    first_op_found = False

    for idx, step in enumerate(sorted_steps):

        logs = step.logs or []

        qty_accept = sum(
            float(l.qty_accept or 0)
            for l in logs
        )

        qty_reject = sum(
            float(l.qty_reject or 0)
            for l in logs
        )

        is_material = (
            str(step.step_code or "")
            .upper()
            .startswith("M")
        )

        # ===================================
        # RECEIVE
        # ===================================
        if is_material:

            receive = qty_accept + qty_reject
            m_accept_total += qty_accept

        elif not first_op_found:

            receive = m_accept_total
            first_op_found = True

        else:

            receive = prev_accept

        remain = receive - qty_accept - qty_reject

        # ===================================
        # Latest PO
        # ===================================
        latest_po = None

        if logs:

            latest_log = sorted(
                logs,
                key=lambda l: (
                    l.work_date or date.min,
                    l.id or 0
                )
            )[-1]

            latest_po = latest_log.supplier_po

        # ===================================
        # Previous Step Code
        # ===================================
        prev_step_code = None

        if idx > 0:
            prev_step_code = str(
                sorted_steps[idx - 1].step_code or ""
            ).upper()

        result.append({

            "step": step,

            "receive": receive,

            "accept": qty_accept,

            "reject": qty_reject,

            "remain": remain,

            "latest_po": latest_po,

            "prev_step_code": prev_step_code,

            "is_material": is_material,

        })

        # Operation เท่านั้นที่ส่ง Accept ไป Step ถัดไป
        if not is_material:
            prev_accept = qty_accept

    return result