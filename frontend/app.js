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

let applicationsState = [
    {
        id: 101,
        applicantName: "Radhika Sharma",
        applicantEmail: "radhika@example.com",
        ssn: "123-45-6789",
        monthlyIncome: 8500,
        requestedAmount: 35000,
        loanTermMonths: 36,
        status: "DISBURSED",
        createdAt: new Date().toISOString(),
        creditScore: 760,
        creditTier: "EXCELLENT",
        isCircuitBreakerFallback: false,
        underwritingStatus: "APPROVED",
        approvedAmount: 35000,
        interestRate: 5.5,
        disbursementStatus: "SUCCESS",
        transactionRef: "TXN-8F92A14C-2026",
        idempotencyKey: "DISB-AUTO-APP-101",
        isLiveBackend: false
    },
    {
        id: 102,
        applicantName: "Aman Gupta",
        applicantEmail: "aman@example.com",
        ssn: "987-65-4321",
        monthlyIncome: 6000,
        requestedAmount: 20000,
        loanTermMonths: 24,
        status: "FLAGGED_FOR_MANUAL_REVIEW",
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        creditScore: 640,
        creditTier: "FAIR",
        isCircuitBreakerFallback: false,
        underwritingStatus: "FLAGGED_FOR_MANUAL_REVIEW",
        approvedAmount: null,
        interestRate: null,
        disbursementStatus: "PENDING",
        transactionRef: null,
        idempotencyKey: null,
        isLiveBackend: false
    }
];

let notificationsState = [
    {
        id: 1,
        applicationId: 101,
        channel: "SMS",
        type: "DISBURSEMENT_COMPLETED",
        message: "SUCCESS! Funds of $35,000 have been disbursed to bank account ACCT-1000000001 for Application #101. Txn Ref: TXN-8F92A14C-2026",
        timestamp: new Date().toLocaleTimeString(),
        topic: "disbursement-completed"
    },
    {
        id: 2,
        applicationId: 101,
        channel: "EMAIL_AND_SMS",
        type: "UNDERWRITING_DECISION",
        message: "Underwriting Decision for Application #101: Status is APPROVED. Notes: Auto-approved based on credit score (760)",
        timestamp: new Date(Date.now() - 60000).toLocaleTimeString(),
        topic: "underwriting-decided"
    },
    {
        id: 3,
        applicationId: 101,
        channel: "EMAIL",
        type: "CREDIT_SCORED",
        message: "Credit evaluation complete for Application #101. Calculated Credit Score: 760 (EXCELLENT).",
        timestamp: new Date(Date.now() - 120000).toLocaleTimeString(),
        topic: "credit-scored"
    },
    {
        id: 4,
        applicationId: 101,
        channel: "EMAIL",
        type: "APPLICATION_SUBMITTED",
        message: "Dear Radhika Sharma, your loan application #101 for $35,000 has been submitted successfully and is currently undergoing credit evaluation.",
        timestamp: new Date(Date.now() - 180000).toLocaleTimeString(),
        topic: "loan-application-submitted"
    }
];

// Helper delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initLoanForm();
    initSagaVisualizer();
    initUnderwritingPortal();
    initIdempotencyEngine();
    renderNotifications();
    updateKpiMetrics();

    // Check backend health immediately and periodically
    checkServicesHealth();
    setInterval(checkServicesHealth, 6000);
});

/* ==========================================================================
   0. Health Check & Live Microservices Detection
   ========================================================================== */
