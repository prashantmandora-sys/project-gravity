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

  const prompt = `You extract transactions from a bank or credit card statement (OCR/PDF-extracted, so it may have
odd spacing or line breaks). Read the statement below and return a JSON object with exactly these keys:

{
  "bankName": string or null (issuing bank, e.g. "HDFC Bank", "ICICI Bank"),
  "accountName": string or null (account holder name or account nickname, if shown),
  "accountNumber": string or null (masked/last-4 account or card number as printed, e.g. "XXXX1234"),
  "accountType": string or null (e.g. "Savings", "Current", "Credit Card"),
  "closingBalance": number or null (the statement's closing/current balance, if shown),
  "statementPeriodStart": string or null (YYYY-MM-DD),
  "statementPeriodEnd": string or null (YYYY-MM-DD),
  "transactions": [
    { "date": "YYYY-MM-DD", "description": string, "amount": number (always positive), "type": "debit" or "credit" }
  ]
}

Rules:
- Include every individual transaction line you can find, up to 200. Skip opening/closing balance lines, page
  headers/footers, and summary totals — only real transactions.
- "debit" = money out (purchases, EMI payments, withdrawals, fees). "credit" = money in (salary, refunds, deposits,
  interest received).
- Keep descriptions as they appear (merchant/narration text), trimmed of extra whitespace.
- If a transaction's date is ambiguous, use the statement's evident date format consistently.
- Do not fabricate account details that aren't present in the text — use null.

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
