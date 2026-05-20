DROP VIEW IF EXISTS vw_current_shop_traveler_status;

CREATE VIEW vw_current_shop_traveler_status AS

WITH log_summary AS (

    SELECT
        step_id,
        MAX(work_date) AS last_work_date,
        MAX(created_at) AS last_activity,

        COALESCE(SUM(qty_accept),0) AS total_accept,
        COALESCE(SUM(qty_reject),0) AS total_reject

    FROM shop_traveler_step_logs

    GROUP BY step_id
),

latest_log AS (

    SELECT DISTINCT ON (step_id)

        step_id,
        operator_id,
        machine_id,
        created_at

    FROM shop_traveler_step_logs

    ORDER BY
        step_id,
        created_at DESC
),

current_step AS (

    SELECT DISTINCT ON (traveler_id)

        id,
        traveler_id,
        seq,
        step_code,
        step_name,
        status

    FROM shop_traveler_steps

    ORDER BY

        traveler_id,

        CASE

            WHEN status = 'running' THEN 1
            WHEN status = 'pending' THEN 2
            WHEN status = 'passed' THEN 3
            ELSE 4

        END,

        seq
)

SELECT

    -- =====================================
    -- TRAVELER
    -- =====================================

    st.id AS traveler_id,
    st.traveler_no,
    st.status AS traveler_status,

    -- =====================================
    -- LOT
    -- =====================================

    pl.id AS lot_id,
    pl.lot_no,
    pl.status AS lot_status,
    pl.planned_qty,

    -- =====================================
    -- PART
    -- =====================================

    p.part_no,
    p.name AS part_name,
    pr.rev,

    -- =====================================
    -- CUSTOMER
    -- =====================================

    c.code AS customer_code,
    c.name AS customer_name,

    -- =====================================
    -- CURRENT
    -- =====================================

    cs.id AS current_step_id,
    cs.seq AS current_seq,

    cs.step_code AS current_op,
    cs.step_name AS current_operation,
    cs.status AS current_status,

    e.emp_code AS current_emp_code,
    e.nickname AS current_operator,

    m.code AS current_machine,
    m.name AS current_machine_name,

    CASE

        WHEN cs.seq = 1 THEN
            COALESCE(pl.planned_qty,0)

        ELSE
            COALESCE(prev_ls.total_accept,0)

    END AS current_receive,

    COALESCE(curr_ls.total_accept,0) AS current_accept,
    COALESCE(curr_ls.total_reject,0) AS current_reject,

    (

        CASE

            WHEN cs.seq = 1 THEN
                COALESCE(pl.planned_qty,0)

            ELSE
                COALESCE(prev_ls.total_accept,0)

        END

        -

        (

            COALESCE(curr_ls.total_accept,0)
            +
            COALESCE(curr_ls.total_reject,0)

        )

    ) AS current_remain,

    -- =====================================
    -- PREVIOUS
    -- =====================================

    prev_step.id AS previous_step_id,
    prev_step.seq AS previous_seq,

    prev_step.step_code AS previous_op,
    prev_step.step_name AS previous_operation,
    prev_step.status AS previous_status,

    prev_e.emp_code AS previous_emp_code,
    prev_e.nickname AS previous_operator,

    prev_m.code AS previous_machine,
    prev_m.name AS previous_machine_name,

    CASE

        WHEN prev_step.seq = 1 THEN
            COALESCE(pl.planned_qty,0)

        ELSE
            COALESCE(prev2_ls.total_accept,0)

    END AS previous_receive,

    COALESCE(prev_ls.total_accept,0) AS previous_accept,
    COALESCE(prev_ls.total_reject,0) AS previous_reject,

    (

        CASE

            WHEN prev_step.seq = 1 THEN
                COALESCE(pl.planned_qty,0)

            ELSE
                COALESCE(prev2_ls.total_accept,0)

        END

        -

        (

            COALESCE(prev_ls.total_accept,0)
            +
            COALESCE(prev_ls.total_reject,0)

        )

    ) AS previous_remain,

    -- =====================================
    -- PROGRESS
    -- =====================================

    ROUND(

        CASE

            WHEN

                (

                    CASE

                        WHEN cs.seq = 1 THEN
                            COALESCE(pl.planned_qty,0)

                        ELSE
                            COALESCE(prev_ls.total_accept,0)

                    END

                ) = 0

            THEN 0

            ELSE

                (

                    COALESCE(curr_ls.total_accept,0)::numeric

                    /

                    NULLIF(

                        CASE

                            WHEN cs.seq = 1 THEN
                                COALESCE(pl.planned_qty,0)

                            ELSE
                                COALESCE(prev_ls.total_accept,0)

                        END

                    ,0)

                ) * 100

        END

    ,2) AS progress_percent,

    -- =====================================
    -- STOPPED DAYS
    -- =====================================

    CASE

        WHEN curr_ls.last_work_date IS NULL
            THEN 999

        ELSE CURRENT_DATE - curr_ls.last_work_date

    END AS stopped_days,

    -- =====================================
    -- ACTIVITY
    -- =====================================

    curr_ls.last_work_date,
    curr_ls.last_activity

FROM shop_travelers st

LEFT JOIN production_lots pl
    ON st.lot_id = pl.id

LEFT JOIN parts p
    ON pl.part_id = p.id

LEFT JOIN part_revisions pr
    ON pl.part_revision_id = pr.id

LEFT JOIN purchase_orders po
    ON pl.po_id = po.id

LEFT JOIN customers c
    ON po.customer_id = c.id

-- =====================================
-- CURRENT STEP
-- =====================================

LEFT JOIN current_step cs
    ON cs.traveler_id = st.id

LEFT JOIN log_summary curr_ls
    ON curr_ls.step_id = cs.id

LEFT JOIN latest_log ll
    ON ll.step_id = cs.id

LEFT JOIN employees e
    ON ll.operator_id = e.id

LEFT JOIN machines m
    ON ll.machine_id = m.id

-- =====================================
-- PREVIOUS STEP
-- =====================================

LEFT JOIN shop_traveler_steps prev_step
    ON prev_step.traveler_id = cs.traveler_id
    AND prev_step.seq = cs.seq - 1

LEFT JOIN log_summary prev_ls
    ON prev_ls.step_id = prev_step.id

LEFT JOIN latest_log prev_ll
    ON prev_ll.step_id = prev_step.id

LEFT JOIN employees prev_e
    ON prev_ll.operator_id = prev_e.id

LEFT JOIN machines prev_m
    ON prev_ll.machine_id = prev_m.id

-- =====================================
-- PREVIOUS PREVIOUS STEP
-- =====================================

LEFT JOIN shop_traveler_steps prev2_step
    ON prev2_step.traveler_id = prev_step.traveler_id
    AND prev2_step.seq = prev_step.seq - 1

LEFT JOIN log_summary prev2_ls
    ON prev2_ls.step_id = prev2_step.id

-- =====================================
-- FILTER
-- =====================================

WHERE
    pl.status = 'in_process'
    AND st.status != 'done';