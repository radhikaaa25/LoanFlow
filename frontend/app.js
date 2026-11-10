// ==========================================================================
// LoanFlow Microservices Platform — Live Connected Frontend Controller
// ==========================================================================

const API_BASE_URLS = {
    application: 'http://localhost:8081/api/v1',
    credit: 'http://localhost:8082/api/v1/credit',
    underwriting: 'http://localhost:8083/api/v1/underwriting',
    disbursement: 'http://localhost:8084/api/v1/disbursements',
    notification: 'http://localhost:8085/api/v1/notifications'
};

// Global State Storage
let isBackendOnline = false;
let authToken = localStorage.getItem("loanflow_jwt_token") || null;
let currentUser = (() => {
    try {
        return JSON.parse(localStorage.getItem("loanflow_user") || "null");
    } catch (e) {
        return null;
    }
})();

let applicationsState = [];
let notificationsState = [];
let adminStatusFilter = "ALL";
let globalSearchQuery = "";

// Helper delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

document.addEventListener("DOMContentLoaded", async () => {
    initAuthUI();
    initTabs();
    initAdminDashboardControls();
    initSearchControls();
    initLoanForm();
    initSagaVisualizer();
    initUnderwritingPortal();
    initIdempotencyEngine();

    // Apply role-based nav & landing tab immediately from cached session so there's zero UI flicker
    if (authToken && currentUser) {
        applyRolePermissions();
    }

    renderNotifications();
    updateKpiMetrics();

    await verifyExistingSession();

    // Check backend health immediately and load live data cleanly
    await checkServicesHealth();
    setInterval(checkServicesHealth, 6000);
});

/* ==========================================================================
   0. Health Check & Live Microservices Detection
   ========================================================================== */
async function checkServicesHealth() {
    const services = [
        {
            id: "pill-8081",
            url: `${API_BASE_URLS.application}/auth/me`,
            headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
        },
        { id: "pill-8082", url: `${API_BASE_URLS.credit}` },
        { id: "pill-8083", url: `${API_BASE_URLS.underwriting}` },
        { id: "pill-8084", url: `${API_BASE_URLS.disbursement}` },
        { id: "pill-8085", url: `${API_BASE_URLS.notification}` }
    ];

    let liveCount = 0;

    await Promise.all(services.map(async (svc) => {
        const pill = document.getElementById(svc.id);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            const res = await fetch(svc.url, {
                method: 'GET',
                headers: svc.headers || {},
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            // Any non-5xx HTTP response proves the Spring Boot server is online
            if (res.status >= 200 && res.status < 500) {
                if (pill) {
                    pill.classList.add("online");
                    pill.classList.remove("offline");
                }
                liveCount++;
                return;
            }
        } catch (e) {
            // Service not reachable
        }

        if (pill) {
            pill.classList.remove("online");
            pill.classList.add("offline");
        }
    }));

    const statusIndicator = document.getElementById("globalBackendStatus");
    const statusText = document.getElementById("backendStatusText");

    if (liveCount >= 3) {
        isBackendOnline = true;
        if (statusIndicator) {
            statusIndicator.classList.remove("offline");
            statusIndicator.classList.add("active");
        }
        if (statusText) {
            statusText.innerHTML = `Mesh: <strong style="color:var(--status-success-text)">Online (${liveCount}/5)</strong>`;
        }

        // Auto load live applications and notifications from DB only when authenticated
        if (authToken && currentUser) {
            await fetchAllApplications();
            await fetchNotifications();
        }
    } else {
        isBackendOnline = false;
        if (statusIndicator) {
            statusIndicator.classList.add("offline");
            statusIndicator.classList.remove("active");
        }
        if (statusText) {
            statusText.innerHTML = `Mesh: <strong style="color:var(--status-warning-text)">Offline (${liveCount}/5)</strong>`;
        }
    }
}

/* ==========================================================================
   1. Tab Navigation, Role Enforcement & Enterprise Breadcrumbs
   ========================================================================== */
const TAB_LABELS = {
    "admin-dashboard": "Admin Dashboard",
    apply: "Loan Origination",
    tracker: "Saga Orchestrator",
    underwriting: "Underwriter Portal",
    idempotency: "Disbursement Ledger",
    notifications: "Kafka Event Bus"
};

function getDefaultLandingTab() {
    return currentUser?.role === "ADMIN" ? "admin-dashboard" : "apply";
}

function activateTab(targetTab) {
    const role = currentUser?.role || "USER";
    let resolvedTab = targetTab;
    let targetBtn = document.querySelector(`.nav-btn[data-tab="${resolvedTab}"]`);

    // Enforce strict role guard on tab switching
    const requiredRole = targetBtn?.getAttribute("data-role");
    if (!targetBtn || (requiredRole && requiredRole !== role)) {
        resolvedTab = getDefaultLandingTab();
        targetBtn = document.querySelector(`.nav-btn[data-tab="${resolvedTab}"]`);
    }

    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));

    if (targetBtn) targetBtn.classList.add("active");
    const targetEl = document.getElementById(`tab-${resolvedTab}`);
    if (targetEl) targetEl.classList.add("active");

    const breadcrumbLabel = document.getElementById("activeBreadcrumbLabel");
    if (breadcrumbLabel && TAB_LABELS[resolvedTab]) {
        breadcrumbLabel.textContent = TAB_LABELS[resolvedTab];
    }

    if (resolvedTab === "admin-dashboard") {
        renderAdminDashboard();
    } else if (resolvedTab === "tracker") {
        updateSagaVisualizer();
    } else if (resolvedTab === "underwriting") {
        renderUnderwritingTable();
    } else if (resolvedTab === "notifications") {
        fetchNotifications();
    }
}

function initTabs() {
    const navButtons = document.querySelectorAll(".nav-btn");

    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTab = btn.getAttribute("data-tab");
            activateTab(targetTab);
        });
    });

    // Wire up "+ New Application" topbar button (USER only)
    document.getElementById("topbarNewAppBtn")?.addEventListener("click", () => {
        activateTab("apply");
    });

    // Wire up UUID key generation button
    document.getElementById("genUuidBtn")?.addEventListener("click", () => {
        const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase() + "-" + Date.now().toString().slice(-4);
        const input = document.getElementById("idemKeyInput");
        if (input) input.value = `IDEM-PAY-${randomPart}`;
    });
}

function initAdminDashboardControls() {
    document.getElementById("admJumpUnderwritingBtn")?.addEventListener("click", () => {
        activateTab("underwriting");
    });

    document.getElementById("adminRefreshBtn")?.addEventListener("click", async () => {
        const btn = document.getElementById("adminRefreshBtn");
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing...';
        await fetchAllApplications();
        if (btn) btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Refresh';
    });

    document.querySelectorAll("#adminStatusFilterPills .filter-pill-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#adminStatusFilterPills .filter-pill-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            adminStatusFilter = btn.getAttribute("data-filter") || "ALL";
            renderAdminDashboard();
        });
    });
}

