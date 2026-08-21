// ==========================================================================
// LoanFlow Microservices Platform — Interactive Frontend Controller
// ==========================================================================

const API_BASE_URLS = {
    application: 'http://localhost:8081/api/v1',
    credit: 'http://localhost:8082/api/v1',
    underwriting: 'http://localhost:8083/api/v1',
    disbursement: 'http://localhost:8084/api/v1',
    notification: 'http://localhost:8085/api/v1'
};

// Global State Storage
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
        idempotencyKey: "DISB-AUTO-APP-101"
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
        idempotencyKey: null
    }
];

let notificationsState = [
    {
        id: 1,
        applicationId: 101,
        channel: "SMS",
        type: "DISBURSEMENT_COMPLETED",
        message: "SUCCESS! Funds of $35,000 have been disbursed to bank account ACCT-1000000001 for Application #101. Txn Ref: TXN-8F92A14C-2026",
        timestamp: new Date().toLocaleTimeString()
    },
    {
        id: 2,
        applicationId: 101,
        channel: "EMAIL_AND_SMS",
        type: "UNDERWRITING_DECISION",
        message: "Underwriting Decision for Application #101: Status is APPROVED. Notes: Auto-approved based on credit score (760)",
        timestamp: new Date(Date.now() - 60000).toLocaleTimeString()
    },
    {
        id: 3,
        applicationId: 101,
        channel: "EMAIL",
        type: "CREDIT_SCORED",
        message: "Credit evaluation complete for Application #101. Calculated Credit Score: 760 (EXCELLENT).",
        timestamp: new Date(Date.now() - 120000).toLocaleTimeString()
    },
    {
        id: 4,
        applicationId: 101,
        channel: "EMAIL",
        type: "APPLICATION_SUBMITTED",
        message: "Dear Radhika Sharma, your loan application #101 for $35,000 has been submitted successfully and is currently undergoing credit evaluation.",
        timestamp: new Date(Date.now() - 180000).toLocaleTimeString()
    }
];

document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initLoanForm();
    initSagaVisualizer();
    initUnderwritingPortal();
    initIdempotencyEngine();
    renderNotifications();
});

/* ==========================================================================
   1. Tab Navigation
   ========================================================================== */
function initTabs() {
    const navButtons = document.querySelectorAll(".nav-btn");
    const tabPages = document.querySelectorAll(".tab-page");

    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTab = btn.getAttribute("data-tab");

            navButtons.forEach(b => b.classList.remove("active"));
            tabPages.forEach(p => p.classList.remove("active"));

            btn.classList.add("active");
            document.getElementById(`tab-${targetTab}`).classList.add("active");

            if (targetTab === "tracker") {
                updateSagaVisualizer();
            } else if (targetTab === "underwriting") {
                renderUnderwritingTable();
            }
        });
    });
}

/* ==========================================================================
   2. Loan Application Submission (Saga Pipeline Execution)
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

        const newAppId = 100 + applicationsState.length + 1;

        // Reset Stepper Animations
        resetStepperUI();

        // --- STAGE 1: Application Service ---
        await animateStep("step-submitted", 600);
        
        let isFallback = ssn.endsWith("9999");
        let computedScore = isFallback ? 600 : Math.min(850, Math.max(500, 600 + (ssn.length * 15) % 250));
        let creditTier = isFallback ? "FAIR" : (computedScore >= 750 ? "EXCELLENT" : (computedScore >= 700 ? "GOOD" : (computedScore >= 600 ? "FAIR" : "POOR")));

        addNotification(newAppId, "EMAIL", "APPLICATION_SUBMITTED", 
            `Dear ${name}, your loan application #${newAppId} for $${requestedAmount.toLocaleString()} has been submitted successfully.`);

        // --- STAGE 2: Credit Scoring Service ---
        await animateStep("step-credit", 700);

        if (isFallback) {
            addNotification(newAppId, "EMAIL", "CREDIT_SCORED", 
                `⚠️ Resilience4j Circuit Breaker Activated: Bureau unavailable. Assigned conservative fallback score: 600 (FAIR).`);
        } else {
            addNotification(newAppId, "EMAIL", "CREDIT_SCORED", 
                `Credit evaluation complete for Application #${newAppId}. Score: ${computedScore} (${creditTier}).`);
        }

        // --- STAGE 3: Underwriting Service ---
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

        // --- STAGE 4 & 5: Disbursement & Notification (If Approved) ---
        let disbStatus = "PENDING";
        let txnRef = null;
        let finalAppStatus = uwStatus;

        if (uwStatus === "APPROVED") {
            await animateStep("step-disbursement", 700);
            await animateStep("step-notification", 500);

            disbStatus = "SUCCESS";
            txnRef = "TXN-" + Math.random().toString(36).substring(2, 10).toUpperCase() + "-2026";
            finalAppStatus = "DISBURSED";

            addNotification(newAppId, "SMS", "DISBURSEMENT_COMPLETED", 
                `SUCCESS! Funds of $${requestedAmount.toLocaleString()} disbursed to bank account ACCT-10000000${newAppId}. Txn: ${txnRef}`);
        }

        // Add to Global State
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
            idempotencyKey: `DISB-AUTO-APP-${newAppId}`
        };

        applicationsState.unshift(appObj);

        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Submit Application & Start Saga';

        // Switch to Tracker view to inspect complete execution
        document.querySelector('[data-tab="tracker"]').click();
    });
}

function resetStepperUI() {
    ["step-submitted", "step-credit", "step-underwriting", "step-disbursement", "step-notification"].forEach(id => {
        const el = document.getElementById(id);
        el.classList.remove("completed", "active");
    });
}

function animateStep(stepId, delay) {
    return new Promise(resolve => {
        const el = document.getElementById(stepId);
        el.classList.add("active");
        setTimeout(() => {
            el.classList.remove("active");
            el.classList.add("completed");
            resolve();
        }, delay);
    });
}

/* ==========================================================================
   3. Saga Pipeline Visualizer
   ========================================================================== */