async function checkServicesHealth() {
    const services = [
        { id: "pill-8081", url: `${API_BASE_URLS.application}/applications/all` },
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
            const res = await fetch(svc.url, { method: 'GET', signal: controller.signal });
            clearTimeout(timeoutId);

            // Any HTTP response (even 404 or 401) proves the Spring Boot server is online
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

        // Auto load live applications and notifications from DB
        fetchAllApplications();
        fetchNotifications();
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
   1. Tab Navigation & Enterprise Breadcrumbs
   ========================================================================== */
function initTabs() {
    const navButtons = document.querySelectorAll(".nav-btn");
    const tabPages = document.querySelectorAll(".tab-page");
    const breadcrumbLabel = document.getElementById("activeBreadcrumbLabel");

    const tabLabels = {
        apply: "Loan Origination",
        tracker: "Saga Orchestrator",
        underwriting: "Underwriter Portal",
        idempotency: "Disbursement Ledger",
        notifications: "Kafka Event Bus"
    };

    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTab = btn.getAttribute("data-tab");

            navButtons.forEach(b => b.classList.remove("active"));
            tabPages.forEach(p => p.classList.remove("active"));

            btn.classList.add("active");
            const targetEl = document.getElementById(`tab-${targetTab}`);
            if (targetEl) targetEl.classList.add("active");

            if (breadcrumbLabel && tabLabels[targetTab]) {
                breadcrumbLabel.textContent = tabLabels[targetTab];
            }

            if (targetTab === "tracker") {
                updateSagaVisualizer();
            } else if (targetTab === "underwriting") {
                renderUnderwritingTable();
            } else if (targetTab === "notifications") {
                fetchNotifications();
            }
        });
    });

    // Wire up "+ New Application" topbar button
    document.getElementById("topbarNewAppBtn")?.addEventListener("click", () => {
        document.querySelector('[data-tab="apply"]')?.click();
    });

    // Wire up UUID key generation button
    document.getElementById("genUuidBtn")?.addEventListener("click", () => {
        const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase() + "-" + Date.now().toString().slice(-4);
        const input = document.getElementById("idemKeyInput");
        if (input) input.value = `IDEM-PAY-${randomPart}`;
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
   2. Authentication Helper (JWT for application-service)
   ========================================================================== */
async function getOrCreateAuthToken(name, email, ssn, monthlyIncome) {
    // 1. Try login first
    try {
        const loginRes = await fetch(`${API_BASE_URLS.application}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: 'Password123!' })
        });
        if (loginRes.ok) {
            const data = await loginRes.json();
            if (data.data && data.data.token) {
                authToken = data.data.token;
                localStorage.setItem("loanflow_jwt_token", authToken);
                return authToken;
            }
        }
    } catch (e) {
        // Will try registration next
    }

    // 2. Try registration
    try {
        const regRes = await fetch(`${API_BASE_URLS.application}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                email: email,
                password: 'Password123!',
                ssn: ssn,
                monthlyIncome: monthlyIncome
            })
        });
        if (regRes.ok) {
            const data = await regRes.json();
            if (data.data && data.data.token) {
                authToken = data.data.token;
                localStorage.setItem("loanflow_jwt_token", authToken);
                return authToken;
            }
        }
    } catch (e) {
        console.error("Auth register failed:", e);
    }

    return authToken;
}

/* ==========================================================================
   3. Loan Application Submission (Real Saga Pipeline Execution)
   ========================================================================== */
