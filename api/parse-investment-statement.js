// Vercel serverless function (Node runtime). Deploy with GEMINI_API_KEY set as an
// environment variable in the Vercel project settings — never commit the key itself.
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server" });
    return;
  }

  const { text } = req.body || {};
  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "Missing statement text" });
    return;
  }

  const prompt = `You extract structured data from investment statement text (mutual fund, insurance, EPF/PPF,
NPS, fixed deposit, stock/demat, or any other investment statement — OCR/PDF-extracted, so it may have odd spacing).
Read the statement below and return a JSON object with exactly these keys:

{
  "folioNumber": string or null (folio number, policy number, PRAN, account number — whatever this statement's unique identifier is),
  "fundName": string or null (scheme/fund/policy/plan name, or the institution name),
  "investmentType": string or null (e.g. "Mutual Fund - ELSS", "Insurance", "EPF", "NPS", "Fixed Deposit", "Stock"),
  "statementDate": string or null (YYYY-MM-DD, the statement's as-of/generation date),
  "currentValue": number or null (current market value / fund value / surrender value / balance as of statement date),
  "investedAmountThisStatement": number or null (a contribution/premium/investment amount explicitly shown as paid
    during the period this statement covers — NOT the cumulative lifetime total, only if the statement clearly
    states a specific amount invested/contributed in this period),
  "maturityDate": string or null (YYYY-MM-DD — maturity date, lock-in end date, or expected payout date if stated),
  "taxSection": string or null (only if the statement explicitly says this qualifies under a section, e.g. "80C",
    "80D", "80CCD(1B)" — otherwise null, do not guess),
  "summary": string (one line summarizing this statement)
}

If a field isn't present or clearly derivable from the text, use null. Do not fabricate values.

STATEMENT TEXT:
"""
${text}
"""`;

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      res.status(502).json({ error: `Gemini API error: ${errText}` });
      return;
    }

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    let fields;
    try {
      fields = JSON.parse(raw);
    } catch {
      res.status(502).json({ error: "AI response wasn't valid JSON", raw });
      return;
    }

    res.status(200).json({ fields });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
