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

  const { strategy, extraPayment, monthsToDebtFree, payoffOrder, activeDebts } = req.body || {};

  if (!Array.isArray(activeDebts)) {
    res.status(400).json({ error: "Missing simulation data" });
    return;
  }

  const prompt = `You are a personal finance coach. A user ran a debt payoff simulation with these inputs:

Strategy: ${strategy}
Extra monthly payment applied: ₹${extraPayment}
Simulated months to debt-free: ${monthsToDebtFree}
Payoff order: ${JSON.stringify(payoffOrder)}
Active debts: ${JSON.stringify(activeDebts)}

In under 180 words, give a direct, encouraging assessment of this plan: is the chosen strategy (snowball vs avalanche)
sensible for this specific debt mix, is the extra payment amount meaningful relative to the balances, and one concrete
suggestion to accelerate payoff. Avoid generic disclaimers, speak plainly, use ₹ for amounts.`;

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
