# Gravity

A static personal finance portal with four views: Debt, Cashflow, Investment, and Taxation management.

- **Debt Management**: debt list, payoff simulator (snowball/avalanche), PDF loan statement upload with AI extraction.
- **Cashflow Management**: monthly income/expense logging, 50/20/30-style budget rule vs actual, recurring expense templates, net cashflow trend, an Accounts dashboard (bank logo badge, account name/number/type/balance, auto-detected from statements), and bank/card statement PDF upload that extracts transactions and merges them into a month's log. Categorization **learns from your corrections**: every category (and debit/credit type) you confirm or fix during review is remembered by a normalized merchant key, so the next statement auto-suggests it instead of falling back to a generic default. Recurring templates and individual transactions can be **linked to a specific debt** (e.g. "HDFC EMI" → the HDFC Loan record); linked bank-detected payments then flow into Debt Management's payment history, and "This Month's Known EMI Outflows" shows the expected amount, the last actual payment detected, and a Paid/Not-detected/Amount-mismatch status per debt — reconciling bank statements against loan statements automatically.
- **Investment Management**: holdings tracker (invested vs current value, gain/loss), folio/policy number + payout/maturity date tracking, PDF investment statement upload with AI extraction, per-financial-year Tax Benefit panel (80C/80D/80CCD(1B) vs Old/New regime), allocation chart, AI portfolio insights.
- **Taxation**: year-on-year filed return (ITR) tracker — upload a filed ITR PDF (ITR-V, full form, or 143(1) intimation) and AI extracts the assessment year, income, deductions, tax paid and refund; shows a YoY table and income/tax trend chart. One row per assessment year (re-uploading the same AY replaces it); manual add/edit also supported.
- A **Net Worth** strip (Investments + Cash − Pending Debt − Credit Card Dues) is always visible in the header across all views.

- **Frontend**: plain HTML/CSS/JS, no build step, no framework. Charts via Chart.js (CDN). PDF text extraction via PDF.js (CDN).
- **Data**: starts empty and lives in `localStorage` (single object: `{ debts, cashflow, investments, taxation }`); populate it by adding records in the app or uploading statement PDFs. Use Export/Import to back up or move data between browsers/devices.
- **Simulator**: snowball vs avalanche payoff simulation, runs entirely client-side.
- **AI features** (`/api/ai-commentary.js`, `/api/parse-statement.js`, `/api/cashflow-insights.js`, `/api/investment-insights.js`, `/api/parse-investment-statement.js`, `/api/parse-bank-statement.js`, `/api/parse-tax-return.js`): Vercel serverless functions that call the **Google Gemini API** (free tier, no credit card needed). Requires a `GEMINI_API_KEY` environment variable set in the Vercel project — never commit the key.

## Run locally

No build step needed — just open `index.html` in a browser. The AI buttons won't work locally unless you also run it through Vercel's dev server (`vercel dev`, requires Node + Vercel CLI installed separately), since they need the serverless functions.

## Get a free Gemini API key

1. Go to https://aistudio.google.com/apikey and sign in with a Google account.
2. Click **Create API key** — no credit card or billing setup required for the free tier.
3. Copy the key (starts with `AIza...`).

## Deploy to Vercel (recommended path, no local Node needed)

1. Push this folder to a GitHub repository:
   ```
   git init
   git add .
   git commit -m "Debt freedom portal"
   git remote add origin <your-empty-github-repo-url>
   git push -u origin main
   ```
2. Go to https://vercel.com/new and import that GitHub repo. Vercel auto-detects it as a static site with an `/api` function — no build command required.
3. In the Vercel project's **Settings → Environment Variables**, add `GEMINI_API_KEY` with the key from above.
4. Deploy. Your portal will be live at `<project>.vercel.app`.

## Notes on the data

The app ships with no pre-seeded data — every browser starts with empty views and a default 50/20/30 budget split. Browsers that already have data in `localStorage` keep it (seeds only apply on first load or after clearing site data). Interest rates default to 0% on debts — fill them in per-debt (via Edit) for a true avalanche ordering; otherwise avalanche and snowball produce the same order.
