import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// GEMINI SETUP 
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Match what you saw in AI Studio:
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Helper: clean ```json ... ``` wrappers and parse JSON
function parseModelJSON(text) {
  let cleaned = text.trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/```json/i, "")
      .replace(/```javascript/i, "")
      .replace(/```/g, "")
      .trim();
  }

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}

// ADAPTIVE QUIZ

function buildAdaptivePrompt(difficulty) {
  return `
You are an AI security awareness trainer. Generate ONE multiple-choice quiz
question in JSON format.

The question is for an employee security-awareness quiz. Difficulty:
${difficulty}.

Allowed topics:
- phishing and spear-phishing
- suspicious links/attachments
- MFA and login security
- password hygiene
- basic social engineering

Return JSON ONLY, with this schema:

{
  "topic": "phishing" | "mfa" | "passwords" | "social",
  "difficulty": "easy" | "medium" | "hard",
  "question": "string",
  "options": ["A", "B", "C", "D"],
  "correctIndex": 0-3,
  "explanation": "2-3 sentence explanation of the correct answer",
  "tip": "1 short, actionable micro-tip for employees"
}

Rules:
- For EASY: obvious red flags, basic concepts.
- For MEDIUM: realistic but still clear phishing or policy scenarios.
- For HARD: subtle spear-phishing or tricky social engineering.
- Do NOT use real company/person names. Use generic names like "ACME Corp".
- Exactly 4 options, only one correct.
- Respond with JSON only, no extra text.
`;
}

app.post("/api/question", async (req, res) => {
  try {
    const { difficulty = "easy" } = req.body;
    const prompt = buildAdaptivePrompt(difficulty);

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const data = parseModelJSON(text);

    if (
      !data ||
      !data.question ||
      !Array.isArray(data.options) ||
      data.options.length !== 4
    ) {
      return res.status(500).json({ error: "Incomplete question from model" });
    }

    res.json(data);
  } catch (err) {
    console.error("Error generating adaptive question:", err);
    res.status(500).json({ error: "Failed to generate question" });
  }
});

//  RISK PROFILE 

// A1: generate each of the 5 questions (2 easy, 2 medium, 1 hard overall)
app.post("/api/risk-question", async (req, res) => {
  try {
    const { index = 1 } = req.body; // 1..5

    let difficulty = "easy";
    if (index === 1 || index === 2) difficulty = "easy";
    else if (index === 3 || index === 4) difficulty = "medium";
    else difficulty = "hard";

    const prompt = `
Mode A: Risk Profile Question

Generate ONE multiple-choice question to estimate a user's security awareness.

Difficulty for this question: ${difficulty}

Return JSON ONLY with:

{
  "topic": "phishing" | "mfa" | "passwords" | "social",
  "difficulty": "${difficulty}",
  "question": "string",
  "options": ["A", "B", "C", "D"],
  "correctIndex": 0-3,
  "explanation": "2-3 sentence explanation of the answer"
}

Make it short and workplace-relevant. No real names.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const data = parseModelJSON(text);
    res.json(data);
  } catch (err) {
    console.error("Error generating risk question:", err);
    res.status(500).json({ error: "Failed to generate risk question" });
  }
});

// A2: summarize the 5 answers into a level + strengths/weaknesses
app.post("/api/risk-summary", async (req, res) => {
  try {
    const { answers } = req.body;
    const prompt = `
Mode A: Risk Profile Summary

You are analyzing a short 5-question security awareness check.
Here are the results as JSON:

${JSON.stringify(answers, null, 2)}

Each array entry has:
- topic
- difficulty
- correct (true/false)

Based on this, output JSON ONLY with:

{
  "level": "Beginner" | "Intermediate" | "Advanced",
  "strengths": [ "short bullet", ... ],
  "weaknesses": [ "short bullet", ... ],
  "recommendedStartingDifficulty": "easy" | "medium" | "hard"
}

Keep bullets short and concrete. JSON only.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const data = parseModelJSON(text);
    res.json(data);
  } catch (err) {
    console.error("Error generating risk summary:", err);
    res.status(500).json({ error: "Failed to generate risk summary" });
  }
});

//  PHISHING LAB 

// C1: generate 3 phishing + 2 legitimate emails (unlabeled)
app.post("/api/phishing-emails", async (req, res) => {
  try {
    const prompt = `
Mode C1: Generate Simulated Emails

Generate exactly 5 short workplace emails:
- Email 1: easy phishing (generic, obvious).
- Email 2: medium phishing (slightly personalized).
- Email 3: spear-phishing targeting a finance employee.
- Email 4: legitimate internal email from HR.
- Email 5: legitimate email from IT about maintenance.

Return JSON ONLY:

{
  "emails": [
    {
      "id": 1,
      "subject": "string",
      "from": "string",
      "body": "short email body"
    },
    ...
  ]
}

Do NOT say which ones are phishing vs legitimate. No real companies; use
fictional names. JSON only.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const data = parseModelJSON(text);
    res.json(data);
  } catch (err) {
    console.error("Error generating phishing emails:", err);
    res.status(500).json({ error: "Failed to generate emails" });
  }
});

// C2: classify those emails
app.post("/api/classify-emails", async (req, res) => {
  try {
    const { emails } = req.body;
    const prompt = `
Mode C2: Classify & Explain Emails

Here are some emails as JSON:

${JSON.stringify(emails, null, 2)}

For each email, decide if it is "Phishing" or "Legitimate".
Return JSON ONLY:

{
  "results": [
    {
      "id": 1,
      "verdict": "Phishing" | "Legitimate",
      "reasons": ["reason 1", "reason 2", "reason 3"],
      "tip": "one-sentence training tip"
    },
    ...
  ]
}

Be specific about social engineering / red flags. JSON only.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const data = parseModelJSON(text);
    res.json(data);
  } catch (err) {
    console.error("Error classifying emails:", err);
    res.status(500).json({ error: "Failed to classify emails" });
  }
});

//  POLICY → TRAINING 

// D1: Micro-training + quiz from policy text
app.post("/api/micro-training", async (req, res) => {
  try {
    const { policyText } = req.body;

    const prompt = `
Mode D1: Micro-Training from Policy

Here is a short email/security policy:

"""${policyText}"""

Turn this into JSON ONLY:

{
  "script": "60-second micro-training script a trainer could read aloud.",
  "questions": [
    {
      "question": "string",
      "options": ["A","B","C","D"],
      "correctIndex": 0-3
    },
    ...
  ]
}

Use simple language and concrete examples. 2-3 quiz questions. JSON only.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const data = parseModelJSON(text);
    res.json(data);
  } catch (err) {
    console.error("Error generating micro-training:", err);
    res.status(500).json({ error: "Failed to generate micro-training" });
  }
});

// D2: Content assets (infographic bullets, video script, audio jingle)
app.post("/api/content-assets", async (req, res) => {
  try {
    const { policyText } = req.body;

    const prompt = `
Mode D2: Content Assets

Based on this short policy:

"""${policyText}"""

Return JSON ONLY:

{
  "infographicBullets": [
    "How to spot phishing: ...",
    ...
  ],
  "videoScript": "45-60 second script for an animated explainer.",
  "audioJingle": [
    "short rhyming line 1",
    "short rhyming line 2"
  ]
}

Keep bullets ≤ 10 words. Make everything generic so it fits any company.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const data = parseModelJSON(text);
    res.json(data);
  } catch (err) {
    console.error("Error generating content assets:", err);
    res.status(500).json({ error: "Failed to generate content assets" });
  }
});

//START SERVER 

app.listen(port, () => {
  console.log(`Gemini backend listening on http://localhost:${port}`);
});
