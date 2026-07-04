const STORAGE_KEY = "debtPortalData";
const INR = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

let debts = loadData();
let currentFilter = "all";
let lastSimulation = null;
let paidPendingChart, byDebtChart, simChart;

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEBT_SEED));
  if (!raw) localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  parsed.forEach((d) => {
    if (!Array.isArray(d.statements)) d.statements = [];
    if (typeof d.loanNumber !== "string") d.loanNumber = "";
  });
  return parsed;
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(debts));
}

function recalc(d) {
  d.completionPct = d.totalAmount > 0 ? Math.max(0, Math.min(1, (d.totalAmount - d.pendingAmount) / d.totalAmount)) : 1;
  if (!Array.isArray(d.statements)) d.statements = [];
  if (typeof d.loanNumber !== "string") d.loanNumber = "";
  return d;
}

function isActive(d) { return d.pendingAmount > 0; }

function render() {
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
    let freedMinPayments = 0;
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
  render();
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

// ---------- Modal ----------

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

  modal.hidden = false;
}

function closeModal() {
  document.getElementById("debtModal").hidden = true;
}

function bindEvents() {
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
    render();
  });

  document.getElementById("btnDeleteDebt").addEventListener("click", () => {
    const id = document.getElementById("fId").value;
    debts = debts.filter((d) => d.id !== id);
    saveData();
    closeModal();
    render();
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

  document.getElementById("btnExport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(debts, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "debt-portal-export.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of debts");
      debts = parsed.map(recalc);
      saveData();
      render();
    } catch (err) {
      alert("Import failed: " + err.message);
    }
  });

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
}

bindEvents();
render();
