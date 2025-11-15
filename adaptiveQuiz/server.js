import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });



function buildPrompt(difficulty) {
  return `
You are an AI that creates multiple-choice security awareness training questions.

Generate ONE question in JSON format only, with this exact schema:

{
  "topic": "phishing" | "mfa" | "passwords" | "social",
  "difficulty": "easy" | "medium" | "hard",
  "question": "string",
  "options": ["A", "B", "C", "D"],
  "correctIndex": 0-3,
  "explanation": "string",
  "tip": "string"
}

CURRENT DIFFICULTY: ${difficulty}

Rules:
- Match the difficulty:
  - easy: obvious red flags, basic concepts.
  - medium: more realistic scenarios (MFA fatigue, vendor emails, etc.).
  - hard: spear-phishing / CEO fraud / subtle social engineering tactics.
- No real company names or PII; use generic names like "ACME Corp".
- Explanation: 2–4 sentences, clear and concrete.
- Tip: 1 short, actionable sentence.
- Exactly 4 options, only one correct.
- Respond with **JSON only**. No backticks, no extra text.
`;
}

app.post("/api/question", async (req, res) => {
  try {
    const { difficulty = "easy" } = req.body;

    const prompt = buildPrompt(difficulty);
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();

    // If Gemini ever wraps JSON in ```...```, strip it
    if (text.startsWith("```")) {
      text = text.replace(/```json/i, "")
                 .replace(/```/g, "")
                 .trim();
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error("Failed to parse JSON from Gemini:\n", text);
      return res.status(500).json({ error: "Bad JSON from model" });
    }

    if (
      !data ||
      !data.question ||
      !Array.isArray(data.options) ||
      data.options.length !== 4 ||
      typeof data.correctIndex !== "number"
    ) {
      return res.status(500).json({ error: "Incomplete question from model" });
    }

    res.json(data);
  } catch (err) {
    console.error("Error generating question:", err);
    res.status(500).json({ error: "Failed to generate question" });
  }
});

app.listen(port, () => {
  console.log(`Gemini quiz backend listening on http://localhost:${port}`);
});
