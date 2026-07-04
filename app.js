const STORAGE_KEY = "debtPortalData";
const INR = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

let debts, cashflow, investments;
loadData();

let currentFilter = "all";
let lastSimulation = null;
let paidPendingChart, byDebtChart, simChart, budgetVsActualChart, cashflowTrendChart, allocationChart, investedVsCurrentChart;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Storage ----------

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  let parsed;
  if (!raw) {
    parsed = {
      debts: JSON.parse(JSON.stringify(DEBT_SEED)),
      cashflow: JSON.parse(JSON.stringify(CASHFLOW_SEED)),
      investments: JSON.parse(JSON.stringify(INVESTMENT_SEED)),
    };
  } else {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      // Migrating from the pre-multi-view schema, where the root was just the debts array.
      parsed = { debts: data, cashflow: JSON.parse(JSON.stringify(CASHFLOW_SEED)), investments: JSON.parse(JSON.stringify(INVESTMENT_SEED)) };
    } else {
      parsed = {
        debts: data.debts || [],
        cashflow: data.cashflow || JSON.parse(JSON.stringify(CASHFLOW_SEED)),
        investments: data.investments || JSON.parse(JSON.stringify(INVESTMENT_SEED)),
      };
    }
  }

  parsed.debts.forEach((d) => {
    if (!Array.isArray(d.statements)) d.statements = [];
    if (typeof d.loanNumber !== "string") d.loanNumber = "";
    if (!Array.isArray(d.paymentHistory)) d.paymentHistory = [];
  });
  if (!parsed.cashflow.budgetSplit) parsed.cashflow.budgetSplit = { needs: 50, savings: 20, wants: 30 };
  if (!Array.isArray(parsed.cashflow.recurringExpenses)) parsed.cashflow.recurringExpenses = [];
  parsed.cashflow.recurringExpenses.forEach((r) => { if (typeof r.linkedDebtId !== "string") r.linkedDebtId = ""; });
  if (!Array.isArray(parsed.cashflow.monthlyLogs)) parsed.cashflow.monthlyLogs = [];
  if (!Array.isArray(parsed.cashflow.bankStatements)) parsed.cashflow.bankStatements = [];
  if (!parsed.cashflow.categoryMappings || typeof parsed.cashflow.categoryMappings !== "object") parsed.cashflow.categoryMappings = {};
  if (!Array.isArray(parsed.cashflow.bankAccounts)) parsed.cashflow.bankAccounts = [];
  parsed.investments = parsed.investments.map(normalizeInvestment);

  debts = parsed.debts;
  cashflow = parsed.cashflow;
  investments = parsed.investments;
  saveData();
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ debts, cashflow, investments }));
}

function recalc(d) {
  d.completionPct = d.totalAmount > 0 ? Math.max(0, Math.min(1, (d.totalAmount - d.pendingAmount) / d.totalAmount)) : 1;
  if (!Array.isArray(d.statements)) d.statements = [];
  if (typeof d.loanNumber !== "string") d.loanNumber = "";
  if (!Array.isArray(d.paymentHistory)) d.paymentHistory = [];
  return d;
}

function isActive(d) { return d.pendingAmount > 0; }

// ---------- Tab Navigation ----------

function switchView(view) {
  document.querySelectorAll(".view").forEach((el) => (el.hidden = el.id !== `view-${view}`));
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  renderAll();
}

function renderAll() {
  renderNetWorth();
  renderDebtView();
  renderCashflowView();
  renderInvestmentView();
}

function renderNetWorth() {
  const totalPendingDebt = debts.reduce((s, d) => s + d.pendingAmount, 0);
  const totalCurrentValue = investments.reduce((s, i) => s + i.currentValue, 0);
  const isCreditCard = (acct) => (acct.accountType || "").toLowerCase().includes("credit card");
  const totalCash = (cashflow.bankAccounts || []).filter((a) => !isCreditCard(a)).reduce((s, a) => s + (a.currentBalance || 0), 0);
  const totalCardDue = (cashflow.bankAccounts || []).filter(isCreditCard).reduce((s, a) => s + (a.currentBalance || 0), 0);
  const netWorth = totalCurrentValue + totalCash - totalPendingDebt - totalCardDue;

  document.getElementById("networthStrip").innerHTML = `
    <div class="nw-item"><span class="nw-label">Net Worth</span><span class="nw-value ${netWorth >= 0 ? "positive" : "negative"}">${INR(netWorth)}</span></div>
    <div class="nw-item"><span class="nw-label">Investments</span><span class="nw-value">${INR(totalCurrentValue)}</span></div>
    <div class="nw-item"><span class="nw-label">Cash</span><span class="nw-value">${INR(totalCash)}</span></div>
    <div class="nw-item"><span class="nw-label">Pending Debt</span><span class="nw-value">${INR(totalPendingDebt + totalCardDue)}</span></div>
  `;
}

// ================================================================
// DEBT MANAGEMENT VIEW
// ================================================================

function renderDebtView() {
  renderSummary();
  renderTable();
  renderCharts();
  renderStatementHistoryTable();
}

function renderSummary() {
  const total = debts.reduce((s, d) => s + d.totalAmount, 0);
  const pending = debts.reduce((s, d) => s + d.pendingAmount, 0);
  const paid = total - pending;
  const active = debts.filter(isActive).length;
  const completed = debts.length - active;
  const pct = total > 0 ? (paid / total) * 100 : 100;

  const cards = [
    ["Total Debts", debts.length],
    ["Active", active],
    ["Completed", completed],
    ["Original Amount", INR(total)],
    ["Pending", INR(pending)],
    ["Overall Progress", pct.toFixed(1) + "%"],
  ];
  document.getElementById("summaryGrid").innerHTML = cards
    .map(([label, value]) => `<div class="summary-card"><div class="label">${label}</div><div class="value">${value}</div></div>`)
    .join("");
}

function renderTable() {
  const rows = debts
    .filter((d) => currentFilter === "all" || (currentFilter === "active" ? isActive(d) : !isActive(d)))
    .map((d) => {
      const pct = Math.round(d.completionPct * 100);
      return `<tr data-id="${d.id}">
        <td>${escapeHtml(d.name)}</td>
        <td>${escapeHtml(d.type || "")}</td>
        <td>${INR(d.totalAmount)}</td>
        <td>${INR(d.pendingAmount)}</td>
        <td><div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div> ${pct}%</td>
        <td>${INR(d.monthlyPayment || 0)}</td>
        <td>${d.interestRate || 0}%</td>
        <td>${d.pendingEmis || 0}</td>
        <td><button class="row-edit" data-id="${d.id}">Edit</button></td>
      </tr>`;
    })
    .join("");
  document.getElementById("debtTableBody").innerHTML = rows || `<tr><td colspan="9">No debts in this view.</td></tr>`;
}

function renderCharts() {
  const total = debts.reduce((s, d) => s + d.totalAmount, 0);
  const pending = debts.reduce((s, d) => s + d.pendingAmount, 0);
  const paid = total - pending;

  const ctx1 = document.getElementById("chartPaidPending");
  if (paidPendingChart) paidPendingChart.destroy();
  paidPendingChart = new Chart(ctx1, {
    type: "doughnut",
    data: {
      labels: ["Paid", "Pending"],
      datasets: [{ data: [paid, pending], backgroundColor: ["#22c55e", "#4f8cff"] }],
    },
    options: { plugins: { legend: { labels: { color: "#e7ebf3" } } } },
  });

  const active = debts.filter(isActive).sort((a, b) => b.pendingAmount - a.pendingAmount);
  const ctx2 = document.getElementById("chartByDebt");
  if (byDebtChart) byDebtChart.destroy();
  byDebtChart = new Chart(ctx2, {
    type: "bar",
    data: {
      labels: active.map((d) => d.name),
      datasets: [{ label: "Pending", data: active.map((d) => d.pendingAmount), backgroundColor: "#4f8cff" }],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#8a93a6" }, grid: { color: "#262e42" } },
        y: { ticks: { color: "#e7ebf3" }, grid: { display: false } },
      },
    },
  });
}

// ---------- Simulator ----------

function effectiveMinPayment(d) {
  if (d.monthlyPayment > 0) return d.monthlyPayment;
  if (d.pendingEmis > 0) return Math.ceil(d.pendingAmount / d.pendingEmis);
  return d.pendingAmount;
}

function orderDebts(list, strategy) {
  if (strategy === "avalanche") {
    return [...list].sort((a, b) => (b.interestRate || 0) - (a.interestRate || 0) || a.balance - b.balance);
  }
  return [...list].sort((a, b) => a.balance - b.balance);
}

