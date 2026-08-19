import { jfetch } from "/static/js/api.js";

const usernameEl = document.getElementById("username");
const passwordEl = document.getElementById("password");
const emailEl = document.getElementById("email");
const employeeIdEl = document.getElementById("employee_id");

const createBtn = document.getElementById("createBtn");
const messageEl = document.getElementById("message");


// ========================================================
// CHECK SUPER ADMIN
// ========================================================

async function checkAccess() {
    try {
        const user = await jfetch("/auth/me");

        if (!user.is_superuser) {
            alert("Super Admin access required");

            location.href = "/static/index.html";
            return false;
        }

        return true;

    } catch (err) {
        console.error(err);
        return false;
    }
}


// ========================================================
// CREATE USER
// ========================================================

async function createUser() {

    const username = usernameEl.value.trim();
    const password = passwordEl.value;
    const email = emailEl.value.trim();

    const employeeId =
        employeeIdEl.value
            ? Number(employeeIdEl.value)
            : null;


    // -------------------------
    // Validation
    // -------------------------

    if (!username) {
        messageEl.textContent = "Username is required";
        return;
    }

    if (!password) {
        messageEl.textContent = "Password is required";
        return;
    }

    if (password.length < 6) {
        messageEl.textContent =
            "Password must be at least 6 characters";
        return;
    }


    // -------------------------
    // API
    // -------------------------

    createBtn.disabled = true;
    messageEl.textContent = "Creating user...";

    try {

        const user = await jfetch("/users", {
            method: "POST",

            body: JSON.stringify({
                username: username,
                password: password,
                email: email || null,
                employee_id: employeeId,
            }),
        });

        messageEl.textContent =
            `User "${user.username}" created successfully`;

        // clear form
        usernameEl.value = "";
        passwordEl.value = "";
        emailEl.value = "";
        employeeIdEl.value = "";

        usernameEl.focus();

    } catch (err) {

        console.error(err);

        messageEl.textContent =
            err.message || "Unable to create user";

    } finally {

        createBtn.disabled = false;
    }
}


// ========================================================
// EVENTS
// ========================================================

createBtn.addEventListener(
    "click",
    createUser
);


// Enter → Create
document.addEventListener("keydown", (event) => {

    if (event.key === "Enter") {
        createUser();
    }

});


// ========================================================
// INIT
// ========================================================

await checkAccess();