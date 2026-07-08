// Default (empty) starting data. The portal is populated through the app itself:
// add debts/investments manually or upload statement PDFs; log months in Cashflow;
// upload filed ITRs in Taxation. Existing browsers keep whatever is already in
// localStorage — these seeds only apply on first load or after clearing site data.
const DEBT_SEED = [];

const INVESTMENT_SEED = [];

const CASHFLOW_SEED = {
  budgetSplit: { needs: 50, savings: 20, wants: 30 },
  recurringExpenses: [],
  monthlyLogs: [],
  bankStatements: [],
  categoryMappings: {},
  bankAccounts: [],
};

const TAXATION_SEED = {
  returns: [],
};
