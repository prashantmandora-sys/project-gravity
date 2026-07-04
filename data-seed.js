// Seed data imported from "My Finances.xlsx" -> Debts sheet (one-time import).
// After first load this is copied into localStorage; edit debts in the app from then on.
const DEBT_SEED = [
  { name: "TVS Credit - iPhone Air", type: "Consumer Loan", totalAmount: 62000, totalEmis: 12, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 5200, interestRate: 0 },
  { name: "Home Loan - Residence", type: "Home Loan", totalAmount: 9720000, totalEmis: 360, pendingAmount: 3321000, pendingEmis: 123, monthlyPayment: 27000, interestRate: 0 },
  { name: "ICICI CC Loan", type: "Credit Card Loan", totalAmount: 200000, totalEmis: 36, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "Bajaj Finance Flexi Loan", type: "Personal Loan", totalAmount: 0, totalEmis: 0, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "Home Loan - Flat", type: "Home Loan", totalAmount: 1143000, totalEmis: 360, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "Consumer Loan - TV", type: "IDFC Consumer", totalAmount: 40008, totalEmis: 12, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "Furniture - New House", type: "CRED Loan", totalAmount: 254844, totalEmis: 36, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "Possession Payment", type: "CRED Loan", totalAmount: 42780, totalEmis: 6, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "Gajju", type: "Favour", totalAmount: 25000, totalEmis: 0, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "CRED - 80,000/-", type: "Personal Loan", totalAmount: 85000, totalEmis: 9, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "Motorola G82", type: "Consumer Loan", totalAmount: 20000, totalEmis: 7, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "Hyundai i20", type: "Car Loan", totalAmount: 771288, totalEmis: 84, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "Expense", type: "Bajaj Finance", totalAmount: 75000, totalEmis: 12, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "Furniture", type: "CC - 09/11/21", totalAmount: 40000, totalEmis: 2, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "Kotak Loan - Mahesh", type: "Personal Loan", totalAmount: 366183, totalEmis: 61, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "HDFC Loan", type: "Personal Loan", totalAmount: 292896, totalEmis: 48, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "ICICI Loan", type: "Personal Loan", totalAmount: 146448, totalEmis: 24, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "Gajju", type: "Favour", totalAmount: 20000, totalEmis: 0, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "Kotak Loan - Self", type: "Personal Loan", totalAmount: 38616, totalEmis: 12, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "ICICI CC", type: "CC Loan", totalAmount: 97200, totalEmis: 36, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "ICICI CC", type: "CC Loan", totalAmount: 61200, totalEmis: 36, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "ICICI CC", type: "CC Loan", totalAmount: 10500, totalEmis: 3, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "HDFC CC", type: "CC Loan", totalAmount: 4800, totalEmis: 12, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "Car", type: "Car", totalAmount: 35000, totalEmis: 4, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "HDFC CC", type: "CC Loan", totalAmount: 33600, totalEmis: 12, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "Pradeep LIC", type: "LIC", totalAmount: 4000, totalEmis: 4, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "Naukri Portal", type: "CC EMI", totalAmount: 13200, totalEmis: 3, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 },
  { name: "CashE", type: "Personal Loan", totalAmount: 20000, totalEmis: 3, pendingAmount: 0, pendingEmis: 0, monthlyPayment: 0, interestRate: 0 }
].map((d, i) => ({
  id: `seed-${i + 1}`,
  loanNumber: "",
  statements: [],
  ...d,
  completionPct: d.totalAmount > 0 ? Math.max(0, Math.min(1, (d.totalAmount - d.pendingAmount) / d.totalAmount)) : 1
}));