function initSearchControls() {
    const searchInput = document.getElementById("globalSearchInput");
    if (!searchInput) return;

    searchInput.addEventListener("input", () => {
        globalSearchQuery = searchInput.value.trim().toLowerCase();
        renderAdminDashboard();
        renderUnderwritingTable();
    });

    document.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            searchInput.focus();
        }
    });
}

function updateKpiMetrics() {
    const totalVolume = applicationsState.reduce((sum, app) => sum + (Number(app.requestedAmount) || 0), 0);
    const activeCount = applicationsState.length;
    const approvedCount = applicationsState.filter(a => a.underwritingStatus === 'APPROVED' || a.status === 'DISBURSED').length;
    const approvalRate = activeCount > 0 ? Math.round((approvedCount / activeCount) * 100) : 0;
    const hasCircuitBreaker = applicationsState.some(a => a.isCircuitBreakerFallback === true);

    const volEl = document.getElementById("kpiTotalVolume");
    if (volEl) volEl.textContent = `$${totalVolume.toLocaleString()}`;

    const countEl = document.getElementById("kpiActiveCount");
    if (countEl) countEl.textContent = `${activeCount} Application${activeCount === 1 ? '' : 's'}`;

    const rateEl = document.getElementById("kpiApprovalRate");
    if (rateEl) rateEl.textContent = `${approvalRate}%`;

    const cbEl = document.getElementById("kpiCircuitBreaker");
    if (cbEl) {
        if (hasCircuitBreaker) {
            cbEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> OPEN / Fallback Active`;
            cbEl.style.color = "var(--status-warning-text)";
        } else {
            cbEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> CLOSED / Healthy`;
            cbEl.style.color = "var(--status-success-text)";
        }
    }
}

/* ==========================================================================
   2. Session Verification & Role-Based UI (USER vs ADMIN — auth in login.html)
   ========================================================================== */
function initAuthUI() {
    document.getElementById("logoutBtn")?.addEventListener("click", logoutUser);
    document.getElementById("topbarLogoutBtn")?.addEventListener("click", logoutUser);
}

function showAuthError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.add("visible");
}

function hideAuthError(el) {
    if (!el) return;
    el.textContent = "";
    el.classList.remove("visible");
}

async function verifyExistingSession() {
    if (!authToken) {
        window.location.replace("login.html");
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URLS.application}/auth/me`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
            const body = await res.json();
            if (body.data) {
                currentUser = {
                    applicantId: body.data.applicantId,
                    name: body.data.name,
                    email: body.data.email,
                    ssn: body.data.ssn,
                    monthlyIncome: body.data.monthlyIncome,
                    role: body.data.role
                };
                localStorage.setItem("loanflow_user", JSON.stringify(currentUser));
                applyRolePermissions();
                return;
            }
        }
    } catch (e) {
        // Backend offline — if we have cached user, allow offline UI preview
        if (currentUser) {
            applyRolePermissions();
            return;
        }
    }

    // Token invalid / expired / missing user in DB
    logoutUser();
}

function logoutUser() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem("loanflow_jwt_token");
    localStorage.removeItem("loanflow_user");
    window.location.replace("login.html");
}

function applyRolePermissions() {
    const role = currentUser?.role || "USER";
    const isAdmin = role === "ADMIN";

    // Strictly enforce visibility for ADMIN-only and USER-only UI items
    document.querySelectorAll('[data-role="ADMIN"]').forEach(el => {
        el.classList.toggle("hidden-by-role", !isAdmin);
    });
    document.querySelectorAll('[data-role="USER"]').forEach(el => {
        el.classList.toggle("hidden-by-role", isAdmin);
    });

    // Ensure initial load or account switch lands on the role's allowed home tab
    const activeTabBtn = document.querySelector(".nav-btn.active");
    const activeReqRole = activeTabBtn?.getAttribute("data-role");
    if (!activeTabBtn || (activeReqRole && activeReqRole !== role)) {
        activateTab(getDefaultLandingTab());
    }

    // Update sidebar user card dynamically
    const name = currentUser?.name || "User";
    const initials = name.split(" ").filter(Boolean).map(n => n[0]).join("").substring(0, 2).toUpperCase() || "--";
    const avatarEl = document.getElementById("sidebarUserAvatar");
    const nameEl = document.getElementById("sidebarUserName");
    const roleEl = document.getElementById("sidebarUserRole");
    const topbarBadge = document.getElementById("topbarRoleBadge");
    const kpiScopeEl = document.getElementById("kpiVolumeScope");

    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl) nameEl.textContent = name;
    if (roleEl) roleEl.textContent = isAdmin ? "Role: ADMIN" : "Role: USER (Applicant)";
    if (kpiScopeEl) kpiScopeEl.textContent = isAdmin ? "Platform-wide total" : "Your applications total";

    if (topbarBadge) {
        topbarBadge.textContent = role;
        topbarBadge.classList.remove("admin", "user");
        topbarBadge.classList.add(isAdmin ? "admin" : "user");
    }

    // Pre-fill applicant details on the Loan Origination form
    if (currentUser) {
        const nameInput = document.getElementById("applicantName");
        const emailInput = document.getElementById("applicantEmail");
        const ssnInput = document.getElementById("applicantSsn");
        const incomeInput = document.getElementById("monthlyIncome");
        const kycInput = document.getElementById("kycDocumentRef");

        if (nameInput && currentUser.name) nameInput.value = currentUser.name;
        if (emailInput && currentUser.email) {
            emailInput.value = currentUser.email;
            emailInput.readOnly = !isAdmin;
        }
        if (ssnInput && currentUser.ssn) ssnInput.value = currentUser.ssn;
        if (incomeInput && currentUser.monthlyIncome) incomeInput.value = currentUser.monthlyIncome;
        if (kycInput && currentUser.email) {
            const safeHandle = currentUser.email.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
            kycInput.value = `s3://loanflow-kyc/docs/kyc_${safeHandle}_2026.pdf`;
        }
    }
}

/* ==========================================================================
   3. Loan Application Submission (Real Saga Pipeline Execution)
   ========================================================================== */