function simulatePayoff(strategy, extraPayment) {
  const MAX_MONTHS = 600;
  const active = debts.filter(isActive).map((d) => ({
    id: d.id,
    name: d.name,
    balance: d.pendingAmount,
    minPayment: effectiveMinPayment(d),
    interestRate: d.interestRate || 0,
  }));

  if (active.length === 0) {
    return { months: 0, balanceOverTime: [0], payoffOrder: [], freedThisMonth: 0 };
  }

  const payoffOrder = [];
  const balanceOverTime = [];
  let month = 0;

  while (active.some((d) => d.balance > 0.01) && month < MAX_MONTHS) {
    month++;
    for (const d of active) {
      if (d.balance <= 0) continue;
      const monthlyRate = d.interestRate / 100 / 12;
      d.balance += d.balance * monthlyRate;
    }
    const ordered = orderDebts(active.filter((d) => d.balance > 0), strategy);
    for (const d of active) {
      if (d.balance <= 0) continue;
      const pay = Math.min(d.minPayment, d.balance);
      d.balance -= pay;
    }
    let pool = extraPayment;
    for (const d of ordered) {
      if (pool <= 0) break;
      if (d.balance <= 0) continue;
      const pay = Math.min(pool, d.balance);
      d.balance -= pay;
      pool -= pay;
    }
    for (const d of active) {
      if (d.balance <= 0.01 && !payoffOrder.find((p) => p.id === d.id)) {
        payoffOrder.push({ id: d.id, name: d.name, month });
      }
    }
    balanceOverTime.push(Math.max(0, active.reduce((s, d) => s + Math.max(0, d.balance), 0)));
  }

  return { months: month, balanceOverTime, payoffOrder };
}

function runSimulationUI() {
  const strategy = document.getElementById("simStrategy").value;
  const extra = Number(document.getElementById("simExtra").value) || 0;

  const result = simulatePayoff(strategy, extra);
  const baseline = extra > 0 ? simulatePayoff(strategy, 0) : result;
  lastSimulation = { strategy, extra, result, baseline };

  document.getElementById("simResults").hidden = false;
  const monthsSaved = Math.max(0, baseline.months - result.months);

  document.getElementById("simStats").innerHTML = [
    ["Months to Debt-Free", result.months],
    ["Months Saved vs. Minimum", monthsSaved],
    ["Debts Simulated", result.payoffOrder.length],
  ].map(([label, value]) => `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`).join("");

  const ctx = document.getElementById("chartSim");
  if (simChart) simChart.destroy();
  simChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: result.balanceOverTime.map((_, i) => "M" + (i + 1)),
      datasets: [{ label: "Total Pending Balance", data: result.balanceOverTime, borderColor: "#22c55e", fill: false, tension: 0.15 }],
    },
    options: {
      plugins: { legend: { labels: { color: "#e7ebf3" } } },
      scales: {
        x: { ticks: { color: "#8a93a6", maxTicksLimit: 12 }, grid: { color: "#262e42" } },
        y: { ticks: { color: "#8a93a6" }, grid: { color: "#262e42" } },
      },
    },
  });

  document.getElementById("simOrder").innerHTML = result.payoffOrder
    .map((p) => `<li>${escapeHtml(p.name)} &mdash; paid off in month ${p.month}</li>`)
    .join("");

  document.getElementById("aiCommentary").hidden = true;
}

