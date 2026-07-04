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

  const { investments } = req.body || {};
  if (!Array.isArray(investments)) {
    res.status(400).json({ error: "Missing investment data" });
    return;
  }

  const prompt = `You are a personal finance coach reviewing someone's investment portfolio (not a licensed
financial advisor — keep this informational, framed as observations, not formal recommendations).

Holdings: ${JSON.stringify(investments)}

In under 180 words: comment on concentration/diversification across the listed types, note anything that stands
out (e.g. very similar overlapping funds, large idle cash-like holdings, lock-ins clustering at the same maturity),
and suggest one concrete thing worth reviewing. Speak plainly, use ₹ for amounts, no generic disclaimers about
"consult a financial advisor" beyond a single short closing line.`;

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      res.status(502).json({ error: `Gemini API error: ${errText}` });
      return;
    }

    const data = await response.json();
    const commentary = data.candidates?.[0]?.content?.parts?.[0]?.text || "No commentary returned.";
    res.status(200).json({ commentary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