function initLoanForm() {
    const form = document.getElementById("loanForm");
    const submitBtn = document.getElementById("submitAppBtn");
    const formErrorEl = document.getElementById("loanFormError");

    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        hideAuthError(formErrorEl);

        if (currentUser?.role === "ADMIN") {
            showAuthError(formErrorEl, "Admin accounts manage portfolio underwriting and monitoring. Sign in as a USER to submit borrower applications.");
            return;
        }

        const name = document.getElementById("applicantName").value.trim();
        const email = document.getElementById("applicantEmail").value.trim();
        const ssn = document.getElementById("applicantSsn").value.trim();
        const monthlyIncome = parseFloat(document.getElementById("monthlyIncome").value);
        const requestedAmount = parseFloat(document.getElementById("requestedAmount").value);
        const loanTermMonths = parseInt(document.getElementById("loanTerm").value, 10);
        const kycDocumentRef = document.getElementById("kycDocumentRef").value;

        if (!authToken) {
            window.location.replace("login.html");
            return;
        }

        if (!ssn || Number.isNaN(monthlyIncome) || monthlyIncome <= 0 || Number.isNaN(requestedAmount) || requestedAmount <= 0) {
            showAuthError(formErrorEl, "Please provide a valid SSN, positive monthly income, and requested loan amount.");
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Executing Microservices Pipeline...';

        resetStepperUI();

        try {
            // Step 1: Real Submission to application-service (:8081) using authenticated JWT
            await animateStep("step-submitted", 400);

            const appRes = await fetch(`${API_BASE_URLS.application}/applications`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    requestedAmount: requestedAmount,
                    loanTermMonths: loanTermMonths,
                    kycDocumentRef: kycDocumentRef,
                    ssn: ssn,
                    monthlyIncome: monthlyIncome
                })
            });

            if (appRes.status === 401) {
                logoutUser();
                return;
            }

            if (!appRes.ok) {
                const errBody = await appRes.json().catch(() => ({}));
                const details = errBody.fieldErrors ? Object.values(errBody.fieldErrors).join(", ") : "";
                throw new Error(details ? `${errBody.message}: ${details}` : (errBody.message || `application-service rejected submission (HTTP ${appRes.status})`));
            }

            const appPayload = (await appRes.json()).data;
            const newAppId = appPayload.id;

            // Persist latest applicant SSN & income in cached user state
            if (currentUser) {
                currentUser.ssn = ssn;
                currentUser.monthlyIncome = monthlyIncome;
                localStorage.setItem("loanflow_user", JSON.stringify(currentUser));
            }

            // Step 2: Poll Credit Scoring Service (:8082)
            await animateStep("step-credit", 450);
            for (let i = 0; i < 8; i++) {
                await sleep(500);
                try {
                    const crRes = await fetch(`${API_BASE_URLS.credit}/applications/${newAppId}`);
                    if (crRes.ok) {
                        const crData = await crRes.json();
                        if (crData.data && crData.data.creditScore) {
                            break;
                        }
                    }
                } catch (err) { }
            }

            // Step 3: Poll Underwriting Service (:8083)
            await animateStep("step-underwriting", 450);
            let uwDecision = null;
            for (let i = 0; i < 8; i++) {
                await sleep(500);
                try {
                    const uwRes = await fetch(`${API_BASE_URLS.underwriting}/applications/${newAppId}`);
                    if (uwRes.ok) {
                        const uwData = await uwRes.json();
                        if (uwData.data && uwData.data.status) {
                            uwDecision = uwData.data;
                            break;
                        }
                    }
                } catch (err) { }
            }

            // Step 4: Poll Disbursement Service (:8084) if approved
            if (uwDecision && uwDecision.status === 'APPROVED') {
                await animateStep("step-disbursement", 450);
                for (let i = 0; i < 8; i++) {
                    await sleep(500);
                    try {
                        const disbRes = await fetch(`${API_BASE_URLS.disbursement}/applications/${newAppId}`);
                        if (disbRes.ok) {
                            const disbData = await disbRes.json();
                            if (disbData.data && disbData.data.transactionRef) {
                                break;
                            }
                        }
                    } catch (err) { }
                }
            }

            // Step 5: Notification step
            await animateStep("step-notification", 350);

            // Reload live data from backend services
            await fetchAllApplications();
            await fetchNotifications();

            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Application &amp; Initiate Saga';

            // Focus newly created application in Saga Orchestrator
            const selector = document.getElementById("activeAppSelector");
            if (selector) selector.value = String(newAppId);
            activateTab("tracker");
            return;
        } catch (err) {
            console.error("Application submission failed:", err);
            resetStepperUI();
            showAuthError(formErrorEl, err.message || `Failed to submit application to backend (${name} / ${email}). Please verify services are running.`);
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Application &amp; Initiate Saga';
        }
    });
}

async function executeClientSimulation(name, email, ssn, monthlyIncome, requestedAmount, loanTermMonths) {
    const newAppId = 100 + applicationsState.length + 1;

    await animateStep("step-submitted", 600);
    let isFallback = ssn.endsWith("9999");
    let baseScore = isFallback ? 600 : 600 + Math.abs(ssn.split("").reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0) % 250);
    let dti = (requestedAmount * 0.05) / (monthlyIncome || 1);
    let computedScore = isFallback ? 600 : baseScore;
    if (!isFallback) {
        if (dti <= 0.20) computedScore = Math.min(850, computedScore + 70);
        else if (dti > 0.45) computedScore = Math.max(350, computedScore - 60);
    }
    let creditTier = isFallback ? "FAIR" : (computedScore >= 750 ? "EXCELLENT" : (computedScore >= 700 ? "GOOD" : (computedScore >= 600 ? "FAIR" : "POOR")));

    addNotification(newAppId, "EMAIL", "APPLICATION_SUBMITTED",
        `Dear ${name}, your loan application #${newAppId} for $${requestedAmount.toLocaleString()} has been submitted.`);

    await animateStep("step-credit", 700);
    if (isFallback) {
        addNotification(newAppId, "EMAIL", "CREDIT_SCORED",
            `⚠️ Resilience4j Circuit Breaker Activated: Bureau unavailable. Fallback score: 600 (FAIR).`);
    } else {
        addNotification(newAppId, "EMAIL", "CREDIT_SCORED",
            `Credit evaluation complete for Application #${newAppId}. Score: ${computedScore} (${creditTier}).`);
    }

    await animateStep("step-underwriting", 700);
    let uwStatus, interestRate, approvedAmt;
    if (computedScore >= 700) {
        uwStatus = "APPROVED";
        interestRate = computedScore >= 750 ? 5.5 : 7.5;
        approvedAmt = requestedAmount;
    } else if (computedScore < 550) {
        uwStatus = "REJECTED";
        interestRate = null;
        approvedAmt = 0;
    } else {
        uwStatus = "FLAGGED_FOR_MANUAL_REVIEW";
        interestRate = null;
        approvedAmt = null;
    }

    addNotification(newAppId, "EMAIL_AND_SMS", "UNDERWRITING_DECISION",
        `Underwriting Decision for Application #${newAppId}: ${uwStatus}.`);

    let disbStatus = "PENDING";
    let txnRef = null;
    let finalAppStatus = uwStatus;

    if (uwStatus === "APPROVED") {
        await animateStep("step-disbursement", 700);
        await animateStep("step-notification", 500);

        disbStatus = "SUCCESS";
        txnRef = "TXN-" + Math.random().toString(36).substring(2, 10).toUpperCase() + "-DEMO";
        finalAppStatus = "DISBURSED";

        addNotification(newAppId, "SMS", "DISBURSEMENT_COMPLETED",
            `SUCCESS! Funds of $${requestedAmount.toLocaleString()} disbursed. Txn: ${txnRef}`);
    }

    const appObj = {
        id: newAppId,
        applicantName: name,
        applicantEmail: email,
        ssn: ssn,
        monthlyIncome: monthlyIncome,
        requestedAmount: requestedAmount,
        loanTermMonths: loanTermMonths,
        status: finalAppStatus,
        createdAt: new Date().toISOString(),
        creditScore: computedScore,
        creditTier: creditTier,
        isCircuitBreakerFallback: isFallback,
        underwritingStatus: uwStatus,
        approvedAmount: approvedAmt,
        interestRate: interestRate,
        disbursementStatus: disbStatus,
        transactionRef: txnRef,
        idempotencyKey: `DISB-AUTO-APP-${newAppId}`,
        isLiveBackend: false
    };

    applicationsState.unshift(appObj);
    updateKpiMetrics();
    document.querySelector('[data-tab="tracker"]').click();
}

