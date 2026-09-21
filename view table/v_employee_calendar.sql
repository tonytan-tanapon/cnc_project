CREATE OR REPLACE VIEW v_employee_calendar AS

WITH calendar AS (

    SELECT
        generate_series(
            (
                SELECT COALESCE(
                    MIN(clock_in_at)::date,
                    CURRENT_DATE - INTERVAL '30 day'
                )
                FROM time_entries
            ),
            CURRENT_DATE,
            interval '1 day'
        )::date AS work_date

),

first_last_work AS (

    SELECT

        COALESCE(payroll_emp_id, employee_id) AS payroll_emp_id,

        MIN(clock_in_at::date) AS first_work_date,

        MAX(clock_in_at::date) AS last_work_date

    FROM time_entries

    GROUP BY COALESCE(payroll_emp_id, employee_id)

)
SELECT

------------------------------------------------------------
-- Employee
------------------------------------------------------------
e.id AS employee_id,
COALESCE(e.payroll_emp_id, e.id) AS payroll_emp_id,

e.emp_code,
e.name,
e.lastname,

CONCAT(
    e.name,
    ' ',
    COALESCE(e.lastname,'')
) AS employee_name,

e.department,
e.position,

------------------------------------------------------------
-- Calendar
------------------------------------------------------------
c.work_date,

EXTRACT(YEAR FROM c.work_date)  AS work_year,

EXTRACT(MONTH FROM c.work_date) AS work_month,

EXTRACT(ISODOW FROM c.work_date) AS weekday_no,

TO_CHAR(c.work_date,'Dy') AS day_name,

(
    EXTRACT(ISODOW FROM c.work_date)
    BETWEEN 1 AND 5
) AS is_workday,

(
    EXTRACT(ISODOW FROM c.work_date)
    IN (6,7)
) AS is_weekend,

------------------------------------------------------------
-- Time Entry
------------------------------------------------------------
t.id AS time_entry_id,

t.clock_in_at,
t.clock_out_at,

t.break_hours,
t.work_hours,
t.regular_hours,
t.ot_hours,

------------------------------------------------------------
-- Leave
------------------------------------------------------------
l.leave_type,

COALESCE(
    l.leave_type,
    ''
) AS leave_status,

------------------------------------------------------------
-- Holiday
------------------------------------------------------------
h.id AS holiday_id,

h.name AS holiday_name,

------------------------------------------------------------
-- Attendance Status
------------------------------------------------------------
CASE
    WHEN h.id IS NOT NULL
        THEN 'Holiday'

    WHEN l.leave_type IS NOT NULL
        THEN l.leave_type

    WHEN c.work_date >= fl.first_work_date
         AND c.work_date <= LEAST(
                CURRENT_DATE,
                COALESCE(fl.last_work_date, CURRENT_DATE)
             )
         AND t.id IS NULL
         AND h.id IS NULL
         AND l.leave_type IS NULL
         AND EXTRACT(ISODOW FROM c.work_date) BETWEEN 1 AND 5
        THEN 'Absent'

    WHEN t.id IS NOT NULL
         AND t.work_hours < 8
        THEN 'Half Day'

    WHEN t.id IS NOT NULL
         AND t.work_hours >= 8
         AND t.clock_in_at::time > TIME '08:15'
        THEN 'Late'

    WHEN t.id IS NOT NULL
         AND EXTRACT(ISODOW FROM c.work_date) IN (6,7)
        THEN 'Weekend OT'

    WHEN EXTRACT(ISODOW FROM c.work_date) IN (6,7)
        THEN 'Weekend'

    ELSE 'Present'
END AS attendance_status,

------------------------------------------------------------
-- Attendance Code
------------------------------------------------------------
CASE
    WHEN h.id IS NOT NULL
        THEN 'H'

    WHEN LOWER(l.leave_type)='vacation'
        THEN 'V'

    WHEN LOWER(l.leave_type)='sick'
        THEN 'S'

    WHEN LOWER(l.leave_type)='holiday'
        THEN 'HL'

    WHEN l.leave_type IS NOT NULL
        THEN 'LV'

    WHEN c.work_date >= fl.first_work_date
         AND c.work_date <= LEAST(
                CURRENT_DATE,
                COALESCE(fl.last_work_date, CURRENT_DATE)
             )
         AND t.id IS NULL
         AND h.id IS NULL
         AND l.leave_type IS NULL
         AND EXTRACT(ISODOW FROM c.work_date) BETWEEN 1 AND 5
        THEN 'A'

    WHEN t.id IS NOT NULL
         AND t.work_hours < 8
        THEN 'HD'

    WHEN t.id IS NOT NULL
         AND t.work_hours >= 8
         AND t.clock_in_at::time > TIME '08:15'
        THEN 'L'

    WHEN t.id IS NOT NULL
         AND EXTRACT(ISODOW FROM c.work_date) IN (6,7)
        THEN 'WO'

    WHEN EXTRACT(ISODOW FROM c.work_date) IN (6,7)
        THEN 'W'

    ELSE 'P'
END AS attendance_code,

------------------------------------------------------------
-- Late Minutes
------------------------------------------------------------
CASE
    WHEN t.clock_in_at IS NULL
         OR t.work_hours < 8
    THEN 0

    ELSE
        GREATEST(
            EXTRACT(
                EPOCH FROM (
                    t.clock_in_at::time - TIME '08:15'
                )
            ) / 60,
            0
        )
END AS late_minutes,

------------------------------------------------------------
-- Flags
------------------------------------------------------------
(
    t.id IS NOT NULL
) AS has_time_entry,

(
    h.id IS NOT NULL
) AS is_holiday,

(
    l.leave_type IS NOT NULL
) AS is_leave,

(
    c.work_date >= fl.first_work_date
    AND c.work_date <= LEAST(
        CURRENT_DATE,
        COALESCE(fl.last_work_date, CURRENT_DATE)
    )

    AND t.id IS NULL
    AND h.id IS NULL
    AND l.leave_type IS NULL
    AND EXTRACT(ISODOW FROM c.work_date) BETWEEN 1 AND 5
) AS is_absent,

(
    t.id IS NOT NULL
    AND t.work_hours < 8
) AS is_half_day,

(
    t.id IS NOT NULL
    AND t.work_hours >= 8
    AND t.clock_in_at::time > TIME '08:15'
) AS is_late,

(
    t.id IS NOT NULL
    AND h.id IS NULL
    AND l.leave_type IS NULL
) AS is_present,

------------------------------------------------------------
-- Employment Dates
------------------------------------------------------------
fl.first_work_date,

fl.last_work_date

FROM employees e

CROSS JOIN calendar c

LEFT JOIN v_time_entry_summary t
       ON t.employee_id = e.id
      AND t.work_date = c.work_date

LEFT JOIN v_leave_summary l
       ON l.employee_id = e.id
      AND l.leave_date = c.work_date

LEFT JOIN holidays h
       ON h.holiday_date = c.work_date
      
LEFT JOIN first_last_work fl
       ON fl.payroll_emp_id = COALESCE(e.payroll_emp_id, e.id)

WHERE e.status = 'active';