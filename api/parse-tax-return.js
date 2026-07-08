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
    res.status(400).json({ error: "Missing return text" });
    return;
  }

  const prompt = `You extract structured data from an Indian filed income tax return document (ITR-V acknowledgment,
full ITR form, or intimation u/s 143(1) — OCR/PDF-extracted, so it may have odd spacing). Read the document below
and return a JSON object with exactly these keys:

{
  "assessmentYear": string or null (e.g. "2025-26"),
  "financialYear": string or null (e.g. "2024-25"),
  "itrForm": string or null (e.g. "ITR-1", "ITR-2"),
  "filingDate": string or null (YYYY-MM-DD),
  "acknowledgmentNumber": string or null,
  "regime": "old" or "new" or null (tax regime, only if stated or clearly inferable e.g. from 115BAC opt-in),
  "grossTotalIncome": number or null,
  "totalDeductions": number or null (total Chapter VI-A deductions),
  "taxableIncome": number or null (total income after deductions),
  "totalTaxPaid": number or null (total taxes paid: TDS + TCS + advance + self-assessment),
  "tdsAmount": number or null,
  "refundAmount": number or null (refund claimed/issued; null or 0 if none),
  "taxDue": number or null (additional tax payable, if any),
  "summary": string (one line summarizing this return)
}

If a field isn't present or clearly derivable, use null. Do not fabricate values. Amounts are in INR — strip
commas and currency symbols.

DOCUMENT TEXT:
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
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingBudget: 0 },
          },
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