function initLoanForm() {
    const form = document.getElementById("loanForm");
    const submitBtn = document.getElementById("submitAppBtn");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const name = document.getElementById("applicantName").value.trim();
        const email = document.getElementById("applicantEmail").value.trim();
        const ssn = document.getElementById("applicantSsn").value.trim();
        const monthlyIncome = parseFloat(document.getElementById("monthlyIncome").value);
        const requestedAmount = parseFloat(document.getElementById("requestedAmount").value);
        const loanTermMonths = parseInt(document.getElementById("loanTerm").value);
        const kycDocumentRef = document.getElementById("kycDocumentRef").value;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Executing Microservices Pipeline...';

        resetStepperUI();

        if (isBackendOnline) {
            try {
                // Step 1: Real Auth Token
                const token = await getOrCreateAuthToken(name, email, ssn, monthlyIncome);

                // Step 2: Real Submission to application-service (:8081)
                await animateStep("step-submitted", 600);

                const appRes = await fetch(`${API_BASE_URLS.application}/applications`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        requestedAmount: requestedAmount,
                        loanTermMonths: loanTermMonths,
                        kycDocumentRef: kycDocumentRef,
                        ssn: ssn,
                        monthlyIncome: monthlyIncome
                    })
                });

                if (!appRes.ok) {
                    throw new Error(`application-service error (HTTP ${appRes.status})`);
                }

                const appPayload = (await appRes.json()).data;
                const newAppId = appPayload.id;

                // Step 3: Wait & Poll Credit Scoring Service (:8082)
                await animateStep("step-credit", 700);
                let creditReport = null;
                for (let i = 0; i < 6; i++) {
                    await sleep(600);
                    try {
                        const crRes = await fetch(`${API_BASE_URLS.credit}/applications/${newAppId}`);
                        if (crRes.ok) {
                            const crData = await crRes.json();
                            if (crData.data && crData.data.creditScore) {
                                creditReport = crData.data;
                                break;
                            }
                        }
                    } catch (e) {}
                }

                // Step 4: Wait & Poll Underwriting Service (:8083)
                await animateStep("step-underwriting", 700);
                let uwDecision = null;
                for (let i = 0; i < 6; i++) {
                    await sleep(600);
                    try {
                        const uwRes = await fetch(`${API_BASE_URLS.underwriting}/applications/${newAppId}`);
                        if (uwRes.ok) {
                            const uwData = await uwRes.json();
                            if (uwData.data && uwData.data.status) {
                                uwDecision = uwData.data;
                                break;
                            }
                        }
                    } catch (e) {}
                }

                // Step 5: Wait & Poll Disbursement Service (:8084) if approved
                let disbRecord = null;
                if (uwDecision && uwDecision.status === 'APPROVED') {
                    await animateStep("step-disbursement", 700);
                    for (let i = 0; i < 6; i++) {
                        await sleep(600);
                        try {
                            const disbRes = await fetch(`${API_BASE_URLS.disbursement}/applications/${newAppId}`);
                            if (disbRes.ok) {
                                const disbData = await disbRes.json();
                                if (disbData.data && disbData.data.transactionRef) {
                                    disbRecord = disbData.data;
                                    break;
                                }
                            }
                        } catch (e) {}
                    }
                }

                // Step 6: Step Notification
                await animateStep("step-notification", 500);

                // Reload all data from live backend
                await fetchAllApplications();
                await fetchNotifications();

                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Application & Initiate Saga';

                // Switch to Tracker view to inspect complete execution
                document.querySelector('[data-tab="tracker"]').click();
                return;
            } catch (err) {
                console.warn("Live backend call encountered an issue, falling back to local simulation:", err);
            }
        }

        // Fallback simulation if backend is offline
        executeClientSimulation(name, email, ssn, monthlyIncome, requestedAmount, loanTermMonths);
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Application & Initiate Saga';
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
    if (!isBackendOnline) {
        updateSagaVisualizer();
        renderUnderwritingTable();
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URLS.application}/applications/all`);
        if (res.ok) {
            const data = await res.json();
            if (data.data && Array.isArray(data.data) && data.data.length > 0) {
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
                    } catch (e) {}

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
                    } catch (e) {}

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
                    } catch (e) {}

                    return {
                        id: app.id,
                        applicantName: app.applicantName,
                        applicantEmail: app.applicantEmail,
                        ssn: app.ssn || "***-**-****",
                        monthlyIncome: app.monthlyIncome || 0,
                        requestedAmount: app.requestedAmount,
                        loanTermMonths: app.loanTermMonths,
                        status: disbStatus === "SUCCESS" ? "DISBURSED" : (uwStatus !== "PENDING" ? uwStatus : app.status),
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

                applicationsState = enriched;
            }
        }
    } catch (err) {
        console.warn("Could not fetch live applications:", err);
    }

    updateSagaVisualizer();
    renderUnderwritingTable();
    updateKpiMetrics();
}

function updateSagaVisualizer() {
    const selector = document.getElementById("activeAppSelector");
    if (applicationsState.length === 0) return;

    const currentVal = selector.value ? parseInt(selector.value) : applicationsState[0].id;
    selector.innerHTML = applicationsState.map(app => 
        `<option value="${app.id}" ${app.id === currentVal ? 'selected' : ''}>
            Application #${app.id} — ${app.applicantName} ($${app.requestedAmount.toLocaleString()}) [${app.status}] ${app.isLiveBackend ? '🟢 LIVE' : '⚪ DEMO'}
        </option>`
    ).join("");

    const selectedAppId = parseInt(selector.value || applicationsState[0].id);
    const app = applicationsState.find(a => a.id === selectedAppId) || applicationsState[0];

    const visualizerGrid = document.getElementById("sagaVisualizerGrid");

    visualizerGrid.innerHTML = `
        <!-- Node 1: Application Service -->
        <div class="saga-node-card success" onclick="inspectTopicPayload('loan-application-submitted', ${app.id})">
            <div class="node-header">
                <span class="node-title"><i class="fa-solid fa-file-signature"></i> Application Service</span>
                <span class="badge-status success">${app.status || 'SUBMITTED'}</span>
            </div>
            <div class="node-body">
                <div><strong>App ID:</strong> #${app.id}</div>
                <div><strong>Applicant:</strong> ${app.applicantName}</div>
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
                <div><strong>Score:</strong> ${app.creditScore !== null ? app.creditScore : 'Pending Kafka event'} (${app.creditTier})</div>
                <div><strong>Resilience4j:</strong> ${app.isCircuitBreakerFallback ? '⚡ Fallback Triggered' : 'Normal / Closed'}</div>
                <div class="hint">Topic: credit-scored</div>
            </div>
        </div>

        <!-- Node 3: Underwriting -->
        <div class="saga-node-card ${app.underwritingStatus === 'APPROVED' ? 'success' : (app.underwritingStatus === 'REJECTED' ? 'danger' : 'warning')}" onclick="inspectTopicPayload('underwriting-decided', ${app.id})">
            <div class="node-header">
                <span class="node-title"><i class="fa-solid fa-scale-balanced"></i> Underwriting</span>
                <span class="badge-status ${app.underwritingStatus === 'APPROVED' ? 'success' : (app.underwritingStatus === 'REJECTED' ? 'danger' : 'warning')}">
                    ${app.underwritingStatus}
                </span>
            </div>
            <div class="node-body">
                <div><strong>Approved:</strong> ${app.approvedAmount ? '$' + app.approvedAmount.toLocaleString() : 'N/A'}</div>
                <div><strong>Rate:</strong> ${app.interestRate ? app.interestRate + '%' : 'N/A'}</div>
                <div class="hint">Topic: underwriting-decided</div>
            </div>
        </div>

        <!-- Node 4: Disbursement -->
        <div class="saga-node-card ${app.disbursementStatus === 'SUCCESS' ? 'success' : 'warning'}" onclick="inspectTopicPayload('disbursement-completed', ${app.id})">
            <div class="node-header">
                <span class="node-title"><i class="fa-solid fa-money-bill-transfer"></i> Disbursement</span>
                <span class="badge-status ${app.disbursementStatus === 'SUCCESS' ? 'success' : 'warning'}">
                    ${app.disbursementStatus}
                </span>
            </div>
            <div class="node-body">
                <div><strong>Txn Ref:</strong> ${app.transactionRef || 'Pending Approval'}</div>
                <div><strong>Idempotency Key:</strong> ${app.idempotencyKey || 'N/A'}</div>
                <div class="hint">Topic: disbursement-completed</div>
            </div>
        </div>
    `;

    // Default inspection: loan-application-submitted payload
    inspectTopicPayload('loan-application-submitted', app.id);
}

window.inspectTopicPayload = function(topic, appId) {
    const app = applicationsState.find(a => a.id === appId);
    if (!app) return;

    document.getElementById("currentTopicTag").textContent = `Topic: ${topic} ${app.isLiveBackend ? '(from DB)' : '(demo)'}`;
    let payload = {};

    if (topic === 'loan-application-submitted') {
        payload = {
            applicationId: app.id,
            applicantId: 1,
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
            applicantId: 1,
            creditScore: app.creditScore,
            creditTier: app.creditTier,
            debtToIncomeRatio: 0.25,
            isFallbackUsed: app.isCircuitBreakerFallback,
            timestamp: app.createdAt
        };
    } else if (topic === 'underwriting-decided') {
        payload = {
            applicationId: app.id,
            applicantId: 1,
            status: app.underwritingStatus,
            approvedAmount: app.approvedAmount,
            interestRate: app.interestRate,
            decisionNotes: "Evaluated by LoanFlow Automated Decision Engine",
            timestamp: app.createdAt
        };
    } else if (topic === 'disbursement-completed') {
        payload = {
            disbursementId: 1,
            applicationId: app.id,
            applicantId: 1,
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
   5. Underwriter Manual Review Portal
   ========================================================================== */
function initUnderwritingPortal() {
    const form = document.getElementById("manualDecisionForm");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const appId = parseInt(document.getElementById("modalAppId").value);
        const status = document.getElementById("decisionStatus").value;
        const approvedAmount = parseFloat(document.getElementById("decisionApprovedAmount").value);
        const interestRate = parseFloat(document.getElementById("decisionInterestRate").value);
        const notes = document.getElementById("decisionNotes").value;

        if (isBackendOnline) {
            try {
                const res = await fetch(`${API_BASE_URLS.underwriting}/decide`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        applicationId: appId,
                        status: status,
                        approvedAmount: approvedAmount,
                        interestRate: interestRate,
                        decisionNotes: notes,
                        underwriterId: "UW-OFFICER-01"
                    })
                });

                if (res.ok) {
                    await fetchAllApplications();
                    await fetchNotifications();
                    document.getElementById("manualDecisionCard").style.display = "none";
                    return;
                }
            } catch (err) {
                console.warn("Underwriting decision failed to submit to live backend:", err);
            }
        }

        // Local fallback update
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

    tbody.innerHTML = applicationsState.map(app => `
        <tr>
            <td>#${app.id} ${app.isLiveBackend ? '<span class="badge-status success" style="font-size:0.65rem">LIVE</span>' : ''}</td>
            <td>${app.applicantName}</td>
            <td><strong>${app.creditScore !== null ? app.creditScore : 'Pending'}</strong> (${app.creditTier})</td>
            <td>$${(app.monthlyIncome || 0).toLocaleString()}</td>
            <td>$${app.requestedAmount.toLocaleString()}</td>
            <td><span class="badge-status ${app.underwritingStatus === 'APPROVED' ? 'success' : (app.underwritingStatus === 'REJECTED' ? 'danger' : 'warning')}">${app.underwritingStatus}</span></td>
            <td>
                ${app.underwritingStatus === 'FLAGGED_FOR_MANUAL_REVIEW' ? 
                    `<button class="btn btn-primary btn-sm" onclick="openManualDecision(${app.id})"><i class="fa-solid fa-gavel"></i> Adjudicate</button>` : 
                    `<span style="color:var(--text-tertiary); font-size:0.75rem;"><i class="fa-solid fa-circle-check"></i> Resolved</span>`}
            </td>
        </tr>
    `).join("");

    updatePendingCount();
}

function updatePendingCount() {
    const pending = applicationsState.filter(a => a.underwritingStatus === 'FLAGGED_FOR_MANUAL_REVIEW').length;
    const badge = document.getElementById("pendingReviewCount");
    if (badge) badge.textContent = pending;
}

window.openManualDecision = function(appId) {
    const app = applicationsState.find(a => a.id === appId);
    if (!app) return;

    document.getElementById("modalAppId").value = app.id;
    document.getElementById("decidingAppLabel").textContent = `Application #${app.id} — Applicant: ${app.applicantName} (Score: ${app.creditScore || 'N/A'})`;
    document.getElementById("decisionApprovedAmount").value = app.requestedAmount;
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
        <div class="console-line info">
            [${time}] ${isRetryAction ? '⚡ [SIMULATED RETRY]' : '🚀 [INITIAL REQUEST]'} HTTP POST <code>${API_BASE_URLS.disbursement}</code><br>
            <strong>Header:</strong> [Idempotency-Key: "${key}"]<br>
            <strong>Payload:</strong> { applicationId: ${appId}, amount: ${amount}, account: "${account}" }
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
    if (!isBackendOnline) {
        renderNotifications();
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URLS.notification}`);
        if (res.ok) {
            const data = await res.json();
            if (data.data && Array.isArray(data.data) && data.data.length > 0) {
                // Reverse to get newest first
                notificationsState = data.data.slice().reverse().map(n => ({
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
    } catch (e) {}

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

    stream.innerHTML = notificationsState.map(n => `
        <div class="notification-card">
            <div class="notification-icon">
                <i class="${n.channel.includes('SMS') ? 'fa-solid fa-comment-sms' : 'fa-solid fa-envelope'}"></i>
            </div>
            <div class="notification-content">
                <h5>[${n.channel}] Notification — App #${n.applicationId}</h5>
                <p>${n.message}</p>
                <div class="notification-meta">Topic: <code>${n.topic || 'loanflow-kafka'}</code> • ${n.timestamp}</div>
            </div>
        </div>
    `).join("");
}

document.getElementById("clearNotificationsBtn")?.addEventListener("click", () => {
    notificationsState = [];
    renderNotifications();
});