async function getAiCommentary() {
  if (!lastSimulation) runSimulationUI();
  const box = document.getElementById("aiCommentary");
  box.hidden = false;
  box.className = "ai-commentary loading";
  box.textContent = "Asking AI for a strategy read on this simulation...";

  try {
    const res = await fetch("/api/ai-commentary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strategy: lastSimulation.strategy,
        extraPayment: lastSimulation.extra,
        monthsToDebtFree: lastSimulation.result.months,
        payoffOrder: lastSimulation.result.payoffOrder,
        activeDebts: debts.filter(isActive).map((d) => ({
          name: d.name, type: d.type, pendingAmount: d.pendingAmount,
          monthlyPayment: d.monthlyPayment, interestRate: d.interestRate,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    box.className = "ai-commentary";
    box.textContent = data.commentary;
  } catch (err) {
    box.className = "ai-commentary error";
    box.textContent = "Couldn't get AI commentary: " + err.message + "\n\n(This requires the /api/ai-commentary serverless function to be deployed with a GEMINI_API_KEY set.)";
  }
}

// ---------- Loan Statements ----------

let pendingStatement = null;

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

async function extractPdfText(file) {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(" ") + "\n";
  }
  return text;
}

function populateMatchDebtSelect(guessLoanNumber) {
  const select = document.getElementById("sMatchDebt");
  const matchIndex = guessLoanNumber
    ? debts.findIndex((d) => d.loanNumber && d.loanNumber.toLowerCase() === guessLoanNumber.toLowerCase())
    : -1;
  select.innerHTML =
    `<option value="__new__">+ Create new debt</option>` +
    debts.map((d, i) => `<option value="${d.id}" ${i === matchIndex ? "selected" : ""}>${escapeHtml(d.name)}</option>`).join("");
  if (matchIndex === -1) select.value = "__new__";
}

async function handleStatementFile(file) {
  const statusEl = document.getElementById("statementStatus");
  statusEl.hidden = false;
  statusEl.textContent = "Extracting text from PDF...";
  document.getElementById("statementReview").hidden = true;

  try {
    const text = await extractPdfText(file);
    statusEl.textContent = "Asking AI to read the loan details...";

    const res = await fetch("/api/parse-statement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 12000) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Parsing failed");

    pendingStatement = data.fields || {};
    document.getElementById("sLoanNumber").value = pendingStatement.loanNumber || "";
    document.getElementById("sLoanType").value = [pendingStatement.lenderName, pendingStatement.loanType].filter(Boolean).join(" - ");
    document.getElementById("sStatementDate").value = pendingStatement.statementDate || "";
    document.getElementById("sBalance").value = pendingStatement.outstandingBalance ?? "";
    document.getElementById("sEmi").value = pendingStatement.emiAmount ?? "";
    document.getElementById("sDueDate").value = pendingStatement.nextDueDate || "";
    document.getElementById("sRate").value = pendingStatement.interestRate ?? "";
    populateMatchDebtSelect(pendingStatement.loanNumber);

    statusEl.hidden = true;
    document.getElementById("statementReview").hidden = false;
  } catch (err) {
    statusEl.hidden = false;
    statusEl.textContent = "Couldn't read this statement: " + err.message +
      " (requires the /api/parse-statement serverless function deployed with GEMINI_API_KEY set).";
  }
}

function saveStatementReview() {
  const matchId = document.getElementById("sMatchDebt").value;
  const entry = {
    loanNumber: document.getElementById("sLoanNumber").value.trim(),
    loanType: document.getElementById("sLoanType").value.trim(),
    statementDate: document.getElementById("sStatementDate").value,
    balance: document.getElementById("sBalance").value === "" ? null : Number(document.getElementById("sBalance").value),
    emi: document.getElementById("sEmi").value === "" ? null : Number(document.getElementById("sEmi").value),
    dueDate: document.getElementById("sDueDate").value,
    rate: document.getElementById("sRate").value === "" ? null : Number(document.getElementById("sRate").value),
    uploadedAt: new Date().toISOString(),
  };

  let debt;
  if (matchId === "__new__") {
    debt = recalc({
      id: "d-" + Date.now(),
      name: entry.loanType || entry.loanNumber || "New Loan",
      type: entry.loanType || "",
      loanNumber: entry.loanNumber,
      totalAmount: entry.balance || 0,
      totalEmis: 0,
      pendingAmount: entry.balance || 0,
      pendingEmis: 0,
      monthlyPayment: entry.emi || 0,
      interestRate: entry.rate || 0,
      statements: [],
    });
    debts.push(debt);
  } else {
    debt = debts.find((d) => d.id === matchId);
  }

  debt.statements.push(entry);

  if (document.getElementById("sApplyToDebt").checked && matchId !== "__new__") {
    if (entry.balance != null) debt.pendingAmount = entry.balance;
    if (entry.emi != null) debt.monthlyPayment = entry.emi;
    if (entry.rate != null) debt.interestRate = entry.rate;
    if (entry.loanNumber) debt.loanNumber = entry.loanNumber;
    recalc(debt);
  }

  saveData();
  document.getElementById("statementReview").hidden = true;
  document.getElementById("statementFile").value = "";
  pendingStatement = null;
  renderAll();
}

function renderStatementHistoryTable() {
  const rows = [];
  for (const d of debts) {
    for (const s of d.statements || []) {
      rows.push({ debtName: d.name, ...s });
    }
  }
  rows.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  document.getElementById("statementHistoryBody").innerHTML =
    rows
      .map(
        (r) => `<tr>
          <td>${escapeHtml(r.debtName)}</td>
          <td>${escapeHtml(r.loanNumber || "-")}</td>
          <td>${r.statementDate || "-"}</td>
          <td>${r.balance != null ? INR(r.balance) : "-"}</td>
          <td>${r.emi != null ? INR(r.emi) : "-"}</td>
          <td>${r.dueDate || "-"}</td>
          <td>${new Date(r.uploadedAt).toLocaleString("en-IN")}</td>
        </tr>`
      )
      .join("") || `<tr><td colspan="7">No statements uploaded yet.</td></tr>`;
}

// ---------- Debt Modal ----------

function openModal(debt) {
  const modal = document.getElementById("debtModal");
  document.getElementById("modalTitle").textContent = debt ? "Edit Debt" : "Add Debt";
  document.getElementById("fId").value = debt ? debt.id : "";
  document.getElementById("fName").value = debt ? debt.name : "";
  document.getElementById("fType").value = debt ? debt.type : "";
  document.getElementById("fLoanNumber").value = debt ? debt.loanNumber || "" : "";
  document.getElementById("fTotal").value = debt ? debt.totalAmount : "";
  document.getElementById("fPending").value = debt ? debt.pendingAmount : "";
  document.getElementById("fMonthly").value = debt ? debt.monthlyPayment : 0;
  document.getElementById("fEmis").value = debt ? debt.pendingEmis : 0;
  document.getElementById("fRate").value = debt ? debt.interestRate : 0;
  document.getElementById("btnDeleteDebt").hidden = !debt;

  const historyBox = document.getElementById("fStatementHistory");
  const statements = debt && Array.isArray(debt.statements) ? debt.statements : [];
  if (statements.length === 0) {
    historyBox.innerHTML = "";
  } else {
    const rows = [...statements]
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      .map((s) => `<tr><td>${s.statementDate || "-"}</td><td>${s.balance != null ? INR(s.balance) : "-"}</td><td>${s.emi != null ? INR(s.emi) : "-"}</td></tr>`)
      .join("");
    historyBox.innerHTML = `<div>Statement history (${statements.length})</div>
      <table><thead><tr><th>Date</th><th>Balance</th><th>EMI</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  const paymentBox = document.getElementById("fPaymentHistory");
  const payments = debt && Array.isArray(debt.paymentHistory) ? debt.paymentHistory : [];
  if (payments.length === 0) {
    paymentBox.innerHTML = "";
  } else {
    const rows = [...payments]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map((p) => `<tr><td>${p.date || "-"}</td><td>${INR(p.amount)}</td><td>${escapeHtml(p.description || "-")}</td></tr>`)
      .join("");
    paymentBox.innerHTML = `<div>Bank-detected payments (${payments.length}) &mdash; cross-check against statement history above for discrepancies</div>
      <table><thead><tr><th>Date</th><th>Amount</th><th>Bank Description</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  modal.hidden = false;
}

function closeModal() {
  document.getElementById("debtModal").hidden = true;
}

// ================================================================
// CASHFLOW MANAGEMENT VIEW
// ================================================================

function categorizeAmounts(expenses) {
  const totals = { needs: 0, savings: 0, wants: 0 };
  for (const e of expenses) {
    if (totals[e.category] != null) totals[e.category] += e.amount;
  }
  return totals;
}

function renderCashflowView() {
  const logs = [...cashflow.monthlyLogs].sort((a, b) => a.month.localeCompare(b.month));
  const latest = logs[logs.length - 1];

  const latestIncome = latest ? latest.income : 0;
  const latestExpenseTotal = latest ? latest.expenses.reduce((s, e) => s + e.amount, 0) : 0;
  const latestNet = latestIncome - latestExpenseTotal;
  const savingsRate = latestIncome > 0 ? (latestNet / latestIncome) * 100 : 0;

  document.getElementById("cashflowSummaryGrid").innerHTML = [
    ["Months Logged", cashflow.monthlyLogs.length],
    ["Latest Income", INR(latestIncome)],
    ["Latest Expenses", INR(latestExpenseTotal)],
    ["Latest Net Cashflow", INR(latestNet)],
    ["Savings Rate", savingsRate.toFixed(1) + "%"],
    ["Budget Rule", `${cashflow.budgetSplit.needs}/${cashflow.budgetSplit.savings}/${cashflow.budgetSplit.wants}`],
  ].map(([label, value]) => `<div class="summary-card"><div class="label">${label}</div><div class="value">${value}</div></div>`).join("");

  renderEmiOutflowTable(debts.filter(isActive));

  document.getElementById("bNeeds").value = cashflow.budgetSplit.needs;
  document.getElementById("bSavings").value = cashflow.budgetSplit.savings;
  document.getElementById("bWants").value = cashflow.budgetSplit.wants;

  renderAccountsPanel();
  renderRecurringTable();
  renderBankStatementHistoryTable();
  renderMonthlyLogTable(logs);
  renderBudgetVsActualChart(latest);
  renderCashflowTrendChart(logs);
}

function renderEmiOutflowTable(activeDebts) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const rows = activeDebts.map((d) => {
    const history = [...(d.paymentHistory || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
    const lastPayment = history[0];
    const paymentsThisMonth = (d.paymentHistory || []).filter((p) => p.month === currentMonth);
    const expected = d.monthlyPayment || 0;

    let statusHtml;
    if (paymentsThisMonth.length === 0) {
      statusHtml = `<span class="hint">Not detected yet</span>`;
    } else {
      const totalThisMonth = paymentsThisMonth.reduce((s, p) => s + p.amount, 0);
      const tolerance = Math.max(expected * 0.05, 100);
      if (Math.abs(totalThisMonth - expected) > tolerance) {
        statusHtml = `<span class="negative">Amount mismatch (${INR(totalThisMonth)} vs expected ${INR(expected)})</span>`;
      } else {
        statusHtml = `<span class="positive">Paid &#10003;</span>`;
      }
    }

    return `<tr>
      <td>${escapeHtml(d.name)}</td>
      <td>${INR(expected)}</td>
      <td>${lastPayment ? `${INR(lastPayment.amount)} on ${lastPayment.date}` : "-"}</td>
      <td>${statusHtml}</td>
    </tr>`;
  });
  if (activeDebts.length === 0) {
    document.getElementById("emiOutflowBody").innerHTML = `<tr><td colspan="4">No active debts.</td></tr>`;
    return;
  }
  const total = activeDebts.reduce((s, d) => s + (d.monthlyPayment || 0), 0);
  document.getElementById("emiOutflowBody").innerHTML =
    rows.join("") + `<tr><td><strong>Total</strong></td><td><strong>${INR(total)}</strong></td><td></td><td></td></tr>`;
}

function renderAccountsPanel() {
  const grid = document.getElementById("accountsGrid");
  if (!cashflow.bankAccounts || cashflow.bankAccounts.length === 0) {
    grid.innerHTML = `<div class="accounts-empty">No accounts yet — upload a bank/card statement below to add one.</div>`;
    return;
  }
  grid.innerHTML = cashflow.bankAccounts
    .map((a) => {
      const badge = getBankBadge(a.bankName);
      const isCreditCard = (a.accountType || "").toLowerCase().includes("credit card");
      return `<div class="account-card">
        <div class="account-badge" style="background:${badge.color}">${escapeHtml(badge.initials)}</div>
        <div class="account-details">
          <div class="account-name">${escapeHtml(a.bankName || "Account")}</div>
          <div class="account-meta">${escapeHtml(a.accountType || "-")} &middot; ${escapeHtml(a.accountNumber || "-")}</div>
          <div class="account-balance ${isCreditCard ? "negative" : "positive"}">${INR(a.currentBalance || 0)}${isCreditCard ? " due" : ""}</div>
        </div>
      </div>`;
    })
    .join("");
}

function renderRecurringTable() {
  document.getElementById("recurringTableBody").innerHTML =
    cashflow.recurringExpenses
      .map((r) => {
        const linkedDebt = r.linkedDebtId ? debts.find((d) => d.id === r.linkedDebtId) : null;
        return `<tr data-id="${r.id}">
          <td>${escapeHtml(r.name)}</td>
          <td>${r.category}</td>
          <td>${INR(r.typicalAmount)}</td>
          <td>${linkedDebt ? escapeHtml(linkedDebt.name) : "-"}</td>
          <td><button class="row-edit recurring-delete" data-id="${r.id}">Delete</button></td>
        </tr>`;
      })
      .join("") || `<tr><td colspan="5">No templates yet.</td></tr>`;
}

function renderMonthlyLogTable(logs) {
  const sorted = [...logs].reverse();
  document.getElementById("monthlyLogTableBody").innerHTML =
    sorted
      .map((log) => {
        const expenseTotal = log.expenses.reduce((s, e) => s + e.amount, 0);
        const cats = categorizeAmounts(log.expenses);
        return `<tr data-id="${log.id}">
          <td>${log.month}</td>
          <td>${INR(log.income)}</td>
          <td>${INR(expenseTotal)}</td>
          <td>${INR(log.income - expenseTotal)}</td>
          <td>${INR(cats.needs)}</td>
          <td>${INR(cats.savings)}</td>
          <td>${INR(cats.wants)}</td>
          <td><button class="row-edit month-log-delete" data-id="${log.id}">Delete</button></td>
        </tr>`;
      })
      .join("") || `<tr><td colspan="8">No months logged yet.</td></tr>`;
}

function renderBudgetVsActualChart(latest) {
  const ctx = document.getElementById("chartBudgetVsActual");
  if (budgetVsActualChart) budgetVsActualChart.destroy();

  const income = latest ? latest.income : 0;
  const targetNeeds = (income * cashflow.budgetSplit.needs) / 100;
  const targetSavings = (income * cashflow.budgetSplit.savings) / 100;
  const targetWants = (income * cashflow.budgetSplit.wants) / 100;
  const actual = latest ? categorizeAmounts(latest.expenses) : { needs: 0, savings: 0, wants: 0 };

  budgetVsActualChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Needs", "Savings", "Wants"],
      datasets: [
        { label: "Target", data: [targetNeeds, targetSavings, targetWants], backgroundColor: "#4f8cff" },
        { label: "Actual", data: [actual.needs, actual.savings, actual.wants], backgroundColor: "#22c55e" },
      ],
    },
    options: {
      plugins: { legend: { labels: { color: "#e7ebf3" } } },
      scales: {
        x: { ticks: { color: "#8a93a6" }, grid: { display: false } },
        y: { ticks: { color: "#8a93a6" }, grid: { color: "#262e42" } },
      },
    },
  });
}

function renderCashflowTrendChart(logs) {
  const ctx = document.getElementById("chartCashflowTrend");
  if (cashflowTrendChart) cashflowTrendChart.destroy();
  cashflowTrendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: logs.map((l) => l.month),
      datasets: [
        { label: "Net Cashflow", data: logs.map((l) => l.income - l.expenses.reduce((s, e) => s + e.amount, 0)), borderColor: "#22c55e", tension: 0.15 },
      ],
    },
    options: {
      plugins: { legend: { labels: { color: "#e7ebf3" } } },
      scales: {
        x: { ticks: { color: "#8a93a6" }, grid: { color: "#262e42" } },
        y: { ticks: { color: "#8a93a6" }, grid: { color: "#262e42" } },
      },
    },
  });
}

