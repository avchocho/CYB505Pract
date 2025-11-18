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
You are an enterprise security awareness trainer. Generate ONE multiple-choice
question in JSON format for an employee security-awareness quiz.

The overall difficulty for this question is: ${difficulty}.

Follow this JSON schema exactly:

{
  "topic": "phishing" | "mfa" | "passwords" | "social",
  "difficulty": "easy" | "medium" | "hard",
  "question": "string",
  "options": ["string", "string", "string", "string"],
  "correctIndex": 0 | 1 | 2 | 3,
  "explanation": "2-3 sentence explanation of the correct answer",
  "tip": "1 short, actionable micro-tip for employees"
}

1) Topic selection
Randomly choose ONE of these conceptual areas and map it to the "topic" field:

- Email phishing, spear-phishing, smishing (SMS scams), vishing (phone scams),
  suspicious links or attachments  ->  topic "phishing"

- MFA prompts, MFA fatigue / push bombing, suspicious login alerts or new-device
  sign-ins                                  ->  topic "mfa"

- Weak passwords, password reuse, sharing passwords, writing them on paper,
  using password managers                   ->  topic "passwords"

- Social engineering, CEO fraud / business email compromise, urgent payment
  requests, data leakage / oversharing, public Wi-Fi risks, USB drop attacks,
  tailgating / badge sharing                ->  topic "social"

Use different channels (email, phone call, SMS, chat message, in-person, public
Wi-Fi, removable media, etc.). Do NOT generate the same style of phishing email
every time.

2) Question style
- Present a short, realistic workplace scenario.
- Exactly four distinct answer options.
- Only ONE option is correct.
- Vary which index is correct (not always 0).
- Avoid always using "Report to IT" or "Forward to security" as the correct
  answer. Sometimes the best action is to delete, verify via another channel,
  refuse the request, change a password, lock an account, turn off Wi-Fi, etc.

3) Difficulty guidance
- "easy": obvious red flags and basic best practices, simple wording.
- "medium": more subtle situations; the user must notice 1–2 clues.
- "hard": sophisticated or very realistic scenarios (spear-phishing, mixed
  signals, multi-step reasoning).

4) Output rules
- Use only generic organization names such as "your company".
- Do NOT mention any real companies or people.
- Respond with JSON only. No backticks, no markdown, no extra commentary.
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

// A1: generate each of the 5 questions
app.post("/api/risk-question", async (req, res) => {
  try {
    const { index = 1 } = req.body; // 1..5

    let difficulty = "easy";
    if (index === 1 || index === 2) difficulty = "easy";
    else if (index === 3 || index === 4) difficulty = "medium";
    else difficulty = "hard";

    const prompt = `
Mode A: Risk Profile Question

Generate ONE workplace-relevant security awareness question.

Difficulty: ${difficulty}

The question MUST be about one of these topics:
- phishing (only sometimes)
- multi-factor authentication (MFA)
- password security
- social engineering (tailgating, pretexting, impersonation)
- safe data handling
- device security (locking workstation, USB drives)
- physical security (badge access, strangers entering office)

STRICT DIVERSITY RULE:
Do NOT repeat similar "verify link" or "contact IT" answers across questions.
Avoid repeating the same scenario structure (like clicking links).

Each question must feel different from previous patterns:
- INCLUDE login prompts, MFA fatigue, password reuse, shoulder surfing,
  suspicious phone calls, tailgating, USB drive etiquette, etc.

Return JSON ONLY:

{
  "topic": "phishing" | "mfa" | "passwords" | "social" | "device" | "data",
  "difficulty": "${difficulty}",
  "question": "string",
  "options": ["A", "B", "C", "D"],
  "correctIndex": 0-3,
  "explanation": "2-3 sentences explaining the best practice"
}

Do NOT use real company names.
Make the correct answer DIFFERENT from previous ones (not always “contact IT”).
Make the scenario realistic and varied. JSON only.`;


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
      ],
      "complianceReminder": "ONE sentence reminding employees that this behavior is required by company policy and compliance expectations."
    }

    STRICT RULES:
    - Each paragraph MUST be a separate string in the "paragraphs" array.
    - Do NOT put newline characters (\\n) inside any string.
    - Total length across all paragraphs ≈ 180–220 words.
    - Keep language simple, concrete, and workplace-focused.
    - Do NOT mention ANY company names, especially ACME Corp. Use phrases like "company policy" or "your security team."
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
