let table = null;

// ==========================
// Load Tickets
// ==========================

async function loadTickets() {

    const res = await fetch(
        "/api/v1/tickets"
    );

    const rows = await res.json();

    if (!table) {

        table = new Tabulator(
            "#listBody",
            {
                layout: "fitColumns",

                height: "100%",

                editable: true,

                data: rows,

                columns: [

                    // {
                    //     title: "ID",
                    //     field: "id",
                    //     width: 80
                    // },

                    {
                        title: "Created",
                        field: "created_at",
                        width: 120,

                        formatter(cell) {

                            const v =
                                cell.getValue();

                            if (!v) {
                                return "";
                            }

                            const d =
                                new Date(v);

                            const mm =
                                String(
                                    d.getMonth() + 1
                                ).padStart(2, "0");

                            const dd =
                                String(
                                    d.getDate()
                                ).padStart(2, "0");

                            const yy =
                                String(
                                    d.getFullYear()
                                ).slice(-2);

                            return `${mm}/${dd}/${yy}`;
                        }
                    },

                    {
                        title: "Title",
                        field: "title",
                        minWidth: 250,
                        editor: "input"
                    },

                    // {
                    //     title: "Description",
                    //     field: "description",
                    //     widthGrow: 3,
                    //     editor: "textarea",
                    //     formatter: "textarea"
                    // },

                    // {
                    //     title: "Category",
                    //     field: "category",
                    //     width: 140,
                    //     editor: "list",
                    //     editorParams: {
                    //         values: [
                    //             "IT",
                    //             "Production",
                    //             "Quality",
                    //             "Inventory",
                    //             "Payroll"
                    //         ]
                    //     }
                    // },

                    // {
                    //     title: "Priority",
                    //     field: "priority",
                    //     width: 120,
                    //     editor: "list",
                    //     editorParams: {
                    //         values: [
                    //             "low",
                    //             "normal",
                    //             "high"
                    //         ]
                    //     }
                    // },

                    // {
                    //     title: "Status",
                    //     field: "status",
                    //     width: 140,
                    //     editor: "list",
                    //     editorParams: {
                    //         values: [
                    //             "open",
                    //             "in_progress",
                    //             "closed"
                    //         ]
                    //     }
                    // },

                    // {
                    //     title: "Employee",
                    //     field: "employee",
                    //     width: 180
                    // },


                    {
                        title: "",
                        width: 90,
                        hozAlign: "center",

                        formatter() {

                            return `
                                <button
                                    style="
                                        background:#dc2626;
                                        color:white;
                                        border:none;
                                        padding:4px 8px;
                                        cursor:pointer;
                                    "
                                >
                                    Del
                                </button>
                            `;
                        }
                        ,

                        cellClick(e, cell) {

                            const row =
                                cell.getRow()
                                    .getData();

                            deleteTicket(
                                row.id
                            );
                        }
                    }
                ]
            }
        );

        table.on(
            "cellClick",
            function (e, cell) {

                console.log(
                    "CLICK",
                    cell.getField()
                );

            }
        );

        table.on(
            "cellEdited",
            async function (cell) {

                console.log(
                    "EDIT"
                );

                const row =
                    cell.getRow()
                        .getData();

                console.log(
                    row
                );

                const res = await fetch(
                    `/api/v1/tickets/${row.id}`,
                    {
                        method: "PUT",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({

                            title:
                                row.title,

                            description:
                                row.description,

                            category:
                                row.category,

                            priority:
                                row.priority,

                            status:
                                row.status

                        })
                    }
                );

                console.log(
                    "STATUS",
                    res.status
                );

                if (!res.ok) {

                    alert(
                        "Cannot update ticket"
                    );
                }
            }
        );

    } else {

        table.setData(rows);

    }
}

// ==========================
// Save Ticket
// ==========================

async function saveTicket() {

    const payload = {

        title:
            document
                .getElementById(
                    "title"
                )
                .value
                .trim(),

        description: "",
        category: "IT",
        priority: "normal"
    };

    if (!payload.title) {

        alert(
            "Please enter title"
        );

        return;
    }

    const res = await fetch(
        "/api/v1/tickets",
        {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify(
                payload
            )
        }
    );

    if (!res.ok) {

        alert(
            "Cannot save ticket"
        );

        return;
    }

    document.getElementById(
        "title"
    ).value = "";

    // document.getElementById(
    //     "description"
    // ).value = "";

    // document.getElementById(
    //     "category"
    // ).value = "IT";

    // document.getElementById(
    //     "priority"
    // ).value = "normal";

    loadTickets();
}


async function deleteTicket(id) {

    if (
        !confirm(
            `Delete Ticket #${id} ?`
        )
    ) {
        return;
    }

    const res = await fetch(
        `/api/v1/tickets/${id}`,
        {
            method: "DELETE"
        }
    );

    if (!res.ok) {

        alert(
            "Cannot delete ticket"
        );

        return;
    }

    loadTickets();
}
// ==========================
// Search
// ==========================

document
    .getElementById("_q")
    .addEventListener(
        "input",
        e => {

            if (!table) {
                return;
            }

            table.setFilter(
                "title",
                "like",
                e.target.value
            );
        }
    );

// ==========================
// Save Button
// ==========================

document
    .getElementById(
        "saveTicketBtn"
    )
    .addEventListener(
        "click",
        saveTicket
    );

// ==========================
// Startup
// ==========================

loadTickets();