async function getCashflowAiCommentary() {
  const box = document.getElementById("cashflowAiCommentary");
  box.hidden = false;
  box.className = "ai-commentary loading";
  box.textContent = "Asking AI to review your cashflow...";

  const logs = [...cashflow.monthlyLogs].sort((a, b) => a.month.localeCompare(b.month));
  try {
    const res = await fetch("/api/cashflow-insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budgetSplit: cashflow.budgetSplit,
        monthlyLogs: logs.map((l) => ({ month: l.month, income: l.income, expenses: l.expenses })),
        upcomingEmiOutflows: debts.filter(isActive).map((d) => ({ name: d.name, monthlyPayment: d.monthlyPayment })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    box.className = "ai-commentary";
    box.textContent = data.commentary;
  } catch (err) {
    box.className = "ai-commentary error";
    box.textContent = "Couldn't get AI insights: " + err.message + "\n\n(This requires the /api/cashflow-insights serverless function to be deployed with a GEMINI_API_KEY set.)";
  }
}

// ---------- Bank / Card Statement Upload ----------

let pendingBankTransactions = [];
let pendingBankAccountMeta = { bankName: "", accountNumber: "", accountType: "", closingBalance: null };

const KNOWN_BANKS = {
  hdfc: { initials: "HDFC", color: "#004c8f" },
  icici: { initials: "ICICI", color: "#b02a30" },
  "state bank": { initials: "SBI", color: "#22409a" },
  sbi: { initials: "SBI", color: "#22409a" },
  axis: { initials: "AXIS", color: "#97144d" },
  kotak: { initials: "KMB", color: "#ed1c24" },
  idfc: { initials: "IDFC", color: "#8c1d40" },
  "yes bank": { initials: "YES", color: "#003087" },
  pnb: { initials: "PNB", color: "#7a1f2b" },
  "punjab national": { initials: "PNB", color: "#7a1f2b" },
  "bank of baroda": { initials: "BOB", color: "#f9a01b" },
  canara: { initials: "CNRB", color: "#004b8d" },
  indusind: { initials: "IIB", color: "#8a1538" },
};

function getBankBadge(bankName) {
  const lower = (bankName || "").toLowerCase();
  const key = Object.keys(KNOWN_BANKS).find((k) => lower.includes(k));
  if (key) return KNOWN_BANKS[key];
  const initials = (bankName || "?").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 4).toUpperCase() || "?";
  return { initials, color: "#4f8cff" };
}

const DESC_KEY_STOPWORDS = new Set([
  "auto", "debit", "credit", "payment", "bill", "upi", "neft", "imps", "txn", "transaction",
  "order", "ref", "no", "card", "pos", "atm", "withdrawal", "deposit", "transfer", "the", "to",
  "from", "dr", "cr", "charges", "fee", "purchase", "for",
]);

function normalizeDescriptionKey(description) {
  return (description || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && w.length > 2 && !DESC_KEY_STOPWORDS.has(w))
    .slice(0, 3)
    .join(" ");
}

function guessCategoryForDescription(description) {
  const key = normalizeDescriptionKey(description);
  if (key) {
    const learnedKeys = Object.keys(cashflow.categoryMappings).sort((a, b) => b.length - a.length);
    for (const k of learnedKeys) {
      if (k && (key.includes(k) || k.includes(key))) return cashflow.categoryMappings[k].category;
    }
  }
  const desc = (description || "").toLowerCase();
  const match = cashflow.recurringExpenses.find(
    (r) => desc.includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(desc)
  );
  return match ? match.category : "wants";
}

function guessTypeForDescription(description, fallbackType) {
  const key = normalizeDescriptionKey(description);
  if (key) {
    const learnedKeys = Object.keys(cashflow.categoryMappings).sort((a, b) => b.length - a.length);
    for (const k of learnedKeys) {
      if (k && (key.includes(k) || k.includes(key))) return cashflow.categoryMappings[k].type || fallbackType;
    }
  }
  return fallbackType;
}

function guessLinkedDebtForDescription(description) {
  const key = normalizeDescriptionKey(description);
  if (key) {
    const learnedKeys = Object.keys(cashflow.categoryMappings).sort((a, b) => b.length - a.length);
    for (const k of learnedKeys) {
      if (k && (key.includes(k) || k.includes(key)) && cashflow.categoryMappings[k].linkedDebtId) {
        return cashflow.categoryMappings[k].linkedDebtId;
      }
    }
  }
  const desc = (description || "").toLowerCase();
  const recMatch = cashflow.recurringExpenses.find(
    (r) => r.linkedDebtId && (desc.includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(desc))
  );
  if (recMatch) return recMatch.linkedDebtId;
  const debtMatch = debts.find((d) => desc.includes(d.name.toLowerCase()) || d.name.toLowerCase().includes(desc));
  return debtMatch ? debtMatch.id : "";
}

function learnFromTransactions(transactions) {
  for (const t of transactions) {
    const key = normalizeDescriptionKey(t.description);
    if (!key) continue;
    const existing = cashflow.categoryMappings[key] || {};
    cashflow.categoryMappings[key] = {
      category: t.category,
      type: t.type,
      linkedDebtId: t.linkedDebtId || existing.linkedDebtId || "",
    };
  }
}

function mostCommonMonth(dates) {
  const counts = {};
  for (const d of dates) {
    const month = (d || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    counts[month] = (counts[month] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries[0][0] : new Date().toISOString().slice(0, 7);
}

async function handleBankStatementFile(file) {
  const statusEl = document.getElementById("bankStatementStatus");
  statusEl.hidden = false;
  statusEl.textContent = "Extracting text from PDF...";
  document.getElementById("bankStatementReview").hidden = true;

  try {
    const text = await extractPdfText(file);
    statusEl.textContent = "Asking AI to read the transactions...";

    const res = await fetch("/api/parse-bank-statement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 20000) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Parsing failed");

    const fields = data.fields || {};
    pendingBankTransactions = (fields.transactions || []).map((t, i) => {
      const aiType = t.type === "credit" ? "credit" : "debit";
      return {
        id: "tx-" + i,
        date: t.date || "",
        description: t.description || "",
        amount: Number(t.amount) || 0,
        type: guessTypeForDescription(t.description, aiType),
        category: guessCategoryForDescription(t.description),
        linkedDebtId: guessLinkedDebtForDescription(t.description),
        include: true,
      };
    });

    document.getElementById("btMonth").value = mostCommonMonth(pendingBankTransactions.map((t) => t.date));
    pendingBankAccountMeta = {
      bankName: fields.bankName || "",
      accountNumber: fields.accountNumber || "",
      accountType: fields.accountType || "",
      closingBalance: fields.closingBalance ?? null,
    };
    document.getElementById("btBankName").value = pendingBankAccountMeta.bankName;
    document.getElementById("btAccountNumber").value = pendingBankAccountMeta.accountNumber;
    document.getElementById("btAccountType").value = pendingBankAccountMeta.accountType;
    document.getElementById("btClosingBalance").value = pendingBankAccountMeta.closingBalance ?? "";
    renderBankTxReviewTable();

    statusEl.hidden = true;
    document.getElementById("bankStatementReview").hidden = false;
  } catch (err) {
    statusEl.hidden = false;
    statusEl.textContent = "Couldn't read this statement: " + err.message +
      " (requires the /api/parse-bank-statement serverless function deployed with GEMINI_API_KEY set).";
  }
}

function renderBankTxReviewTable() {
  document.getElementById("btTransactionTableBody").innerHTML = pendingBankTransactions
    .map(
      (t) => `<tr data-id="${t.id}">
        <td><input type="checkbox" class="btInclude" data-id="${t.id}" ${t.include ? "checked" : ""} /></td>
        <td><input type="date" class="btDate" data-id="${t.id}" value="${t.date}" /></td>
        <td><input type="text" class="btDesc" data-id="${t.id}" value="${escapeHtml(t.description)}" /></td>
        <td><input type="number" class="btAmount" data-id="${t.id}" value="${t.amount}" min="0" step="1" /></td>
        <td><select class="btType" data-id="${t.id}">
          <option value="debit" ${t.type === "debit" ? "selected" : ""}>Debit</option>
          <option value="credit" ${t.type === "credit" ? "selected" : ""}>Credit</option>
        </select></td>
        <td><select class="btCategory" data-id="${t.id}" ${t.type === "credit" ? "disabled" : ""}>
          <option value="needs" ${t.category === "needs" ? "selected" : ""}>Needs</option>
          <option value="savings" ${t.category === "savings" ? "selected" : ""}>Savings</option>
          <option value="wants" ${t.category === "wants" ? "selected" : ""}>Wants</option>
        </select></td>
        <td><select class="btLinkedDebt" data-id="${t.id}" ${t.type === "credit" ? "disabled" : ""}>
          <option value="">Not a loan EMI</option>
          ${debts.map((d) => `<option value="${d.id}" ${t.linkedDebtId === d.id ? "selected" : ""}>${escapeHtml(d.name)}</option>`).join("")}
        </select></td>
      </tr>`
    )
    .join("");
  updateBtSummary();
}

function updateBtSummary() {
  const included = pendingBankTransactions.filter((t) => t.include);
  const credits = included.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0);
  const debits = included.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0);
  document.getElementById("btSummary").textContent =
    `${included.length} transactions included: ${INR(credits)} in credits, ${INR(debits)} in debits.`;
}

function syncPendingBankTxFromTable() {
  document.querySelectorAll(".btInclude").forEach((el) => {
    const t = pendingBankTransactions.find((x) => x.id === el.dataset.id);
    if (t) t.include = el.checked;
  });
  document.querySelectorAll(".btDate").forEach((el) => {
    const t = pendingBankTransactions.find((x) => x.id === el.dataset.id);
    if (t) t.date = el.value;
  });
  document.querySelectorAll(".btDesc").forEach((el) => {
    const t = pendingBankTransactions.find((x) => x.id === el.dataset.id);
    if (t) t.description = el.value;
  });
  document.querySelectorAll(".btAmount").forEach((el) => {
    const t = pendingBankTransactions.find((x) => x.id === el.dataset.id);
    if (t) t.amount = Number(el.value) || 0;
  });
  document.querySelectorAll(".btType").forEach((el) => {
    const t = pendingBankTransactions.find((x) => x.id === el.dataset.id);
    if (t) t.type = el.value;
  });
  document.querySelectorAll(".btCategory").forEach((el) => {
    const t = pendingBankTransactions.find((x) => x.id === el.dataset.id);
    if (t) t.category = el.value;
  });
  document.querySelectorAll(".btLinkedDebt").forEach((el) => {
    const t = pendingBankTransactions.find((x) => x.id === el.dataset.id);
    if (t) t.linkedDebtId = el.value;
  });
}

function upsertBankAccount(meta) {
  if (!meta.bankName && !meta.accountNumber) return null;
  let acct = meta.accountNumber
    ? cashflow.bankAccounts.find((a) => a.accountNumber && a.accountNumber === meta.accountNumber)
    : null;
  if (!acct) {
    acct = cashflow.bankAccounts.find(
      (a) => a.bankName === meta.bankName && a.accountType === meta.accountType && !meta.accountNumber
    );
  }
  if (!acct) {
    acct = { id: "acct-" + Date.now(), bankName: "", accountNumber: "", accountType: "", currentBalance: 0 };
    cashflow.bankAccounts.push(acct);
  }
  if (meta.bankName) acct.bankName = meta.bankName;
  if (meta.accountNumber) acct.accountNumber = meta.accountNumber;
  if (meta.accountType) acct.accountType = meta.accountType;
  if (meta.closingBalance != null) acct.currentBalance = meta.closingBalance;
  acct.lastUpdatedAt = new Date().toISOString();
  return acct;
}

function saveBankStatementReview() {
  syncPendingBankTxFromTable();
  const month = document.getElementById("btMonth").value;
  if (!month) {
    alert("Please choose a target month.");
    return;
  }

  const accountMeta = {
    bankName: document.getElementById("btBankName").value.trim(),
    accountNumber: document.getElementById("btAccountNumber").value.trim(),
    accountType: document.getElementById("btAccountType").value.trim(),
    closingBalance: document.getElementById("btClosingBalance").value === "" ? null : Number(document.getElementById("btClosingBalance").value),
  };

  const included = pendingBankTransactions.filter((t) => t.include);
  const income = included.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0);
  const expenses = included
    .filter((t) => t.type === "debit")
    .map((t) => ({ name: t.description || "Transaction", category: t.category, amount: t.amount }));

  learnFromTransactions(included);

  cashflow.monthlyLogs = cashflow.monthlyLogs.filter((l) => l.month !== month);
  cashflow.monthlyLogs.push({ id: "log-" + Date.now(), month, income, expenses });

  for (const t of included) {
    if (t.type !== "debit" || !t.linkedDebtId) continue;
    const debt = debts.find((d) => d.id === t.linkedDebtId);
    if (!debt) continue;
    if (!Array.isArray(debt.paymentHistory)) debt.paymentHistory = [];
    debt.paymentHistory.push({
      date: t.date,
      amount: t.amount,
      month,
      description: t.description,
      uploadedAt: new Date().toISOString(),
    });
  }

  const acct = upsertBankAccount(accountMeta);

  cashflow.bankStatements.push({
    id: "bstmt-" + Date.now(),
    month,
    accountName: [accountMeta.bankName, accountMeta.accountNumber].filter(Boolean).join(" "),
    transactionCount: included.length,
    uploadedAt: new Date().toISOString(),
  });

  saveData();
  document.getElementById("bankStatementReview").hidden = true;
  document.getElementById("bankStatementFile").value = "";
  pendingBankTransactions = [];
  pendingBankAccountMeta = { bankName: "", accountNumber: "", accountType: "", closingBalance: null };
  renderCashflowView();
  renderDebtView();
  renderNetWorth();
}

function renderBankStatementHistoryTable() {
  const rows = [...cashflow.bankStatements].sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  document.getElementById("bankStatementHistoryBody").innerHTML =
    rows
      .map(
        (s) => `<tr>
          <td>${s.month}</td>
          <td>${escapeHtml(s.accountName || "-")}</td>
          <td>${s.transactionCount}</td>
          <td>${new Date(s.uploadedAt).toLocaleString("en-IN")}</td>
        </tr>`
      )
      .join("") || `<tr><td colspan="4">No statements uploaded yet.</td></tr>`;
}

// ---------- Cashflow Modals ----------

function openRecurringModal() {
  document.getElementById("rName").value = "";
  document.getElementById("rCategory").value = "needs";
  document.getElementById("rAmount").value = "";
  const select = document.getElementById("rLinkedDebt");
  select.innerHTML =
    `<option value="">Not a loan EMI</option>` +
    debts.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join("");
  document.getElementById("recurringModal").hidden = false;
}

function closeRecurringModal() {
  document.getElementById("recurringModal").hidden = true;
}

function openBudgetSplitAwareLogModal() {
  const list = document.getElementById("mExpenseList");
  list.innerHTML = cashflow.recurringExpenses
    .map(
      (r) => `<label class="expense-row">
        <input type="checkbox" class="mExpenseCheck" data-id="${r.id}" checked />
        <span class="expense-name">${escapeHtml(r.name)} <em>(${r.category})</em></span>
        <input type="number" class="mExpenseAmount" data-id="${r.id}" value="${r.typicalAmount}" min="0" step="1" />
      </label>`
    )
    .join("");
  document.getElementById("mMonth").value = "";
  document.getElementById("mIncome").value = "";
  document.getElementById("monthLogModal").hidden = false;
}

function closeMonthLogModal() {
  document.getElementById("monthLogModal").hidden = true;
}

// ================================================================
// INVESTMENT MANAGEMENT VIEW
// ================================================================

const TAX_SECTION_LIMITS = { "80C": 150000, "80D": 25000, "80CCD(1B)": 50000 };

function guessTaxSection(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("nps")) return "80CCD(1B)";
  if (t.includes("health") || t.includes("mediclaim")) return "80D";
  if (t.includes("elss") || t.includes("epf") || t.includes("ppf") || t.includes("insurance") || t.includes("lic") || t.includes("tuition")) return "80C";
  return "None";
}