function resetStepperUI() {
    ["step-submitted", "step-credit", "step-underwriting", "step-disbursement", "step-notification"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove("completed", "active");
    });
}

function animateStep(stepId, delay) {
    return new Promise(resolve => {
        const el = document.getElementById(stepId);
        if (el) {
            el.classList.add("active");
            setTimeout(() => {
                el.classList.remove("active");
                el.classList.add("completed");
                resolve();
            }, delay);
        } else {
            resolve();
        }
    });
}

/* ==========================================================================
   4. Saga Pipeline Visualizer
   ========================================================================== */
function initSagaVisualizer() {
    const selector = document.getElementById("activeAppSelector");
    const refreshBtn = document.getElementById("refreshApplicationsBtn");

    selector.addEventListener("change", () => {
        updateSagaVisualizer();
    });

    refreshBtn.addEventListener("click", async () => {
        refreshBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing...';
        await fetchAllApplications();
        refreshBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Refresh Applications';
    });
}

async function fetchAllApplications() {
    if (!authToken || !currentUser) {
        updateSagaVisualizer();
        renderUnderwritingTable();
        renderAdminDashboard();
        return;
    }

    try {
        const isAdmin = currentUser.role === 'ADMIN';
        const endpoint = isAdmin
            ? `${API_BASE_URLS.application}/applications/all`
            : `${API_BASE_URLS.application}/applications/me`;

        const res = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (res.status === 401) {
            logoutUser();
            return;
        }

        if (res.ok) {
            const data = await res.json();
            if (data.data && Array.isArray(data.data)) {
                // Enrich all applications with data from the other services
                const enriched = await Promise.all(data.data.map(async (app) => {
                    let creditScore = null;
                    let creditTier = "PENDING";
                    let isFallback = false;
                    let uwStatus = "PENDING";
                    let approvedAmount = null;
                    let interestRate = null;
                    let disbStatus = "PENDING";
                    let txnRef = null;
                    let idemKey = null;

                    // Query Credit Service
                    try {
                        const cRes = await fetch(`${API_BASE_URLS.credit}/applications/${app.id}`);
                        if (cRes.ok) {
                            const cData = await cRes.json();
                            if (cData.data) {
                                creditScore = cData.data.creditScore;
                                creditTier = cData.data.creditTier;
                                isFallback = cData.data.isFallbackUsed;
                            }
                        }
                    } catch (e) { }

                    // Query Underwriting Service
                    try {
                        const uRes = await fetch(`${API_BASE_URLS.underwriting}/applications/${app.id}`);
                        if (uRes.ok) {
                            const uData = await uRes.json();
                            if (uData.data) {
                                uwStatus = uData.data.status;
                                approvedAmount = uData.data.approvedAmount;
                                interestRate = uData.data.interestRate;
                            }
                        }
                    } catch (e) { }

                    // Query Disbursement Service
                    try {
                        const dRes = await fetch(`${API_BASE_URLS.disbursement}/applications/${app.id}`);
                        if (dRes.ok) {
                            const dData = await dRes.json();
                            if (dData.data) {
                                disbStatus = dData.data.status;
                                txnRef = dData.data.transactionRef;
                                idemKey = dData.data.idempotencyKey;
                            }
                        }
                    } catch (e) { }

                    return {
                        id: app.id,
                        applicantId: app.applicantId,
                        applicantName: app.applicantName,
                        applicantEmail: app.applicantEmail,
                        ssn: app.ssn || "***-**-****",
                        monthlyIncome: app.monthlyIncome || 0,
                        requestedAmount: Number(app.requestedAmount) || 0,
                        loanTermMonths: app.loanTermMonths,
                        status: app.status,
                        createdAt: app.createdAt,
                        creditScore: creditScore,
                        creditTier: creditTier,
                        isCircuitBreakerFallback: isFallback,
                        underwritingStatus: uwStatus,
                        approvedAmount: approvedAmount,
                        interestRate: interestRate,
                        disbursementStatus: disbStatus,
                        transactionRef: txnRef,
                        idempotencyKey: idemKey,
                        isLiveBackend: true
                    };
                }));

                // Sort newest applications first
                applicationsState = enriched.sort((a, b) => b.id - a.id);
            }
        }
    } catch (err) {
        console.warn("Could not fetch live applications:", err);
    }

    updateSagaVisualizer();
    renderUnderwritingTable();
    renderAdminDashboard();
    updateKpiMetrics();
}

