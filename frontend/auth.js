// ==========================================================================
// LoanFlow Dedicated Authentication Controller (login.html)
// ==========================================================================

const AUTH_API_BASE = 'http://localhost:8081/api/v1/auth';

document.addEventListener("DOMContentLoaded", async () => {
    const existingToken = localStorage.getItem("loanflow_jwt_token");
    if (existingToken) {
        try {
            const res = await fetch(`${AUTH_API_BASE}/me`, {
                headers: { 'Authorization': `Bearer ${existingToken}` }
            });
            if (res.ok) {
                const body = await res.json();
                if (body.data) {
                    localStorage.setItem("loanflow_user", JSON.stringify(body.data));
                    window.location.replace("index.html");
                    return;
                }
            }
        } catch (e) {
            // Backend unreachable or token invalid — stay on login page
        }
        localStorage.removeItem("loanflow_jwt_token");
        localStorage.removeItem("loanflow_user");
    }

    initAuthTabsAndForms();
});

function initAuthTabsAndForms() {
    const tabLogin = document.getElementById("authTabLogin");
    const tabRegister = document.getElementById("authTabRegister");
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const loginError = document.getElementById("loginError");
    const registerError = document.getElementById("registerError");
    const userFields = document.getElementById("userApplicantFields");
    const ssnInput = document.getElementById("regSsn");
    const incomeInput = document.getElementById("regIncome");

    // Toggle SSN & Monthly Income fields based on selected role (USER vs ADMIN)
    function syncRoleFields() {
        const selectedRole = document.querySelector('input[name="regRole"]:checked')?.value || "USER";
        const isAdmin = selectedRole === "ADMIN";
        if (userFields) userFields.style.display = isAdmin ? "none" : "grid";
        if (ssnInput) ssnInput.required = !isAdmin;
        if (incomeInput) incomeInput.required = !isAdmin;
    }

    document.querySelectorAll('input[name="regRole"]').forEach(radio => {
        radio.addEventListener("change", syncRoleFields);
    });
    syncRoleFields();

    tabLogin?.addEventListener("click", () => {
        tabLogin.classList.add("active");
        tabRegister.classList.remove("active");
        loginForm.style.display = "flex";
        registerForm.style.display = "none";
        hideError(loginError);
    });

    tabRegister?.addEventListener("click", () => {
        tabRegister.classList.add("active");
        tabLogin.classList.remove("active");
        registerForm.style.display = "flex";
        loginForm.style.display = "none";
        hideError(registerError);
    });

    loginForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        hideError(loginError);

        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;
        const btn = document.getElementById("loginSubmitBtn");
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in...';

        try {
            const res = await fetch(`${AUTH_API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const body = await res.json();
            if (!res.ok || !body.data || !body.data.token) {
                throw new Error(body.message || "Invalid email or password");
            }
            saveSessionAndRedirect(body.data);
        } catch (err) {
            showError(loginError, err.message || "Login failed. Ensure application-service (:8081) is running.");
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In to LoanFlow';
        }
    });

    registerForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        hideError(registerError);

        const name = document.getElementById("regName").value.trim();
        const email = document.getElementById("regEmail").value.trim();
        const password = document.getElementById("regPassword").value;
        const role = document.querySelector('input[name="regRole"]:checked')?.value || "USER";
        const isAdmin = role === "ADMIN";
        const ssn = isAdmin ? null : (ssnInput?.value.trim() || null);
        const monthlyIncome = isAdmin ? null : parseFloat(incomeInput?.value);

        const btn = document.getElementById("registerSubmitBtn");
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating account...';

        try {
            const res = await fetch(`${AUTH_API_BASE}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password, ssn, monthlyIncome, role })
            });
            const body = await res.json();
            if (!res.ok || !body.data || !body.data.token) {
                const detail = body.fieldErrors ? Object.values(body.fieldErrors).join(", ") : "";
                throw new Error(detail ? `${body.message}: ${detail}` : (body.message || "Registration failed"));
            }
            saveSessionAndRedirect(body.data);
        } catch (err) {
            showError(registerError, err.message || "Registration failed. Ensure application-service (:8081) is running.");
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account &amp; Sign In';
        }
    });
}

function saveSessionAndRedirect(authData) {
    localStorage.setItem("loanflow_jwt_token", authData.token);
    localStorage.setItem("loanflow_user", JSON.stringify({
        applicantId: authData.applicantId,
        name: authData.name,
        email: authData.email,
        ssn: authData.ssn,
        monthlyIncome: authData.monthlyIncome,
        role: authData.role || "USER"
    }));
    window.location.replace("index.html");
}

function showError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.add("visible");
}

function hideError(el) {
    if (!el) return;
    el.textContent = "";
    el.classList.remove("visible");
}
