// ------- STATE -------

let currentDifficulty = "easy";
let questionNumber = 0;
let correctStreak = 0;
let correctCount = 0;
let incorrectCount = 0;
const totalQuestions = 10;

const topicStats = {
  phishing: { correct: 0, total: 0 },
  mfa: { correct: 0, total: 0 },
  passwords: { correct: 0, total: 0 },
  social: { correct: 0, total: 0 }
};

let currentQuestion = null;

// ------- DOM ELEMENTS -------

const introScreen = document.getElementById("intro-screen");
const quizScreen = document.getElementById("quiz-screen");
const summaryScreen = document.getElementById("summary-screen");

const startBtn = document.getElementById("start-btn");
const nextBtn = document.getElementById("next-btn");
const restartBtn = document.getElementById("restart-btn");

const questionNumberSpan = document.getElementById("question-number");
const difficultyLabel = document.getElementById("difficulty-label");
const questionText = document.getElementById("question-text");
const answerButtonsContainer = document.getElementById("answer-buttons");

const feedbackPanel = document.getElementById("feedback-panel");
const feedbackResult = document.getElementById("feedback-result");
const feedbackExplanation = document.getElementById("feedback-explanation");
const feedbackTip = document.getElementById("feedback-tip");

const correctCountSpan = document.getElementById("correct-count");
const incorrectCountSpan = document.getElementById("incorrect-count");

const finalLevel = document.getElementById("final-level");
const strengthsList = document.getElementById("strengths-list");
const weaknessesList = document.getElementById("weaknesses-list");
const nextStepsList = document.getElementById("next-steps-list");

const API_URL = "http://localhost:3000/api/question";

// ------- API -------

async function fetchQuestionFromAPI(difficulty) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ difficulty })
  });

  if (!res.ok) {
    throw new Error("Failed to fetch question");
  }
  const data = await res.json();

  return {
    topic: data.topic || "phishing",
    question: data.question,
    options: data.options,
    correctIndex: data.correctIndex,
    explanation: data.explanation,
    tip: data.tip
  };
}

// ------- QUIZ LOGIC -------

function startQuiz() {
  currentDifficulty = "easy";
  questionNumber = 0;
  correctStreak = 0;
  correctCount = 0;
  incorrectCount = 0;

  for (const t in topicStats) {
    topicStats[t].correct = 0;
    topicStats[t].total = 0;
  }

  correctCountSpan.textContent = "0";
  incorrectCountSpan.textContent = "0";

  introScreen.classList.add("hidden");
  summaryScreen.classList.add("hidden");
  quizScreen.classList.remove("hidden");

  loadNextQuestion();
}

function adjustDifficulty(isCorrect) {
  if (isCorrect) {
    correctStreak++;
    if (correctStreak >= 2) {
      if (currentDifficulty === "easy") currentDifficulty = "medium";
      else if (currentDifficulty === "medium") currentDifficulty = "hard";
      correctStreak = 0;
    }
  } else {
    correctStreak = 0;
    if (currentDifficulty === "hard") currentDifficulty = "medium";
    else if (currentDifficulty === "medium") currentDifficulty = "easy";
  }
}

async function loadNextQuestion() {
  if (questionNumber >= totalQuestions) {
    showSummary();
    return;
  }

  questionNumber++;
  questionNumberSpan.textContent = questionNumber;
  difficultyLabel.textContent =
    currentDifficulty.charAt(0).toUpperCase() + currentDifficulty.slice(1);

  questionText.textContent = "Loading question from AI...";
  answerButtonsContainer.innerHTML = "";
  feedbackPanel.classList.add("hidden");
  feedbackPanel.classList.remove("incorrect");

  try {
    currentQuestion = await fetchQuestionFromAPI(currentDifficulty);
  } catch (err) {
    console.error(err);
    questionText.textContent =
      "Error loading question. Please check the server and try again.";
    return;
  }

  questionText.textContent = currentQuestion.question;
  answerButtonsContainer.innerHTML = "";

  currentQuestion.options.forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.className = "answer-btn";
    btn.textContent = opt;
    btn.addEventListener("click", () => handleAnswer(idx));
    answerButtonsContainer.appendChild(btn);
  });
}

