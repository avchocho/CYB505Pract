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
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

// Retry wrapper for Gemini
async function callGeminiWithRetry(prompt, retries = 3, delayMs = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result;
    } catch (err) {
      const is503 =
        err && (err.status === 503 || err.statusText === "Service Unavailable");

      // If it's not a 503 OR we're out of retries, rethrow
      if (!is503 || attempt === retries) {
        throw err;
      }

      console.warn(
        `Gemini 503 (overloaded). Retrying in ${delayMs}ms... (attempt ${
          attempt + 1
        }/${retries})`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs *= 2; // exponential backoff
    }
  }
}

// Helper: clean ```json ... ``` wrappers and parse JSON
function parseModelJSON(text) {
  let cleaned = text.trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/```json/i, "")
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

    const result = await callGeminiWithRetry(prompt);
    const text = result.response.text();
    const data = parseModelJSON(text);

    if (
      !data ||
      !data.question ||
      !Array.isArray(data.options) ||
      data.options.length !== 4
    ) {
      return res
        .status(500)
        .json({ error: "Incomplete question from model" });
    }

    res.json(data);
  } catch (err) {
    console.error("Error generating adaptive question:", err);

    const is503 =
      err && (err.status === 503 || err.statusText === "Service Unavailable");

    if (is503) {
      return res
        .status(503)
        .json({ error: "AI model overloaded, please try again." });
    }

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

    const result = await callGeminiWithRetry(prompt);
    const text = result.response.text();
    const data = parseModelJSON(text);
    res.json(data);
  } catch (err) {
    console.error("Error generating risk question:", err);

    const is503 =
      err && (err.status === 503 || err.statusText === "Service Unavailable");

    if (is503) {
      return res
        .status(503)
        .json({ error: "AI model overloaded, please try again." });
    }

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
  "suggestedTopics": [ "phishing basics", "password hygiene" ]
}

Keep bullets short and concrete. JSON only.`;

    const result = await callGeminiWithRetry(prompt);
    const text = result.response.text();
    const data = parseModelJSON(text);
    res.json(data);
  } catch (err) {
    console.error("Error generating risk summary:", err);

    const is503 =
      err && (err.status === 503 || err.statusText === "Service Unavailable");

    if (is503) {
      return res
        .status(503)
        .json({ error: "AI model overloaded, please try again." });
    }

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

    const result = await callGeminiWithRetry(prompt);
    const text = result.response.text();
    const data = parseModelJSON(text);
    res.json(data);
  } catch (err) {
    console.error("Error generating phishing emails:", err);

    const is503 =
      err && (err.status === 503 || err.statusText === "Service Unavailable");

    if (is503) {
      return res
        .status(503)
        .json({ error: "AI model overloaded, please try again." });
    }

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

    const result = await callGeminiWithRetry(prompt);
    const text = result.response.text();
    const data = parseModelJSON(text);
    res.json(data);
  } catch (err) {
    console.error("Error classifying emails:", err);

    const is503 =
      err && (err.status === 503 || err.statusText === "Service Unavailable");

    if (is503) {
      return res
        .status(503)
        .json({ error: "AI model overloaded, please try again." });
    }

    res.status(500).json({ error: "Failed to classify emails" });
  }
});

//  POLICY → TRAINING 
app.post("/api/micro-module", async (req, res) => {
  try {
    const { topic = "phishing_basics" } = req.body;

    const topicLabels = {
      phishing_basics: "Identifying phishing emails",
      strong_passwords: "Creating and managing strong passwords",
      mfa_security: "Using multi-factor authentication safely",
      public_wifi: "Staying safe on public Wi-Fi",
      ai_privacy: "Data privacy when using AI assistants",
    };

    const humanTopic = topicLabels[topic] || topicLabels.phishing_basics;

    const prompt = `
Mode D: Micro-Training Module

You are creating a SHORT security awareness micro-training.

Topic key: ${topic}
Human-readable topic: ${humanTopic}

Return JSON ONLY with this structure:

{
  "title": "short catchy title for the module",
  "overview": "2–3 sentence overview (max 60 words, single paragraph)",
  "paragraphs": [
    "Paragraph 1: 3–5 short sentences.",
    "Paragraph 2: 3–5 short sentences.",
    "Optional paragraph 3: 3–5 short sentences."
  ],
  "takeaways": [
    "1-line key takeaway",
    "another 1-line key takeaway",
    "third 1-line key takeaway"
  ]
}

STRICT RULES:
- Each paragraph MUST be a separate string in the "paragraphs" array.
- Do NOT put newline characters (\\n) inside any string.
- Keep language simple, concrete, and workplace-focused.
- Total length across all paragraphs about 180–220 words.
- Avoid real company names; use generic ones like "ACME Corp".
- Respond with JSON only, no extra commentary.
`;


    const result = await callGeminiWithRetry(prompt);
    const text = result.response.text();
    const data = parseModelJSON(text);
    res.json(data);
  } catch (err) {
    console.error("Error generating micro module:", err);

    const is503 =
      err && (err.status === 503 || err.statusText === "Service Unavailable");

    if (is503) {
      return res
        .status(503)
        .json({ error: "AI model overloaded, please try again." });
    }

    res.status(500).json({ error: "Failed to generate micro module" });
  }
});

// START SERVER
app.listen(port, () => {
  console.log(`Gemini backend listening on http://localhost:${port}`);
});