function getIndianFY(dateLike) {
  const d = dateLike ? new Date(dateLike) : new Date();
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 3 ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function normalizeInvestment(inv) {
  if (typeof inv.investedAmount !== "number") inv.investedAmount = 0;
  if (typeof inv.currentValue !== "number") inv.currentValue = inv.investedAmount;
  if (typeof inv.folioNumber !== "string") inv.folioNumber = "";
  if (typeof inv.payoutDate !== "string") inv.payoutDate = "";
  if (!Array.isArray(inv.statements)) inv.statements = [];
  if (!inv.contributionsByFY || typeof inv.contributionsByFY !== "object") inv.contributionsByFY = {};
  if (!inv.taxSection) inv.taxSection = guessTaxSection(inv.type);
  return inv;
}

function estimateLockInEnd(inv) {
  if (!inv.investmentDate || !inv.lockInPeriod) return null;
  const match = /(\d+(?:\.\d+)?)\s*year/i.exec(inv.lockInPeriod);
  if (!match) return null;
  const years = parseFloat(match[1]);
  const d = new Date(inv.investmentDate);
  if (isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + Math.round(years * 12));
  return d.toISOString().slice(0, 10);
}

function renderInvestmentView() {
  const totalInvested = investments.reduce((s, i) => s + i.investedAmount, 0);
  const totalCurrent = investments.reduce((s, i) => s + i.currentValue, 0);
  const gain = totalCurrent - totalInvested;
  const gainPct = totalInvested > 0 ? (gain / totalInvested) * 100 : 0;

  document.getElementById("investmentSummaryGrid").innerHTML = [
    ["Holdings", investments.length],
    ["Total Invested", INR(totalInvested)],
    ["Current Value", INR(totalCurrent)],
    ["Gain / Loss", INR(gain)],
    ["Return %", gainPct.toFixed(1) + "%"],
  ].map(([label, value]) => `<div class="summary-card"><div class="label">${label}</div><div class="value">${value}</div></div>`).join("");

  document.getElementById("investmentTableBody").innerHTML =
    investments
      .map((inv) => {
        const g = inv.currentValue - inv.investedAmount;
        const gPct = inv.investedAmount > 0 ? (g / inv.investedAmount) * 100 : 0;
        const estimatedLockInEnd = estimateLockInEnd(inv);
        const payoutDisplay = inv.payoutDate
          ? inv.payoutDate
          : estimatedLockInEnd
          ? `~${estimatedLockInEnd} (est.)`
          : "-";
        return `<tr data-id="${inv.id}">
          <td>${escapeHtml(inv.name)}</td>
          <td>${escapeHtml(inv.type || "")}</td>
          <td>${escapeHtml(inv.folioNumber || "-")}</td>
          <td>${INR(inv.investedAmount)}</td>
          <td>${INR(inv.currentValue)}</td>
          <td class="${g >= 0 ? "positive" : "negative"}">${INR(g)} (${gPct.toFixed(1)}%)</td>
          <td>${inv.investmentDate || "-"}</td>
          <td>${escapeHtml(inv.lockInPeriod || "-")}</td>
          <td>${payoutDisplay}</td>
          <td>${inv.taxSection || "-"}</td>
          <td><button class="row-edit investment-edit" data-id="${inv.id}">Edit</button></td>
        </tr>`;
      })
      .join("") || `<tr><td colspan="11">No investments yet.</td></tr>`;

  renderAllocationChart();
  renderInvestedVsCurrentChart();
  renderInvestmentStatementHistoryTable();
  renderTaxBenefitPanel();
}

function renderAllocationChart() {
  const ctx = document.getElementById("chartAllocation");
  if (allocationChart) allocationChart.destroy();

  const byType = {};
  for (const inv of investments) {
    const key = inv.type || "Other";
    byType[key] = (byType[key] || 0) + inv.currentValue;
  }
  const palette = ["#4f8cff", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#eab308"];

  allocationChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: Object.keys(byType),
      datasets: [{ data: Object.values(byType), backgroundColor: palette }],
    },
    options: { plugins: { legend: { labels: { color: "#e7ebf3" } } } },
  });
}

