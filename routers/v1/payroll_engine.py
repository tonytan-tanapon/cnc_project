from datetime import datetime, timedelta
from collections import defaultdict


DEFAULT_OT_MULTIPLIER = 1.5


# -----------------------------
# Helpers
# -----------------------------

def parse_dt(v):
    if not v:
        return None
    if isinstance(v, datetime):
        return v
    return datetime.fromisoformat(v.replace("Z", "+00:00"))


def week_start(date, week_starts_on=1):
    """
    week_starts_on
    0 = Sunday
    1 = Monday
    """
    d = datetime.fromisoformat(date).date()
    day = d.weekday()  # Mon=0..Sun=6

    if week_starts_on == 0:
        day = (day + 1) % 7

    diff = (day - week_starts_on) % 7
    wk = d - timedelta(days=diff)
    return wk.isoformat()


# -----------------------------
# Break calculation
# -----------------------------

def calc_break_hours(breaks):
    total = 0

    if not breaks:
        return 0

    for br in breaks:
        s = parse_dt(br.get("start_at"))
        e = parse_dt(br.get("end_at"))

        if s and e:
            total += (e - s).total_seconds() / 3600

    return total


# -----------------------------
# Daily hours calculation
# -----------------------------

def calc_daily_hours(te):
    """
    Input:
        {
          "clock_in_at": "...",
          "clock_out_at": "...",
          "breaks": [...]
        }

    Output:
        dict with reg_hours / ot_hours
    """

    cin = parse_dt(te.get("clock_in_at"))
    cout = parse_dt(te.get("clock_out_at"))

    if not cin or not cout:
        total = 0
    else:
        break_hours = calc_break_hours(te.get("breaks", []))
        total = (cout - cin).total_seconds() / 3600 - break_hours

    reg = min(8, total)
    ot = max(0, total - 8)

    return {
        **te,
        "date": cin.date().isoformat() if cin else None,
        "total_hours": round(total, 4),
        "break_hours": round(calc_break_hours(te.get("breaks", [])), 4),
        "reg_hours": round(reg, 4),
        "ot_hours": round(ot, 4),
        "six_day_ot": False,
    }


# -----------------------------
# Six day rule
# -----------------------------

def apply_six_day_rule(rows, week_starts_on=1):
    weeks = defaultdict(list)

    for r in rows:
        wk = week_start(r["date"], week_starts_on)
        weeks[wk].append(r)

    for wk, days in weeks.items():

        worked = [d for d in days if d["total_hours"] > 0]

        if len(worked) >= 6:

            worked.sort(
                key=lambda x: (x["total_hours"], x["date"])
            )

            lowest = worked[0]

            lowest["ot_hours"] += lowest["reg_hours"]
            lowest["reg_hours"] = 0
            lowest["six_day_ot"] = True

    return rows


# -----------------------------
# Pay calculation
# -----------------------------

def apply_pay(rows, rate, ot_rate=None):

    if ot_rate is None:
        ot_rate = rate * DEFAULT_OT_MULTIPLIER

    for r in rows:

        pay_reg = r["reg_hours"] * rate
        pay_ot = r["ot_hours"] * ot_rate

        r["rate"] = rate
        r["ot_rate"] = ot_rate
        r["pay_reg"] = round(pay_reg, 2)
        r["pay_ot"] = round(pay_ot, 2)
        r["total_pay"] = round(pay_reg + pay_ot, 2)

    return rows


# -----------------------------
# Main engine
# -----------------------------

def calculate_timesheet(entries, rate=0, ot_rate=None):

    rows = [calc_daily_hours(e) for e in entries]

    rows = apply_six_day_rule(rows)

    if rate:
        rows = apply_pay(rows, rate, ot_rate)

    rows.sort(key=lambda x: x["date"] or "")

    return rows


# -----------------------------
# Totals
# -----------------------------

def calculate_totals(rows):

    total_reg = sum(r["reg_hours"] for r in rows)
    total_ot = sum(r["ot_hours"] for r in rows)

    total_pay_reg = sum(r.get("pay_reg", 0) for r in rows)
    total_pay_ot = sum(r.get("pay_ot", 0) for r in rows)

    return {
        "total_reg_hours": round(total_reg, 2),
        "total_ot_hours": round(total_ot, 2),
        "total_pay_reg": round(total_pay_reg, 2),
        "total_pay_ot": round(total_pay_ot, 2),
        "total_pay": round(total_pay_reg + total_pay_ot, 2),
    }