function updateSagaVisualizer() {
    const selector = document.getElementById("activeAppSelector");
    const visualizerGrid = document.getElementById("sagaVisualizerGrid");
    if (!selector || !visualizerGrid) return;

    if (applicationsState.length === 0) {
        selector.innerHTML = `<option value="">No loan applications yet</option>`;
        visualizerGrid.innerHTML = `<div style="grid-column: 1 / -1; padding: 28px; text-align:center; color:var(--text-tertiary);">No loan applications found for this account. Submit an application to watch the distributed Saga pipeline execute.</div>`;
        const jsonEl = document.getElementById("jsonPayloadDisplay");
        if (jsonEl) jsonEl.textContent = "Submit a loan application to inspect Kafka event payloads.";
        return;
    }

    const parsedVal = selector.value ? parseInt(selector.value, 10) : null;
    const currentVal = applicationsState.some(a => a.id === parsedVal) ? parsedVal : applicationsState[0].id;

    selector.innerHTML = applicationsState.map(app =>
        `<option value="${app.id}" ${app.id === currentVal ? 'selected' : ''}>
            Application #${app.id} — ${escapeHtml(app.applicantName)} ($${app.requestedAmount.toLocaleString()}) [${app.status}] ${app.isLiveBackend ? '🟢 LIVE' : '⚪ DEMO'}
        </option>`
    ).join("");

    const selectedAppId = parseInt(selector.value || applicationsState[0].id, 10);
    const app = applicationsState.find(a => a.id === selectedAppId) || applicationsState[0];

    visualizerGrid.innerHTML = `
        <!-- Node 1: Application Service -->
        <div class="saga-node-card success" onclick="inspectTopicPayload('loan-application-submitted', ${app.id})">
            <div class="node-header">
                <span class="node-title"><i class="fa-solid fa-file-signature"></i> Application Service</span>
                <span class="badge-status success">${escapeHtml(app.status || 'SUBMITTED')}</span>
            </div>
            <div class="node-body">
                <div><strong>App ID:</strong> #${app.id}</div>
                <div><strong>Applicant:</strong> ${escapeHtml(app.applicantName)}</div>
                <div><strong>Amount:</strong> $${app.requestedAmount.toLocaleString()}</div>
                <div class="hint">Topic: loan-application-submitted</div>
            </div>
        </div>

        <!-- Node 2: Credit Scoring -->
        <div class="saga-node-card ${app.isCircuitBreakerFallback ? 'warning' : (app.creditScore ? 'success' : 'warning')}" onclick="inspectTopicPayload('credit-scored', ${app.id})">
            <div class="node-header">
                <span class="node-title"><i class="fa-solid fa-gauge"></i> Credit Scoring</span>
                <span class="badge-status ${app.isCircuitBreakerFallback ? 'warning' : (app.creditScore ? 'success' : 'warning')}">
                    ${app.isCircuitBreakerFallback ? 'CIRCUIT OPEN' : (app.creditScore ? 'SCORED' : 'PENDING')}
                </span>
            </div>
            <div class="node-body">
                <div><strong>Score:</strong> ${app.creditScore !== null ? app.creditScore : 'Pending Kafka event'} (${escapeHtml(app.creditTier)})</div>
                <div><strong>Resilience4j:</strong> ${app.isCircuitBreakerFallback ? '⚡ Fallback Triggered' : 'Normal / Closed'}</div>
                <div class="hint">Topic: credit-scored</div>
            </div>
        </div>

        <!-- Node 3: Underwriting -->
        <div class="saga-node-card ${app.underwritingStatus === 'APPROVED' ? 'success' : (app.underwritingStatus === 'REJECTED' ? 'danger' : 'warning')}" onclick="inspectTopicPayload('underwriting-decided', ${app.id})">
            <div class="node-header">
                <span class="node-title"><i class="fa-solid fa-scale-balanced"></i> Underwriting</span>
                <span class="badge-status ${app.underwritingStatus === 'APPROVED' ? 'success' : (app.underwritingStatus === 'REJECTED' ? 'danger' : 'warning')}">
                    ${escapeHtml(app.underwritingStatus)}
                </span>
            </div>
            <div class="node-body">
                <div><strong>Approved:</strong> ${app.approvedAmount ? '$' + Number(app.approvedAmount).toLocaleString() : 'N/A'}</div>
                <div><strong>Rate:</strong> ${app.interestRate ? app.interestRate + '%' : 'N/A'}</div>
                <div class="hint">Topic: underwriting-decided</div>
            </div>
        </div>

        <!-- Node 4: Disbursement -->
        <div class="saga-node-card ${app.disbursementStatus === 'SUCCESS' ? 'success' : 'warning'}" onclick="inspectTopicPayload('disbursement-completed', ${app.id})">
            <div class="node-header">
                <span class="node-title"><i class="fa-solid fa-money-bill-transfer"></i> Disbursement</span>
                <span class="badge-status ${app.disbursementStatus === 'SUCCESS' ? 'success' : 'warning'}">
                    ${escapeHtml(app.disbursementStatus)}
                </span>
            </div>
            <div class="node-body">
                <div><strong>Txn Ref:</strong> ${escapeHtml(app.transactionRef || 'Pending Approval')}</div>
                <div><strong>Idempotency Key:</strong> ${escapeHtml(app.idempotencyKey || 'N/A')}</div>
                <div class="hint">Topic: disbursement-completed</div>
            </div>
        </div>
    `;

    // Default inspection: loan-application-submitted payload
    inspectTopicPayload('loan-application-submitted', app.id);
}

window.inspectTopicPayload = function (topic, appId) {
    const app = applicationsState.find(a => a.id === appId);
    if (!app) return;

    const resolvedApplicantId = app.applicantId || 1;
    document.getElementById("currentTopicTag").textContent = `Topic: ${topic} ${app.isLiveBackend ? '(from DB)' : '(demo)'}`;
    let payload = {};

    if (topic === 'loan-application-submitted') {
        payload = {
            applicationId: app.id,
            applicantId: resolvedApplicantId,
            applicantName: app.applicantName,
            applicantEmail: app.applicantEmail,
            ssn: app.ssn,
            monthlyIncome: app.monthlyIncome,
            requestedAmount: app.requestedAmount,
            loanTermMonths: app.loanTermMonths,
            timestamp: app.createdAt
        };
    } else if (topic === 'credit-scored') {
        payload = {
            applicationId: app.id,
            applicantId: resolvedApplicantId,
            creditScore: app.creditScore,
            creditTier: app.creditTier,
            debtToIncomeRatio: app.monthlyIncome > 0 ? Number(((app.requestedAmount * 0.05) / app.monthlyIncome).toFixed(2)) : null,
            isFallbackUsed: app.isCircuitBreakerFallback,
            timestamp: app.createdAt
        };
    } else if (topic === 'underwriting-decided') {
        payload = {
            applicationId: app.id,
            applicantId: resolvedApplicantId,
            status: app.underwritingStatus,
            approvedAmount: app.approvedAmount,
            interestRate: app.interestRate,
            decisionNotes: "Evaluated by LoanFlow Underwriting Service",
            timestamp: app.createdAt
        };
    } else if (topic === 'disbursement-completed') {
        payload = {
            disbursementId: 1,
            applicationId: app.id,
            applicantId: resolvedApplicantId,
            amount: app.approvedAmount || app.requestedAmount,
            bankAccountNumber: "ACCT-10000000" + app.id,
            transactionRef: app.transactionRef || "TXN-PENDING",
            idempotencyKey: app.idempotencyKey || "N/A",
            timestamp: app.createdAt
        };
    }

    document.getElementById("jsonPayloadDisplay").textContent = JSON.stringify(payload, null, 2);
};

/* ==========================================================================
   4B. Admin Landing Dashboard & Platform Analytics
   ========================================================================== */
function getStatusBadgeClass(status) {
    if (status === "DISBURSED" || status === "APPROVED") return "success";
    if (status === "REJECTED" || status === "FAILED" || status === "CREDIT_CHECK_FAILED") return "danger";
    return "warning";
}

function matchesSearchQuery(app) {
    if (!globalSearchQuery) return true;
    const haystack = [
        `#${app.id}`,
        app.id,
        app.applicantName,
        app.applicantEmail,
        app.status,
        app.underwritingStatus,
        app.creditTier
    ].join(" ").toLowerCase();
    return haystack.includes(globalSearchQuery);
}