function renderInvestedVsCurrentChart() {
  const ctx = document.getElementById("chartInvestedVsCurrent");
  if (investedVsCurrentChart) investedVsCurrentChart.destroy();

  investedVsCurrentChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: investments.map((i) => i.name),
      datasets: [
        { label: "Invested", data: investments.map((i) => i.investedAmount), backgroundColor: "#4f8cff" },
        { label: "Current", data: investments.map((i) => i.currentValue), backgroundColor: "#22c55e" },
      ],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { labels: { color: "#e7ebf3" } } },
      scales: {
        x: { ticks: { color: "#8a93a6" }, grid: { color: "#262e42" } },
        y: { ticks: { color: "#e7ebf3" }, grid: { display: false } },
      },
    },
  });
}

// ---------- Investment Statements ----------

let pendingInvestmentStatement = null;

function populateMatchInvestmentSelect(guessFolioNumber, guessName) {
  const select = document.getElementById("isMatchInvestment");
  let matchIndex = guessFolioNumber
    ? investments.findIndex((i) => i.folioNumber && i.folioNumber.toLowerCase() === guessFolioNumber.toLowerCase())
    : -1;
  if (matchIndex === -1 && guessName) {
    const needle = guessName.toLowerCase();
    matchIndex = investments.findIndex(
      (i) => i.name.toLowerCase().includes(needle) || needle.includes(i.name.toLowerCase())
    );
  }
  select.innerHTML =
    `<option value="__new__">+ Create new investment</option>` +
    investments.map((i, idx) => `<option value="${i.id}" ${idx === matchIndex ? "selected" : ""}>${escapeHtml(i.name)}</option>`).join("");
  if (matchIndex === -1) select.value = "__new__";
}

async function handleInvestmentStatementFile(file) {
  const statusEl = document.getElementById("investmentStatementStatus");
  statusEl.hidden = false;
  statusEl.textContent = "Extracting text from PDF...";
  document.getElementById("investmentStatementReview").hidden = true;

  try {
    const text = await extractPdfText(file);
    statusEl.textContent = "Asking AI to read the investment details...";

    const res = await fetch("/api/parse-investment-statement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 12000) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Parsing failed");

    pendingInvestmentStatement = data.fields || {};
    const f = pendingInvestmentStatement;
    document.getElementById("isFolioNumber").value = f.folioNumber || "";
    document.getElementById("isFundType").value = [f.fundName, f.investmentType].filter(Boolean).join(" - ");
    document.getElementById("isStatementDate").value = f.statementDate || "";
    document.getElementById("isCurrentValue").value = f.currentValue ?? "";
    document.getElementById("isInvestedThisStatement").value = f.investedAmountThisStatement ?? "";
    document.getElementById("isMaturityDate").value = f.maturityDate || "";
    document.getElementById("isTaxSection").value = f.taxSection || "";
    populateMatchInvestmentSelect(f.folioNumber, f.fundName);

    statusEl.hidden = true;
    document.getElementById("investmentStatementReview").hidden = false;
  } catch (err) {
    statusEl.hidden = false;
    statusEl.textContent = "Couldn't read this statement: " + err.message +
      " (requires the /api/parse-investment-statement serverless function deployed with GEMINI_API_KEY set).";
  }
}