function handleAnswer(selectedIndex) {
  const isCorrect = selectedIndex === currentQuestion.correctIndex;

  topicStats[currentQuestion.topic] =
    topicStats[currentQuestion.topic] || { correct: 0, total: 0 };

  topicStats[currentQuestion.topic].total++;

  if (isCorrect) {
    correctCount++;
    correctStreak++;
    topicStats[currentQuestion.topic].correct++;
    feedbackPanel.classList.remove("incorrect");
    feedbackResult.textContent = "Correct";
  } else {
    incorrectCount++;
    correctStreak = 0;
    feedbackPanel.classList.add("incorrect");
    feedbackResult.textContent = "Incorrect";
  }

  correctCountSpan.textContent = correctCount;
  incorrectCountSpan.textContent = incorrectCount;

  feedbackExplanation.textContent = currentQuestion.explanation;
  feedbackTip.textContent = "Tip: " + currentQuestion.tip;
  feedbackPanel.classList.remove("hidden");

  Array.from(answerButtonsContainer.children).forEach((btn) => {
    btn.disabled = true;
  });

  adjustDifficulty(isCorrect);
}

// ------- SUMMARY -------

function showSummary() {
  quizScreen.classList.add("hidden");
  summaryScreen.classList.remove("hidden");

  const total = correctCount + incorrectCount;
  const accuracy = total ? correctCount / total : 0;

  let level;
  if (accuracy >= 0.85 && currentDifficulty === "hard") {
    level = "Advanced";
  } else if (accuracy >= 0.6) {
    level = "Intermediate";
  } else {
    level = "Beginner";
  }

  finalLevel.textContent = `Estimated skill level: ${level} (Accuracy ${(accuracy *
    100).toFixed(0)}%).`;

  strengthsList.innerHTML = "";
  weaknessesList.innerHTML = "";
  nextStepsList.innerHTML = "";

  const strengths = [];
  const weaknesses = [];

  for (const [topic, stats] of Object.entries(topicStats)) {
    if (stats.total === 0) continue;
    const acc = stats.correct / stats.total;
    const label = topicLabel(topic);

    if (acc >= 0.7) {
      strengths.push(`${label} (${(acc * 100).toFixed(0)}% correct)`);
    } else {
      weaknesses.push(`${label} (${(acc * 100).toFixed(0)}% correct)`);
    }
  }

  if (!strengths.length)
    strengths.push("You are still building core awareness.");
  if (!weaknesses.length)
    weaknesses.push("No obvious weak spots detected; keep practicing.");

  strengths.forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s;
    strengthsList.appendChild(li);
  });

  weaknesses.forEach((w) => {
    const li = document.createElement("li");
    li.textContent = w;
    weaknessesList.appendChild(li);
  });

  const recs = [
    "Review your organization’s phishing reporting process.",
    "Take a short module on MFA fatigue and suspicious login prompts.",
    "Practice spotting authority, urgency, and secrecy in messages."
  ];

  recs.forEach((r) => {
    const li = document.createElement("li");
    li.textContent = r;
    nextStepsList.appendChild(li);
  });
}

function topicLabel(key) {
  switch (key) {
    case "phishing":
      return "Phishing detection";
    case "mfa":
      return "MFA and login security";
    case "passwords":
      return "Password hygiene";
    case "social":
      return "Social engineering";
    default:
      return key;
  }
}

// ------- EVENTS -------

startBtn.addEventListener("click", startQuiz);
nextBtn.addEventListener("click", () => loadNextQuestion());
restartBtn.addEventListener("click", () => {
  introScreen.classList.remove("hidden");
  summaryScreen.classList.add("hidden");
});