function renderAdminDashboard() {
    if (currentUser?.role !== "ADMIN") return;

    const total = applicationsState.length;
    const disbursedApps = applicationsState.filter(a => a.status === "DISBURSED");
    const approvedOnlyApps = applicationsState.filter(a => a.status === "APPROVED" || (a.underwritingStatus === "APPROVED" && a.status !== "DISBURSED" && a.status !== "REJECTED"));
    const flaggedApps = applicationsState.filter(a => a.status === "FLAGGED_FOR_MANUAL_REVIEW" || a.underwritingStatus === "FLAGGED_FOR_MANUAL_REVIEW");
    const rejectedApps = applicationsState.filter(a => a.status === "REJECTED" || a.underwritingStatus === "REJECTED" || a.status === "FAILED" || a.status === "CREDIT_CHECK_FAILED");
    const inProgressApps = applicationsState.filter(a => !disbursedApps.includes(a) && !approvedOnlyApps.includes(a) && !flaggedApps.includes(a) && !rejectedApps.includes(a));

    const totalApprovedCount = disbursedApps.length + approvedOnlyApps.length;
    const totalRequested = applicationsState.reduce((sum, a) => sum + (Number(a.requestedAmount) || 0), 0);
    const disbursedVolume = disbursedApps.reduce((sum, a) => sum + (Number(a.approvedAmount) || Number(a.requestedAmount) || 0), 0);
    const avgLoan = total > 0 ? Math.round(totalRequested / total) : 0;
    const rejectionRate = total > 0 ? Math.round((rejectedApps.length / total) * 100) : 0;
    const fallbackCount = applicationsState.filter(a => a.isCircuitBreakerFallback).length;

    const scoredApps = applicationsState.filter(a => a.creditScore !== null && a.creditScore !== undefined);
    const avgScore = scoredApps.length > 0
        ? Math.round(scoredApps.reduce((sum, a) => sum + Number(a.creditScore), 0) / scoredApps.length)
        : null;

    // Populate top Admin stat cards
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl("admTotalApps", total);
    setEl("admAvgLoan", `$${avgLoan.toLocaleString()}`);
    setEl("admFallbackBadge", `${fallbackCount} Fallback${fallbackCount === 1 ? "" : "s"}`);
    setEl("admPendingApps", flaggedApps.length);
    setEl("admApprovedApps", totalApprovedCount);
    setEl("admDisbursedVol", `$${disbursedVolume.toLocaleString()}`);
    setEl("admRejectedApps", rejectedApps.length);
    setEl("admRejectionRate", `${rejectionRate}%`);
    setEl("admAvgScore", avgScore !== null ? avgScore : "--");

    // Pipeline Status Distribution Bar + Rows
    const pct = (count) => total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
    const barEl = document.getElementById("admPipelineBar");
    if (barEl) {
        barEl.innerHTML = total === 0
            ? `<div class="pipeline-segment pending" style="width:100%; opacity:0.25;"></div>`
            : `
                <div class="pipeline-segment disbursed" style="width:${pct(disbursedApps.length)}%" title="Disbursed: ${disbursedApps.length}"></div>
                <div class="pipeline-segment approved" style="width:${pct(approvedOnlyApps.length)}%" title="Approved: ${approvedOnlyApps.length}"></div>
                <div class="pipeline-segment flagged" style="width:${pct(flaggedApps.length)}%" title="Flagged Review: ${flaggedApps.length}"></div>
                <div class="pipeline-segment pending" style="width:${pct(inProgressApps.length)}%" title="In Progress: ${inProgressApps.length}"></div>
                <div class="pipeline-segment rejected" style="width:${pct(rejectedApps.length)}%" title="Rejected: ${rejectedApps.length}"></div>
            `;
    }

    const statusBreakdownEl = document.getElementById("admStatusBreakdown");
    if (statusBreakdownEl) {
        const statusRows = [
            { label: "Disbursed", count: disbursedApps.length, color: "var(--status-success)" },
            { label: "Approved (Settling)", count: approvedOnlyApps.length, color: "#3b82f6" },
            { label: "Manual Review Queue", count: flaggedApps.length, color: "var(--status-warning)" },
            { label: "In Progress / Scored", count: inProgressApps.length, color: "#64748b" },
            { label: "Rejected / Failed", count: rejectedApps.length, color: "var(--status-danger)" }
        ];
        statusBreakdownEl.innerHTML = statusRows.map(r => `
            <div class="analytics-row">
                <div class="analytics-label">
                    <span class="analytics-dot" style="background:${r.color};"></span>
                    <span>${r.label}</span>
                </div>
                <div class="analytics-bar-wrap">
                    <div class="analytics-bar-fill" style="width:${pct(r.count)}%; background:${r.color};"></div>
                </div>
                <div class="analytics-metric">${r.count} (${pct(r.count)}%)</div>
            </div>
        `).join("");
    }

    // Credit Tier Breakdown Rows
    const tierBreakdownEl = document.getElementById("admTierBreakdown");
    if (tierBreakdownEl) {
        const excellent = applicationsState.filter(a => a.creditTier === "EXCELLENT").length;
        const good = applicationsState.filter(a => a.creditTier === "GOOD").length;
        const fair = applicationsState.filter(a => a.creditTier === "FAIR").length;
        const poor = applicationsState.filter(a => a.creditTier === "POOR").length;
        const pendingTier = total - (excellent + good + fair + poor);

        const tierRows = [
            { label: "EXCELLENT (≥ 750)", count: excellent, color: "var(--status-success)" },
            { label: "GOOD (700 – 749)", count: good, color: "#3b82f6" },
            { label: "FAIR (550 – 699)", count: fair, color: "var(--status-warning)" },
            { label: "POOR (< 550)", count: poor, color: "var(--status-danger)" },
            { label: "Pending Score", count: pendingTier, color: "#64748b" }
        ];
        tierBreakdownEl.innerHTML = tierRows.map(r => `
            <div class="analytics-row">
                <div class="analytics-label">
                    <span class="analytics-dot" style="background:${r.color};"></span>
                    <span>${r.label}</span>
                </div>
                <div class="analytics-bar-wrap">
                    <div class="analytics-bar-fill" style="width:${pct(r.count)}%; background:${r.color};"></div>
                </div>
                <div class="analytics-metric">${r.count} (${pct(r.count)}%)</div>
            </div>
        `).join("");
    }

    // Filter Platform Applications Table
    const tbody = document.getElementById("adminAppsTableBody");
    if (!tbody) return;

    const filteredApps = applicationsState.filter(app => {
        if (!matchesSearchQuery(app)) return false;
        if (adminStatusFilter === "FLAGGED") {
            return app.status === "FLAGGED_FOR_MANUAL_REVIEW" || app.underwritingStatus === "FLAGGED_FOR_MANUAL_REVIEW";
        }
        if (adminStatusFilter === "APPROVED") {
            return app.status === "DISBURSED" || app.status === "APPROVED" || app.underwritingStatus === "APPROVED";
        }
        if (adminStatusFilter === "REJECTED") {
            return app.status === "REJECTED" || app.underwritingStatus === "REJECTED" || app.status === "FAILED" || app.status === "CREDIT_CHECK_FAILED";
        }
        return true;
    });

    if (filteredApps.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-tertiary);">No matching applications found for the selected filter.</td></tr>`;
        return;
    }

    tbody.innerHTML = filteredApps.map(app => {
        const needsReview = app.underwritingStatus === "FLAGGED_FOR_MANUAL_REVIEW" || app.status === "FLAGGED_FOR_MANUAL_REVIEW";
        const badgeClass = getStatusBadgeClass(app.status);
        return `
            <tr>
                <td><strong>#${app.id}</strong></td>
                <td>
                    <strong>${escapeHtml(app.applicantName)}</strong>
                    <span class="sub-meta-text">${escapeHtml(app.applicantEmail)}</span>
                </td>
                <td>
                    <strong>${app.creditScore !== null ? app.creditScore : 'Pending'}</strong>
                    <span class="sub-meta-text">${escapeHtml(app.creditTier)}${app.isCircuitBreakerFallback ? ' • CB Fallback' : ''}</span>
                </td>
                <td>
                    <strong>$${app.requestedAmount.toLocaleString()}</strong>
                    <span class="sub-meta-text">${app.approvedAmount ? 'Approved: $' + Number(app.approvedAmount).toLocaleString() : 'Not funded'}</span>
                </td>
                <td>${app.loanTermMonths} mo</td>
                <td><span class="badge-status ${badgeClass}">${escapeHtml(app.status)}</span></td>
                <td>
                    <div class="table-actions-cell">
                        ${needsReview ? `<button type="button" class="btn btn-primary btn-sm" onclick="adminJumpToAdjudicate(${app.id})"><i class="fa-solid fa-gavel"></i> Adjudicate</button>` : ''}
                        <button type="button" class="btn btn-secondary btn-sm" onclick="inspectAppSaga(${app.id})"><i class="fa-solid fa-diagram-project"></i> Saga</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

window.adminJumpToAdjudicate = function (appId) {
    if (currentUser?.role !== "ADMIN") return;
    activateTab("underwriting");
    window.openManualDecision(appId);
};

window.inspectAppSaga = function (appId) {
    activateTab("tracker");
    const selector = document.getElementById("activeAppSelector");
    if (selector) {
        selector.value = String(appId);
        updateSagaVisualizer();
    }
};

/* ==========================================================================
   5. Underwriter Manual Review Portal
   ========================================================================== */
function initUnderwritingPortal() {
    const form = document.getElementById("manualDecisionForm");
    const statusSelect = document.getElementById("decisionStatus");
    const amountInput = document.getElementById("decisionApprovedAmount");
    const rateInput = document.getElementById("decisionInterestRate");
    const errorBox = document.getElementById("underwritingDecisionError");

    statusSelect?.addEventListener("change", () => {
        const isRejected = statusSelect.value === "REJECTED";
        if (amountInput) amountInput.disabled = isRejected;
        if (rateInput) rateInput.disabled = isRejected;
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        hideAuthError(errorBox);

        if (currentUser?.role !== "ADMIN") {
            showAuthError(errorBox, "Access denied: only ADMIN users may submit underwriting decisions.");
            return;
        }

        const appId = parseInt(document.getElementById("modalAppId").value);
        const status = statusSelect.value;
        const approvedAmount = status === "REJECTED" ? null : parseFloat(amountInput.value);
        const interestRate = status === "REJECTED" ? null : parseFloat(rateInput.value);
        const notes = document.getElementById("decisionNotes").value;
        const underwriterId = currentUser?.applicantId ? Number(currentUser.applicantId) : 1;

        if (isBackendOnline) {
            try {
                const res = await fetch(`${API_BASE_URLS.underwriting}/decide`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
                    },
                    body: JSON.stringify({
                        applicationId: appId,
                        status: status,
                        approvedAmount: approvedAmount,
                        interestRate: interestRate,
                        decisionNotes: notes,
                        underwriterId: underwriterId
                    })
                });

                if (!res.ok) {
                    const errBody = await res.json().catch(() => ({}));
                    showAuthError(errorBox, errBody.message || `Failed to submit decision (HTTP ${res.status})`);
                    return;
                }

                // Wait briefly so Kafka UnderwritingDecidedEvent propagates to application-service
                await sleep(500);
                await fetchAllApplications();
                await fetchNotifications();
                document.getElementById("manualDecisionCard").style.display = "none";
                return;
            } catch (err) {
                showAuthError(errorBox, `Network error submitting decision: ${err.message}`);
                return;
            }
        }

        // Local fallback update (only when backend mesh is completely offline)
        const app = applicationsState.find(a => a.id === appId);
        if (app) {
            app.underwritingStatus = status;
            app.approvedAmount = approvedAmount;
            app.interestRate = interestRate;

            if (status === "APPROVED") {
                app.disbursementStatus = "SUCCESS";
                app.transactionRef = "TXN-MANUAL-" + Math.random().toString(36).substring(2, 8).toUpperCase();
                app.status = "DISBURSED";
                app.idempotencyKey = `DISB-MANUAL-APP-${appId}`;

                addNotification(appId, "SMS", "DISBURSEMENT_COMPLETED",
                    `SUCCESS! Manual Underwriter approved $${approvedAmount.toLocaleString()} at ${interestRate}%. Disbursed Txn: ${app.transactionRef}`);
            } else {
                app.status = "REJECTED";
                addNotification(appId, "EMAIL", "UNDERWRITING_DECISION",
                    `Underwriter Decision: Application #${appId} REJECTED. Notes: ${notes}`);
            }
        }

        document.getElementById("manualDecisionCard").style.display = "none";
        renderUnderwritingTable();
        updateKpiMetrics();
    });
}