function saveInvestmentStatementReview() {
  const matchId = document.getElementById("isMatchInvestment").value;
  const statementDate = document.getElementById("isStatementDate").value;
  const entry = {
    folioNumber: document.getElementById("isFolioNumber").value.trim(),
    fundType: document.getElementById("isFundType").value.trim(),
    statementDate,
    currentValue: document.getElementById("isCurrentValue").value === "" ? null : Number(document.getElementById("isCurrentValue").value),
    investedThisStatement: document.getElementById("isInvestedThisStatement").value === "" ? null : Number(document.getElementById("isInvestedThisStatement").value),
    maturityDate: document.getElementById("isMaturityDate").value,
    taxSection: document.getElementById("isTaxSection").value,
    uploadedAt: new Date().toISOString(),
  };

  let inv;
  if (matchId === "__new__") {
    inv = normalizeInvestment({
      id: "inv-" + Date.now(),
      name: entry.fundType || entry.folioNumber || "New Investment",
      type: entry.fundType || "",
      folioNumber: entry.folioNumber,
      investedAmount: entry.investedThisStatement || 0,
      currentValue: entry.currentValue || entry.investedThisStatement || 0,
      investmentDate: statementDate || "",
      lockInPeriod: "",
      payoutDate: entry.maturityDate,
      taxSection: entry.taxSection,
      contributionsByFY: {},
    });
    investments.push(inv);
  } else {
    inv = investments.find((i) => i.id === matchId);
  }

  inv.statements.push(entry);

  if (document.getElementById("isApplyToInvestment").checked && matchId !== "__new__") {
    if (entry.currentValue != null) inv.currentValue = entry.currentValue;
    if (entry.maturityDate) inv.payoutDate = entry.maturityDate;
    if (entry.folioNumber) inv.folioNumber = entry.folioNumber;
    if (entry.taxSection) inv.taxSection = entry.taxSection;
    if (entry.investedThisStatement != null && statementDate) {
      const fy = getIndianFY(statementDate);
      inv.contributionsByFY[fy] = entry.investedThisStatement;
      inv.investedAmount = Object.values(inv.contributionsByFY).reduce((s, v) => s + v, 0) || inv.investedAmount;
    }
  }

  saveData();
  document.getElementById("investmentStatementReview").hidden = true;
  document.getElementById("investmentStatementFile").value = "";
  pendingInvestmentStatement = null;
  renderInvestmentView();
  renderNetWorth();
}

function renderInvestmentStatementHistoryTable() {
  const rows = [];
  for (const inv of investments) {
    for (const s of inv.statements || []) {
      rows.push({ invName: inv.name, ...s });
    }
  }
  rows.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  document.getElementById("investmentStatementHistoryBody").innerHTML =
    rows
      .map(
        (r) => `<tr>
          <td>${escapeHtml(r.invName)}</td>
          <td>${escapeHtml(r.folioNumber || "-")}</td>
          <td>${r.statementDate || "-"}</td>
          <td>${r.currentValue != null ? INR(r.currentValue) : "-"}</td>
          <td>${r.investedThisStatement != null ? INR(r.investedThisStatement) : "-"}</td>
          <td>${r.maturityDate || "-"}</td>
          <td>${new Date(r.uploadedAt).toLocaleString("en-IN")}</td>
        </tr>`
      )
      .join("") || `<tr><td colspan="7">No statements uploaded yet.</td></tr>`;
}

// ---------- Tax Benefit Panel ----------

let taxSelectedFY = null;
let taxSelectedRegime = "old";

function renderTaxBenefitPanel() {
  const fySet = new Set([getIndianFY()]);
  investments.forEach((inv) => Object.keys(inv.contributionsByFY || {}).forEach((fy) => fySet.add(fy)));
  const fys = [...fySet].sort();
  if (!taxSelectedFY || !fys.includes(taxSelectedFY)) taxSelectedFY = fys[fys.length - 1];

  const fySelect = document.getElementById("taxFySelect");
  fySelect.innerHTML = fys.map((fy) => `<option value="${fy}" ${fy === taxSelectedFY ? "selected" : ""}>FY ${fy}</option>`).join("");
  document.getElementById("taxRegimeSelect").value = taxSelectedRegime;

  const noteEl = document.getElementById("taxRegimeNote");
  if (taxSelectedRegime === "new") {
    noteEl.textContent = "Under the New Tax Regime, 80C / 80D / 80CCD(1B) deductions generally aren't available — utilization is shown as ₹0. (Employer NPS contributions under 80CCD(2) still apply but aren't tracked here.)";
  } else {
    noteEl.textContent = "Old Regime section limits shown below reflect standard slabs — actual eligibility can vary (e.g. 80D limits differ by age). Consult a CA for filing.";
  }

  const utilized = { "80C": 0, "80D": 0, "80CCD(1B)": 0 };
  if (taxSelectedRegime === "old") {
    for (const inv of investments) {
      const amt = (inv.contributionsByFY || {})[taxSelectedFY] || 0;
      if (utilized[inv.taxSection] != null) utilized[inv.taxSection] += amt;
    }
  }

  document.getElementById("taxBenefitTableBody").innerHTML = Object.entries(TAX_SECTION_LIMITS)
    .map(([section, limit]) => {
      const used = Math.min(utilized[section] || 0, limit);
      const remaining = Math.max(0, limit - used);
      const pct = Math.min(100, Math.round((used / limit) * 100));
      return `<tr>
        <td>${section}</td>
        <td>${INR(used)}</td>
        <td>${INR(limit)}</td>
        <td>${INR(remaining)}</td>
        <td><div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div> ${pct}%</td>
      </tr>`;
    })
    .join("");
}

