// Vercel serverless function (Node runtime). Deploy with GEMINI_API_KEY set as an
// environment variable in the Vercel project settings — never commit the key itself.
// Get a free key (no credit card needed) at https://aistudio.google.com/apikey
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

  const prompt = `You extract structured data from loan/credit statement text (OCR/PDF-extracted, so it may have
odd spacing). Read the statement below and return a JSON object with exactly these keys:

{
  "loanNumber": string or null,
  "lenderName": string or null,
  "loanType": string or null (e.g. "Home Loan", "Personal Loan", "Credit Card"),
  "statementDate": string or null (YYYY-MM-DD),
  "originalLoanAmount": number or null,
  "outstandingBalance": number or null,
  "emiAmount": number or null,
  "nextDueDate": string or null (YYYY-MM-DD),
  "interestRate": number or null (annual percent, e.g. 8.5),
  "pendingEmis": number or null,
  "recentTransactions": [{"date": string, "description": string, "amount": number}] (up to 10, omit if none found),
  "summary": string (one line summarizing this statement)
}

If a field isn't present in the text, use null. Do not guess values that aren't supported by the text.

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