function renderUnderwritingTable() {
    const tbody = document.getElementById("underwritingTableBody");
    if (!tbody) return;

    const visibleApps = applicationsState.filter(matchesSearchQuery);

    if (visibleApps.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-tertiary);">No loan applications available to review.</td></tr>`;
        updatePendingCount();
        return;
    }

    tbody.innerHTML = visibleApps.map(app => `
                        < tr >
            <td>#${app.id} ${app.isLiveBackend ? '<span class="badge-status success" style="font-size:0.65rem">LIVE</span>' : ''}</td>
            <td>${escapeHtml(app.applicantName)}</td>
            <td><strong>${app.creditScore !== null ? app.creditScore : 'Pending'}</strong> (${escapeHtml(app.creditTier)})</td>
            <td>$${(app.monthlyIncome || 0).toLocaleString()}</td>
            <td>$${app.requestedAmount.toLocaleString()}</td>
            <td><span class="badge-status ${app.underwritingStatus === 'APPROVED' ? 'success' : (app.underwritingStatus === 'REJECTED' ? 'danger' : 'warning')}">${escapeHtml(app.underwritingStatus)}</span></td>
            <td>
                ${app.underwritingStatus === 'FLAGGED_FOR_MANUAL_REVIEW' ?
            `<button type="button" class="btn btn-primary btn-sm" onclick="openManualDecision(${app.id})"><i class="fa-solid fa-gavel"></i> Adjudicate</button>` :
            `<span style="color:var(--text-tertiary); font-size:0.75rem;"><i class="fa-solid fa-circle-check"></i> Resolved</span>`}
            </td>
        </tr >
                        `).join("");

    updatePendingCount();
}

function updatePendingCount() {
    const pending = applicationsState.filter(a => a.underwritingStatus === 'FLAGGED_FOR_MANUAL_REVIEW').length;
    const badge = document.getElementById("pendingReviewCount");
    if (badge) badge.textContent = pending;
}