function initSagaVisualizer() {
    const selector = document.getElementById("activeAppSelector");
    const refreshBtn = document.getElementById("refreshApplicationsBtn");

    selector.addEventListener("change", () => {
        updateSagaVisualizer();
    });

    refreshBtn.addEventListener("click", () => {
        updateSagaVisualizer();
    });
}

function updateSagaVisualizer() {
    const selector = document.getElementById("activeAppSelector");
    selector.innerHTML = applicationsState.map(app => 
        `<option value="${app.id}">Application #${app.id} — ${app.applicantName} ($${app.requestedAmount.toLocaleString()}) [${app.status}]</option>`
    ).join("");

    if (applicationsState.length === 0) return;

    const selectedAppId = parseInt(selector.value || applicationsState[0].id);
    const app = applicationsState.find(a => a.id === selectedAppId) || applicationsState[0];

    const visualizerGrid = document.getElementById("sagaVisualizerGrid");
    const jsonDisplay = document.getElementById("jsonPayloadDisplay");
    const topicTag = document.getElementById("currentTopicTag");

    visualizerGrid.innerHTML = `
        <!-- Node 1: Application Service -->
        <div class="saga-node-card success" onclick="inspectTopicPayload('loan-application-submitted', ${app.id})">
            <div class="node-header">
                <span class="node-title"><i class="fa-solid fa-file-signature"></i> Application Service</span>
                <span class="badge-status success">SUBMITTED</span>
            </div>
            <div class="node-body">
                <div><strong>App ID:</strong> #${app.id}</div>
                <div><strong>Applicant:</strong> ${app.applicantName}</div>
                <div><strong>Amount:</strong> $${app.requestedAmount.toLocaleString()}</div>
                <div class="hint">Topic: loan-application-submitted</div>
            </div>
        </div>

        <!-- Node 2: Credit Scoring -->
        <div class="saga-node-card ${app.isCircuitBreakerFallback ? 'warning' : 'success'}" onclick="inspectTopicPayload('credit-scored', ${app.id})">
            <div class="node-header">
                <span class="node-title"><i class="fa-solid fa-gauge"></i> Credit Scoring</span>
                <span class="badge-status ${app.isCircuitBreakerFallback ? 'warning' : 'success'}">
                    ${app.isCircuitBreakerFallback ? 'FALLBACK' : 'COMPLETED'}
                </span>
            </div>
            <div class="node-body">
                <div><strong>Score:</strong> ${app.creditScore} (${app.creditTier})</div>
                <div><strong>Circuit Breaker:</strong> ${app.isCircuitBreakerFallback ? '⚡ TRIGGERED' : 'CLOSED (Normal)'}</div>
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

    document.getElementById("currentTopicTag").textContent = `Topic: ${topic}`;
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
            amount: app.requestedAmount,
            bankAccountNumber: "ACCT-10000000" + app.id,
            transactionRef: app.transactionRef || "TXN-PENDING",
            idempotencyKey: app.idempotencyKey || "N/A",
            timestamp: app.createdAt
        };
    }

    document.getElementById("jsonPayloadDisplay").textContent = JSON.stringify(payload, null, 2);
};

/* ==========================================================================
   4. Underwriter Manual Review Portal
   ========================================================================== */
function initUnderwritingPortal() {
    const form = document.getElementById("manualDecisionForm");

    form.addEventListener("submit", (e) => {
        e.preventDefault();

        const appId = parseInt(document.getElementById("modalAppId").value);
        const status = document.getElementById("decisionStatus").value;
        const approvedAmount = parseFloat(document.getElementById("decisionApprovedAmount").value);
        const interestRate = parseFloat(document.getElementById("decisionInterestRate").value);
        const notes = document.getElementById("decisionNotes").value;

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
        updatePendingCount();
    });
}

function renderUnderwritingTable() {
    const tbody = document.getElementById("underwritingTableBody");
    tbody.innerHTML = applicationsState.map(app => `
        <tr>
            <td>#${app.id}</td>
            <td>${app.applicantName}</td>
            <td><strong>${app.creditScore}</strong> (${app.creditTier})</td>
            <td>$${app.monthlyIncome.toLocaleString()}</td>
            <td>$${app.requestedAmount.toLocaleString()}</td>
            <td><span class="badge-status ${app.underwritingStatus === 'APPROVED' ? 'success' : (app.underwritingStatus === 'REJECTED' ? 'danger' : 'warning')}">${app.underwritingStatus}</span></td>
            <td>
                ${app.underwritingStatus === 'FLAGGED_FOR_MANUAL_REVIEW' ? 
                    `<button class="btn btn-primary btn-sm" onclick="openManualDecision(${app.id})"><i class="fa-solid fa-gavel"></i> Decide</button>` : 
                    `<span class="hint">Resolved</span>`}
            </td>
        </tr>
    `).join("");

    updatePendingCount();
}

function updatePendingCount() {
    const pending = applicationsState.filter(a => a.underwritingStatus === 'FLAGGED_FOR_MANUAL_REVIEW').length;
    document.getElementById("pendingReviewCount").textContent = pending;
}

window.openManualDecision = function(appId) {
    const app = applicationsState.find(a => a.id === appId);
    if (!app) return;

    document.getElementById("modalAppId").value = app.id;
    document.getElementById("decidingAppLabel").textContent = `Application #${app.id} — Applicant: ${app.applicantName} (Score: ${app.creditScore})`;
    document.getElementById("decisionApprovedAmount").value = app.requestedAmount;
    document.getElementById("manualDecisionCard").style.display = "block";
    document.getElementById("manualDecisionCard").scrollIntoView({ behavior: 'smooth' });
};

