# Gravity

A static personal finance portal with three views, seeded from `My Finances.xlsx`.

- **Debt Management**: debt list, payoff simulator (snowball/avalanche), PDF loan statement upload with AI extraction.
- **Cashflow Management**: monthly income/expense logging, 50/20/30-style budget rule vs actual, recurring expense templates, EMI outflows pulled live from Debt Management, net cashflow trend.
- **Investment Management**: holdings tracker (invested vs current value, gain/loss), allocation chart, AI portfolio insights.
- A **Net Worth** strip (Investments − Pending Debt) is always visible in the header across all views.

- **Frontend**: plain HTML/CSS/JS, no build step, no framework. Charts via Chart.js (CDN). PDF text extraction via PDF.js (CDN).
- **Data**: seeded once from `data-seed.js` into `localStorage` (single object: `{ debts, cashflow, investments }`); edit/add/delete in the app from then on. Use Export/Import to back up or move data between browsers/devices.
- **Simulator**: snowball vs avalanche payoff simulation, runs entirely client-side.
- **AI features** (`/api/ai-commentary.js`, `/api/parse-statement.js`, `/api/cashflow-insights.js`, `/api/investment-insights.js`): Vercel serverless functions that call the **Google Gemini API** (free tier, no credit card needed). Requires a `GEMINI_API_KEY` environment variable set in the Vercel project — never commit the key.

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

- **Debts**: only "Home Loan - Residence" was still active (₹33,21,000 pending) when imported; the other 27 debts were already fully paid off. Interest rates weren't in the source spreadsheet, so they default to 0% — fill them in per-debt (via Edit) for a true avalanche ordering; otherwise avalanche and snowball produce the same order.
- **Investments**: seeded from the Investments sheet (11 holdings, ELSS funds + LIC + Life Insurance + EPF). The sheet had no market-value column, so Current Value defaults to Invested Amount on import — update it per-holding as you check actual NAV/statements.
- **Cashflow**: the Monthly sheet had no years and inconsistent categories month to month, so historical months weren't auto-imported. Instead, the 50/20/30 sheet's budget split and common recurring expenses (HDFC EMI, Home, LIC, etc.) were seeded as quick-add templates — log real months going forward via "+ Log a Month".