window.openManualDecision = function (appId) {
    if (currentUser?.role !== "ADMIN") return;
    const app = applicationsState.find(a => a.id === appId);
    if (!app) return;

    hideAuthError(document.getElementById("underwritingDecisionError"));
    const statusSelect = document.getElementById("decisionStatus");
    const amountInput = document.getElementById("decisionApprovedAmount");
    const rateInput = document.getElementById("decisionInterestRate");

    if (statusSelect) statusSelect.value = "APPROVED";
    if (amountInput) {
        amountInput.value = app.requestedAmount;
        amountInput.disabled = false;
    }
    if (rateInput) rateInput.disabled = false;

    document.getElementById("modalAppId").value = app.id;
    document.getElementById("decidingAppLabel").textContent = `Application #${app.id} — Applicant: ${app.applicantName}(Score: ${app.creditScore || 'N/A'})`;
    document.getElementById("manualDecisionCard").style.display = "block";
    document.getElementById("manualDecisionCard").scrollIntoView({ behavior: 'smooth' });
};

/* ==========================================================================
   6. Financial Idempotency Engine & Retry Simulator (Live HTTP calls)
   ========================================================================== */
function initIdempotencyEngine() {
    const form = document.getElementById("idempotencyForm");
    const retryBtn = document.getElementById("retryIdemBtn");

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        executeIdempotentTransfer(false);
    });

    retryBtn.addEventListener("click", () => {
        executeIdempotentTransfer(true);
    });
}

async function executeIdempotentTransfer(isRetryAction) {
    const key = document.getElementById("idemKeyInput").value.trim();
    const appId = parseInt(document.getElementById("idemAppId").value);
    const amount = parseFloat(document.getElementById("idemAmount").value);
    const account = document.getElementById("idemAccount").value;
    const consoleBox = document.getElementById("idemConsoleBox");
    const time = new Date().toLocaleTimeString();

    consoleBox.innerHTML += `
                    < div class= "console-line info" >
                    [${time}] ${isRetryAction ? '⚡ [SIMULATED RETRY]' : '🚀 [INITIAL REQUEST]'} HTTP POST < code > ${API_BASE_URLS.disbursement}</code > <br>
                        <strong>Header:</strong> [Idempotency-Key: "${key}"]<br>
                            <strong>Payload:</strong> {applicationId: ${appId}, amount: ${amount}, account: "${account}" }
                        </div>
                        `;

    try {
        const res = await fetch(`${API_BASE_URLS.disbursement}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': key
            },
            body: JSON.stringify({
                applicationId: appId,
                applicantId: 1,
                amount: amount,
                bankAccountNumber: account
            })
        });

        const data = await res.json();
        const isDuplicate = data.data && data.data.isDuplicateRequest;
        const txnRef = data.data ? data.data.transactionRef : "UNKNOWN";

        if (isDuplicate) {
            consoleBox.innerHTML += `
                <div class="console-line warning">
                    [${new Date().toLocaleTimeString()}] ⚠️ <strong>REAL DUPLICATE DETECTED BY BACKEND DATABASE!</strong>
                </div>
                <div class="console-line info">
                    [PostgreSQL/H2] Key "${key}" matched existing record in <code>idempotency_logs</code> table. No second fund transfer occurred.
                </div>
                <div class="console-line success">
                    [HTTP ${res.status} OK] Response: ${JSON.stringify(data.data, null, 2)}
                </div>
                <hr style="border-color: var(--border-color); margin: 8px 0;">
            `;
        } else {
            consoleBox.innerHTML += `
                <div class="console-line success">
                    [${new Date().toLocaleTimeString()}] ✅ <strong>FUNDS DISBURSED ON BACKEND (First Attempt)!</strong>
                </div>
                <div class="console-line info">
                    [Database] Created transaction <code>${txnRef}</code> in <code>disbursements</code> table and recorded key in <code>idempotency_logs</code>.
                </div>
                <div class="console-line success">
                    [HTTP ${res.status} OK] Response: ${JSON.stringify(data.data, null, 2)}
                </div>
                <hr style="border-color: var(--border-color); margin: 8px 0;">
            `;
        }
    } catch (err) {
        consoleBox.innerHTML += `
            <div class="console-line danger">
                [${new Date().toLocaleTimeString()}] ❌ Backend connection failed: ${err.message}. (Ensure <code>disbursement-service</code> is running on port 8084).
            </div>
            <hr style="border-color: var(--border-color); margin: 8px 0;">
        `;
    }

    consoleBox.scrollTop = consoleBox.scrollHeight;
}

/* ==========================================================================
   7. Notification Feed Component (Live from notification-service)
   ========================================================================== */
async function fetchNotifications() {
    if (!authToken || !currentUser) {
        renderNotifications();
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URLS.notification}`);
        if (res.ok) {
            const data = await res.json();
            if (data.data && Array.isArray(data.data)) {
                const isAdmin = currentUser.role === 'ADMIN';
                const ownAppIds = new Set(applicationsState.map(a => a.id));
                const filtered = isAdmin
                    ? data.data
                    : data.data.filter(n => ownAppIds.has(n.applicationId));

                // Reverse to get newest first
                notificationsState = filtered.slice().reverse().map(n => ({
                    id: n.id,
                    applicationId: n.applicationId,
                    channel: n.channel,
                    type: n.notificationType,
                    message: n.message,
                    timestamp: new Date(n.createdAt || Date.now()).toLocaleTimeString(),
                    topic: n.eventTopic
                }));
            }
        }
    } catch (e) { }

    renderNotifications();
}

function addNotification(appId, channel, type, message) {
    notificationsState.unshift({
        id: Date.now(),
        applicationId: appId,
        channel: channel,
        type: type,
        message: message,
        timestamp: new Date().toLocaleTimeString(),
        topic: type.toLowerCase()
    });
    renderNotifications();
}

function renderNotifications() {
    const stream = document.getElementById("notificationStream");
    if (!stream) return;

    if (notificationsState.length === 0) {
        stream.innerHTML = `<div style="padding:24px; text-align:center; color:var(--text-tertiary);">No notification events for your applications yet.</div>`;
        return;
    }

    stream.innerHTML = notificationsState.map(n => `
                        <div class="notification-card">
                            <div class="notification-icon">
                                <i class="${n.channel && n.channel.includes('SMS') ? 'fa-solid fa-comment-sms' : 'fa-solid fa-envelope'}"></i>
                            </div>
                            <div class="notification-content">
                                <h5>[${escapeHtml(n.channel)}] Notification — App #${n.applicationId}</h5>
                                <p>${escapeHtml(n.message)}</p>
                                <div class="notification-meta">Topic: <code>${escapeHtml(n.topic || 'loanflow-kafka')}</code> • ${escapeHtml(n.timestamp)}</div>
                            </div>
                        </div>
                        `).join("");
}

document.getElementById("clearNotificationsBtn")?.addEventListener("click", () => {
    notificationsState = [];
    renderNotifications();
});