async function getInvestmentAiCommentary() {
  const box = document.getElementById("investmentAiCommentary");
  box.hidden = false;
  box.className = "ai-commentary loading";
  box.textContent = "Asking AI to review your portfolio...";

  try {
    const res = await fetch("/api/investment-insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        investments: investments.map((i) => ({
          name: i.name, type: i.type, investedAmount: i.investedAmount,
          currentValue: i.currentValue, investmentDate: i.investmentDate, lockInPeriod: i.lockInPeriod,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    box.className = "ai-commentary";
    box.textContent = data.commentary;
  } catch (err) {
    box.className = "ai-commentary error";
    box.textContent = "Couldn't get AI insights: " + err.message + "\n\n(This requires the /api/investment-insights serverless function to be deployed with a GEMINI_API_KEY set.)";
  }
}

// ---------- Investment Modal ----------

function openInvestmentModal(inv) {
  document.getElementById("investmentModalTitle").textContent = inv ? "Edit Investment" : "Add Investment";
  document.getElementById("iId").value = inv ? inv.id : "";
  document.getElementById("iName").value = inv ? inv.name : "";
  document.getElementById("iType").value = inv ? inv.type || "" : "";
  document.getElementById("iFolioNumber").value = inv ? inv.folioNumber || "" : "";
  document.getElementById("iInvested").value = inv ? inv.investedAmount : "";
  document.getElementById("iCurrent").value = inv ? inv.currentValue : "";
  document.getElementById("iDate").value = inv ? inv.investmentDate || "" : "";
  document.getElementById("iLockIn").value = inv ? inv.lockInPeriod || "" : "";
  document.getElementById("iPayoutDate").value = inv ? inv.payoutDate || "" : "";
  document.getElementById("iTaxSection").value = inv ? inv.taxSection || "" : "";
  document.getElementById("iNotes").value = inv ? inv.notes || "" : "";
  document.getElementById("btnDeleteInvestment").hidden = !inv;

  const historyBox = document.getElementById("iStatementHistory");
  const statements = inv && Array.isArray(inv.statements) ? inv.statements : [];
  if (statements.length === 0) {
    historyBox.innerHTML = "";
  } else {
    const rows = [...statements]
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      .map((s) => `<tr><td>${s.statementDate || "-"}</td><td>${s.currentValue != null ? INR(s.currentValue) : "-"}</td><td>${s.maturityDate || "-"}</td></tr>`)
      .join("");
    historyBox.innerHTML = `<div>Statement history (${statements.length})</div>
      <table><thead><tr><th>Date</th><th>Value</th><th>Maturity</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  document.getElementById("investmentModal").hidden = false;
}

function closeInvestmentModal() {
  document.getElementById("investmentModal").hidden = true;
}

// ================================================================
// EVENT BINDING
// ================================================================

function bindEvents() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  document.getElementById("btnExport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ debts, cashflow, investments }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "financial-portal-export.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        debts = parsed.map(recalc);
      } else {
        if (Array.isArray(parsed.debts)) debts = parsed.debts.map(recalc);
        if (parsed.cashflow) cashflow = parsed.cashflow;
        if (Array.isArray(parsed.investments)) investments = parsed.investments;
      }
      saveData();
      renderAll();
    } catch (err) {
      alert("Import failed: " + err.message);
    }
  });

  // ---- Debt view events ----
  document.getElementById("btnAddDebt").addEventListener("click", () => openModal(null));
  document.getElementById("btnCancelModal").addEventListener("click", closeModal);

  document.getElementById("debtForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("fId").value;
    const payload = {
      name: document.getElementById("fName").value.trim(),
      type: document.getElementById("fType").value.trim(),
      loanNumber: document.getElementById("fLoanNumber").value.trim(),
      totalAmount: Number(document.getElementById("fTotal").value) || 0,
      pendingAmount: Number(document.getElementById("fPending").value) || 0,
      monthlyPayment: Number(document.getElementById("fMonthly").value) || 0,
      pendingEmis: Number(document.getElementById("fEmis").value) || 0,
      interestRate: Number(document.getElementById("fRate").value) || 0,
      totalEmis: 0,
    };
    if (id) {
      const existing = debts.find((d) => d.id === id);
      Object.assign(existing, payload);
      existing.totalEmis = existing.totalEmis || 0;
      recalc(existing);
    } else {
      const newDebt = recalc({ id: "d-" + Date.now(), ...payload });
      debts.push(newDebt);
    }
    saveData();
    closeModal();
    renderAll();
  });

  document.getElementById("btnDeleteDebt").addEventListener("click", () => {
    const id = document.getElementById("fId").value;
    debts = debts.filter((d) => d.id !== id);
    saveData();
    closeModal();
    renderAll();
  });

  document.getElementById("debtTableBody").addEventListener("click", (e) => {
    const btn = e.target.closest(".row-edit");
    if (!btn) return;
    const debt = debts.find((d) => d.id === btn.dataset.id);
    if (debt) openModal(debt);
  });

  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      renderTable();
    });
  });

  document.getElementById("btnSimulate").addEventListener("click", runSimulationUI);
  document.getElementById("btnAiCommentary").addEventListener("click", getAiCommentary);

  document.getElementById("statementFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleStatementFile(file);
  });

  document.getElementById("statementForm").addEventListener("submit", (e) => {
    e.preventDefault();
    saveStatementReview();
  });

  document.getElementById("btnCancelStatement").addEventListener("click", () => {
    document.getElementById("statementReview").hidden = true;
    document.getElementById("statementFile").value = "";
    pendingStatement = null;
  });

  // ---- Cashflow view events ----
  document.getElementById("budgetSplitForm").addEventListener("submit", (e) => {
    e.preventDefault();
    cashflow.budgetSplit = {
      needs: Number(document.getElementById("bNeeds").value) || 0,
      savings: Number(document.getElementById("bSavings").value) || 0,
      wants: Number(document.getElementById("bWants").value) || 0,
    };
    saveData();
    renderCashflowView();
  });

  document.getElementById("btnAddRecurring").addEventListener("click", openRecurringModal);
  document.getElementById("btnCancelRecurringModal").addEventListener("click", closeRecurringModal);

  document.getElementById("recurringForm").addEventListener("submit", (e) => {
    e.preventDefault();
    cashflow.recurringExpenses.push({
      id: "rec-" + Date.now(),
      name: document.getElementById("rName").value.trim(),
      category: document.getElementById("rCategory").value,
      typicalAmount: Number(document.getElementById("rAmount").value) || 0,
      linkedDebtId: document.getElementById("rLinkedDebt").value,
    });
    saveData();
    closeRecurringModal();
    renderCashflowView();
  });

  document.getElementById("recurringTableBody").addEventListener("click", (e) => {
    const btn = e.target.closest(".recurring-delete");
    if (!btn) return;
    cashflow.recurringExpenses = cashflow.recurringExpenses.filter((r) => r.id !== btn.dataset.id);
    saveData();
    renderCashflowView();
  });

  document.getElementById("btnAddMonthLog").addEventListener("click", openBudgetSplitAwareLogModal);
  document.getElementById("btnCancelMonthLogModal").addEventListener("click", closeMonthLogModal);

  document.getElementById("monthLogForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const month = document.getElementById("mMonth").value;
    const income = Number(document.getElementById("mIncome").value) || 0;
    const expenses = [];
    document.querySelectorAll(".mExpenseCheck").forEach((cb) => {
      if (!cb.checked) return;
      const rec = cashflow.recurringExpenses.find((r) => r.id === cb.dataset.id);
      const amountInput = document.querySelector(`.mExpenseAmount[data-id="${cb.dataset.id}"]`);
      const amount = Number(amountInput.value) || 0;
      if (rec) expenses.push({ name: rec.name, category: rec.category, amount });
    });
    cashflow.monthlyLogs = cashflow.monthlyLogs.filter((l) => l.month !== month);
    cashflow.monthlyLogs.push({ id: "log-" + Date.now(), month, income, expenses });
    saveData();
    closeMonthLogModal();
    renderCashflowView();
  });

  document.getElementById("monthlyLogTableBody").addEventListener("click", (e) => {
    const btn = e.target.closest(".month-log-delete");
    if (!btn) return;
    cashflow.monthlyLogs = cashflow.monthlyLogs.filter((l) => l.id !== btn.dataset.id);
    saveData();
    renderCashflowView();
  });

  document.getElementById("btnCashflowAi").addEventListener("click", getCashflowAiCommentary);

  document.getElementById("bankStatementFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleBankStatementFile(file);
  });

  document.getElementById("btTransactionTableBody").addEventListener("change", () => {
    syncPendingBankTxFromTable();
    updateBtSummary();
    document.querySelectorAll(".btType").forEach((el) => {
      const row = el.closest("tr");
      row.querySelector(".btCategory").disabled = el.value === "credit";
      row.querySelector(".btLinkedDebt").disabled = el.value === "credit";
    });
  });

  document.getElementById("btnSaveBankStatement").addEventListener("click", saveBankStatementReview);

  document.getElementById("btnCancelBankStatement").addEventListener("click", () => {
    document.getElementById("bankStatementReview").hidden = true;
    document.getElementById("bankStatementFile").value = "";
    pendingBankTransactions = [];
    pendingBankAccountMeta = { bankName: "", accountNumber: "", accountType: "", closingBalance: null };
  });

  // ---- Investment view events ----
  document.getElementById("btnAddInvestment").addEventListener("click", () => openInvestmentModal(null));
  document.getElementById("btnCancelInvestmentModal").addEventListener("click", closeInvestmentModal);

  document.getElementById("investmentForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("iId").value;
    const payload = {
      name: document.getElementById("iName").value.trim(),
      type: document.getElementById("iType").value.trim(),
      folioNumber: document.getElementById("iFolioNumber").value.trim(),
      investedAmount: Number(document.getElementById("iInvested").value) || 0,
      currentValue: Number(document.getElementById("iCurrent").value) || 0,
      investmentDate: document.getElementById("iDate").value,
      lockInPeriod: document.getElementById("iLockIn").value.trim(),
      payoutDate: document.getElementById("iPayoutDate").value,
      taxSection: document.getElementById("iTaxSection").value,
      notes: document.getElementById("iNotes").value.trim(),
    };
    if (id) {
      Object.assign(investments.find((i) => i.id === id), payload);
    } else {
      investments.push(normalizeInvestment({ id: "inv-" + Date.now(), ...payload }));
    }
    saveData();
    closeInvestmentModal();
    renderInvestmentView();
    renderNetWorth();
  });

  document.getElementById("btnDeleteInvestment").addEventListener("click", () => {
    const id = document.getElementById("iId").value;
    investments = investments.filter((i) => i.id !== id);
    saveData();
    closeInvestmentModal();
    renderInvestmentView();
    renderNetWorth();
  });

  document.getElementById("investmentTableBody").addEventListener("click", (e) => {
    const btn = e.target.closest(".investment-edit");
    if (!btn) return;
    const inv = investments.find((i) => i.id === btn.dataset.id);
    if (inv) openInvestmentModal(inv);
  });

  document.getElementById("btnInvestmentAi").addEventListener("click", getInvestmentAiCommentary);

  document.getElementById("investmentStatementFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleInvestmentStatementFile(file);
  });

  document.getElementById("investmentStatementForm").addEventListener("submit", (e) => {
    e.preventDefault();
    saveInvestmentStatementReview();
  });

  document.getElementById("btnCancelInvestmentStatement").addEventListener("click", () => {
    document.getElementById("investmentStatementReview").hidden = true;
    document.getElementById("investmentStatementFile").value = "";
    pendingInvestmentStatement = null;
  });

  document.getElementById("taxFySelect").addEventListener("change", (e) => {
    taxSelectedFY = e.target.value;
    renderTaxBenefitPanel();
  });

  document.getElementById("taxRegimeSelect").addEventListener("change", (e) => {
    taxSelectedRegime = e.target.value;
    renderTaxBenefitPanel();
  });
}

bindEvents();
renderAll();