/* ==========================================================================
   5. Financial Idempotency Engine & Retry Simulator
   ========================================================================== */
function initIdempotencyEngine() {
    const form = document.getElementById("idempotencyForm");
    const retryBtn = document.getElementById("retryIdemBtn");
    const consoleBox = document.getElementById("idemConsoleBox");

    let processedKeysMap = new Map();

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        executeIdempotentTransfer(false);
    });

    retryBtn.addEventListener("click", () => {
        executeIdempotentTransfer(true);
    });

    function executeIdempotentTransfer(isRetryAction) {
        const key = document.getElementById("idemKeyInput").value.trim();
        const appId = document.getElementById("idemAppId").value;
        const amount = parseFloat(document.getElementById("idemAmount").value);
        const account = document.getElementById("idemAccount").value;

        const time = new Date().toLocaleTimeString();

        if (processedKeysMap.has(key)) {
            // DUPLICATE DETECTED! Return cached response
            const cachedTxn = processedKeysMap.get(key);
            consoleBox.innerHTML += `
                <div class="console-line warning">
                    [${time}] ⚠️ DUPLICATE DISBURSEMENT REQUEST DETECTED!
                </div>
                <div class="console-line info">
                    [System] Idempotency-Key "${key}" previously processed on DB.
                </div>
                <div class="console-line success">
                    [Response 200 OK] { "isDuplicateRequest": true, "status": "SUCCESS", "transactionRef": "${cachedTxn}", "message": "Returned existing disbursement transaction without re-funding." }
                </div>
                <hr style="border-color: var(--border-color); margin: 8px 0;">
            `;
        } else {
            // FIRST ATTEMPT: Execute new fund transfer
            const newTxnRef = "TXN-" + Math.random().toString(36).substring(2, 10).toUpperCase() + "-IDEM";
            processedKeysMap.set(key, newTxnRef);

            consoleBox.innerHTML += `
                <div class="console-line info">
                    [${time}] POST /api/v1/disbursements | Header [Idempotency-Key: ${key}]
                </div>
                <div class="console-line success">
                    [Response 200 OK] { "isDuplicateRequest": false, "status": "SUCCESS", "transactionRef": "${newTxnRef}", "amount": ${amount}, "account": "${account}" }
                </div>
                <hr style="border-color: var(--border-color); margin: 8px 0;">
            `;
        }

        consoleBox.scrollTop = consoleBox.scrollHeight;
    }
}

/* ==========================================================================
   6. Notification Feed Component
   ========================================================================== */
function addNotification(appId, channel, type, message) {
    notificationsState.unshift({
        id: Date.now(),
        applicationId: appId,
        channel: channel,
        type: type,
        message: message,
        timestamp: new Date().toLocaleTimeString()
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
                <div class="notification-meta">Dispatched by notification-service via Kafka topic • ${n.timestamp}</div>
            </div>
        </div>
    `).join("");
}

document.getElementById("clearNotificationsBtn")?.addEventListener("click", () => {
    notificationsState = [];
    renderNotifications();
});
