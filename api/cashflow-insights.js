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

  const { budgetSplit, monthlyLogs, upcomingEmiOutflows } = req.body || {};
  if (!Array.isArray(monthlyLogs)) {
    res.status(400).json({ error: "Missing monthly log data" });
    return;
  }

  const prompt = `You are a personal finance coach reviewing someone's income/expense history.

Target budget split: Needs ${budgetSplit?.needs}%, Savings ${budgetSplit?.savings}%, Wants ${budgetSplit?.wants}%
Monthly logs (income + itemized expenses with category): ${JSON.stringify(monthlyLogs)}
Known upcoming EMI outflows (from their debt tracker): ${JSON.stringify(upcomingEmiOutflows)}

In under 180 words: call out whether actual spending is drifting from the target split, flag any month with
concerning spending or a shrinking savings rate, note if upcoming EMI outflows look tight relative to recent income,
and give one concrete, specific action to improve cashflow. Speak plainly, use ₹ for amounts, no generic disclaimers.
If there isn't enough logged history yet, say so directly and suggest logging a couple more months.`;

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
