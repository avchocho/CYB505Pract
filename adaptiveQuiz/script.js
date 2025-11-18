const API_BASE = "http://localhost:3000";

//  WELCOME SCREEN 

const welcomeScreen = document.getElementById("welcome-screen");
const modeSections = document.querySelectorAll(".mode-section");
const navButtons = document.querySelectorAll(".nav-btn");
const startRiskFromWelcome = document.getElementById("start-risk");

function showMode(modeId) {
  // hide welcome and show the chosen mode section
  if (welcomeScreen) welcomeScreen.classList.add("hidden");
  modeSections.forEach((sec) => {
    sec.id === modeId
      ? sec.classList.remove("hidden")
      : sec.classList.add("hidden");
  });
}

function renderWelcome() {
  // show only the welcome screen on first load
  if (welcomeScreen) welcomeScreen.classList.remove("hidden");
  modeSections.forEach((sec) => sec.classList.add("hidden"));
  navButtons.forEach((btn) => btn.classList.remove("active"));
}

// initial state
renderWelcome();

// sidebar nav buttons
navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.mode;
    navButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    showMode(target);
  });
});

// "Start With Risk Profile" button on welcome card
if (startRiskFromWelcome) {
  startRiskFromWelcome.addEventListener("click", () => {
    const riskBtn = document.querySelector('.nav-btn[data-mode="mode-a"]');
    navButtons.forEach((b) => b.classList.remove("active"));
    if (riskBtn) riskBtn.classList.add("active");
    showMode("mode-a"); // opens Risk Profile intro
  });
}

// ADAPTIVE QUIZ 

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
  social: { correct: 0, total: 0 },
};

let currentQuestion = null;

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

async function fetchAdaptiveQuestion(difficulty) {
  const res = await fetch(`${API_BASE}/api/question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ difficulty }),
  });
  if (!res.ok) throw new Error("Failed to fetch question");
  return res.json();
}

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

  loadNextAdaptiveQuestion();
}

function adjustAdaptiveDifficulty(isCorrect) {
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

async function loadNextAdaptiveQuestion() {
  if (questionNumber >= totalQuestions) {
    showAdaptiveSummary();
    return;
  }

  questionNumber++;
  questionNumberSpan.textContent = questionNumber;
  difficultyLabel.textContent =
    currentDifficulty.charAt(0).toUpperCase() + currentDifficulty.slice(1);

  questionText.textContent = "Loading question...";
  answerButtonsContainer.innerHTML = "";
  feedbackPanel.classList.add("hidden");
  feedbackPanel.classList.remove("incorrect");

  try {
    currentQuestion = await fetchAdaptiveQuestion(currentDifficulty);
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
    btn.addEventListener("click", () => handleAdaptiveAnswer(idx));
    answerButtonsContainer.appendChild(btn);
  });
}

function handleAdaptiveAnswer(selectedIndex) {
  const isCorrect = selectedIndex === currentQuestion.correctIndex;

  const topicKey = currentQuestion.topic || "phishing";
  topicStats[topicKey] = topicStats[topicKey] || { correct: 0, total: 0 };
  topicStats[topicKey].total++;

  if (isCorrect) {
    correctCount++;
    correctStreak++;
    topicStats[topicKey].correct++;
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

  feedbackExplanation.textContent = currentQuestion.explanation || "";
  feedbackTip.textContent = "Tip: " + (currentQuestion.tip || "");
  feedbackPanel.classList.remove("hidden");

  Array.from(answerButtonsContainer.children).forEach((btn) => {
    btn.disabled = true;
  });

  adjustAdaptiveDifficulty(isCorrect);
}

function showAdaptiveSummary() {
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
    "Practice spotting authority, urgency, and secrecy in messages.",
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

startBtn.addEventListener("click", startQuiz);
nextBtn.addEventListener("click", () => loadNextAdaptiveQuestion());
restartBtn.addEventListener("click", () => {
  introScreen.classList.remove("hidden");
  summaryScreen.classList.add("hidden");
});

// RISK PROFILE 

let riskIndex = 0; // 0..4 (we'll show as +1)
let riskAnswers = [];
let currentRiskQuestion = null;

const riskIntro = document.getElementById("risk-intro");
const riskQuiz = document.getElementById("risk-quiz");
const riskSummary = document.getElementById("risk-summary");

const riskStartBtn = document.getElementById("risk-start-btn");
const riskNextBtn = document.getElementById("risk-next-btn");
const riskRestartBtn = document.getElementById("risk-restart-btn");

const riskQNumberSpan = document.getElementById("risk-q-number");
const riskDifficultyLabel = document.getElementById("risk-difficulty-label");
const riskQuestionText = document.getElementById("risk-question-text");
const riskAnswerButtons = document.getElementById("risk-answer-buttons");

const riskFeedback = document.getElementById("risk-feedback");
const riskFeedbackResult = document.getElementById("risk-feedback-result");
const riskFeedbackExplanation = document.getElementById(
  "risk-feedback-explanation"
);

const riskLevelText = document.getElementById("risk-level-text");
const riskStrengths = document.getElementById("risk-strengths");
const riskWeaknesses = document.getElementById("risk-weaknesses");
const riskStartingDifficulty = document.getElementById(
  "risk-starting-difficulty"
);

async function fetchRiskQuestion(index) {
  const res = await fetch(`${API_BASE}/api/risk-question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ index }),
  });
  if (!res.ok) throw new Error("Failed to fetch risk question");
  return res.json();
}

function startRiskProfile() {
  riskIndex = 0;
  riskAnswers = [];
  riskIntro.classList.add("hidden");
  riskSummary.classList.add("hidden");
  riskQuiz.classList.remove("hidden");
  loadNextRiskQuestion();
}

async function loadNextRiskQuestion() {
  if (riskIndex >= 5) {
    showRiskSummary();
    return;
  }

  riskQNumberSpan.textContent = riskIndex + 1;
  riskQuestionText.textContent = "Loading question...";
  riskAnswerButtons.innerHTML = "";
  riskFeedback.classList.add("hidden");
  riskFeedback.classList.remove("incorrect"); // reset color
  riskNextBtn.classList.add("hidden");

  const displayDifficulty =
    riskIndex < 2 ? "easy" : riskIndex < 4 ? "medium" : "hard";
  riskDifficultyLabel.textContent =
    displayDifficulty.charAt(0).toUpperCase() + displayDifficulty.slice(1);

  try {
    currentRiskQuestion = await fetchRiskQuestion(riskIndex + 1);
  } catch (err) {
    console.error(err);
    riskQuestionText.textContent =
      "Error loading question. Please check the server.";
    return;
  }

  riskQuestionText.textContent = currentRiskQuestion.question;
  riskAnswerButtons.innerHTML = "";

  currentRiskQuestion.options.forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.className = "answer-btn";
    btn.textContent = opt;
    btn.addEventListener("click", () => handleRiskAnswer(idx));
    riskAnswerButtons.appendChild(btn);
  });
}

function handleRiskAnswer(selectedIndex) {
  const isCorrect = selectedIndex === currentRiskQuestion.correctIndex;

  riskAnswers.push({
    topic: currentRiskQuestion.topic || "phishing",
    difficulty: currentRiskQuestion.difficulty || "easy",
    correct: isCorrect,
  });

  riskFeedbackResult.textContent = isCorrect ? "Correct" : "Incorrect";
  riskFeedbackExplanation.textContent = currentRiskQuestion.explanation || "";

 
  if (isCorrect) {
    riskFeedback.classList.remove("incorrect"); // green (default .feedback)
  } else {
    riskFeedback.classList.add("incorrect"); // red (.feedback.incorrect)
  }

  riskFeedback.classList.remove("hidden");

  Array.from(riskAnswerButtons.children).forEach((btn) => {
    btn.disabled = true;
  });

  riskNextBtn.classList.remove("hidden");
  riskIndex++;
}

async function showRiskSummary() {
  riskQuiz.classList.add("hidden");
  riskSummary.classList.remove("hidden");

  try {
    const res = await fetch(`${API_BASE}/api/risk-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: riskAnswers }),
    });
    if (!res.ok) throw new Error("Failed risk summary");
    const data = await res.json();

    riskLevelText.textContent = `Estimated level: ${data.level}`;
    riskStrengths.innerHTML = "";
    riskWeaknesses.innerHTML = "";

    (data.strengths || []).forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s;
      riskStrengths.appendChild(li);
    });
    (data.weaknesses || []).forEach((w) => {
      const li = document.createElement("li");
      li.textContent = w;
      riskWeaknesses.appendChild(li);
    });

    riskStartingDifficulty.textContent = `Recommended starting difficulty in Mode B: ${
      data.recommendedStartingDifficulty || "easy"
    }.`;
  } catch (err) {
    console.error(err);
    riskLevelText.textContent =
      "Error generating summary. Please try again later.";
  }
}

riskStartBtn.addEventListener("click", startRiskProfile);
riskNextBtn.addEventListener("click", () => loadNextRiskQuestion());
riskRestartBtn.addEventListener("click", () => {
  riskIntro.classList.remove("hidden");
  riskSummary.classList.add("hidden");
});

// PHISHING LAB 

const generateEmailsBtn = document.getElementById("generate-emails-btn");
const classifyEmailsBtn = document.getElementById("classify-emails-btn");
const nextEmailBtn = document.getElementById("next-email-btn");
const emailsContainer = document.getElementById("emails-container");
const classificationResults = document.getElementById("classification-results");

let currentEmails = [];
let currentEmailIndex = 0;

// Render only the current email in the container
function renderCurrentEmail() {
  emailsContainer.innerHTML = "";
  classificationResults.innerHTML = "";

  if (!currentEmails.length) {
    return;
  }

  const email = currentEmails[currentEmailIndex];

  const div = document.createElement("div");
  div.className = "email-card";
  div.innerHTML = `
    <div class="email-header">
      <strong>Email #${email.id}</strong>
    </div>
    <div class="email-meta">
      <div><strong>Subject:</strong> ${email.subject}</div>
      <div><strong>From:</strong> ${email.from}</div>
    </div>
    <pre class="email-body">${email.body}</pre>
  `;

  emailsContainer.appendChild(div);

  // Show "Classify" button, hide "Next" until after classification
  classifyEmailsBtn.classList.remove("hidden");
  nextEmailBtn.classList.add("hidden");
}

// Start a 5-email simulation
generateEmailsBtn.addEventListener("click", async () => {
  emailsContainer.innerHTML = "Generating emails with AI...";
  classificationResults.innerHTML = "";
  classifyEmailsBtn.classList.add("hidden");
  nextEmailBtn.classList.add("hidden");
  currentEmails = [];
  currentEmailIndex = 0;

  try {
    const res = await fetch(`${API_BASE}/api/phishing-emails`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to generate emails");
    const data = await res.json();
    currentEmails = data.emails || [];

    if (!currentEmails.length) {
      emailsContainer.textContent =
        "No emails were generated. Please try again.";
      return;
    }

    // Start with the first email
    renderCurrentEmail();
  } catch (err) {
    console.error(err);
    emailsContainer.textContent =
      "Error generating emails. Please check the server.";
  }
});

// Classify the CURRENT email only
classifyEmailsBtn.addEventListener("click", async () => {
  if (!currentEmails.length) return;

  const email = currentEmails[currentEmailIndex];
  classificationResults.innerHTML = "Classifying this email...";

  try {
    const res = await fetch(`${API_BASE}/api/classify-emails`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails: [email] }), // just one email
    });
    if (!res.ok) throw new Error("Failed to classify email");
    const data = await res.json();
    const result = (data.results || [])[0];

    classificationResults.innerHTML = "";
    if (!result) {
      classificationResults.textContent =
        "No classification returned. Please try again.";
      return;
    }

    const div = document.createElement("div");
    div.className =
      "email-card " + (result.verdict === "Phishing" ? "phish" : "legit");
    div.innerHTML = `
      <div class="email-header">
        <strong>Email #${result.id}</strong> · Verdict: ${result.verdict}
      </div>
      <ul class="reasons">
        ${(result.reasons || [])
          .map((reason) => `<li>${reason}</li>`)
          .join("")}
      </ul>
      <p class="tip"><strong>Tip:</strong> ${result.tip || ""}</p>
    `;

    classificationResults.appendChild(div);

    // After classification, show "Next Email" if there are more
    if (currentEmailIndex < currentEmails.length - 1) {
      nextEmailBtn.classList.remove("hidden");
    } else {
      nextEmailBtn.classList.add("hidden");
      const doneMsg = document.createElement("p");
      doneMsg.style.marginTop = "8px";
      doneMsg.textContent = "End of 5-email simulation.";
      classificationResults.appendChild(doneMsg);
    }
  } catch (err) {
    console.error(err);
    classificationResults.textContent =
      "Error classifying email. Please check the server.";
  }
});

// Move to the next email in the simulation
nextEmailBtn.addEventListener("click", () => {
  if (!currentEmails.length) return;

  if (currentEmailIndex < currentEmails.length - 1) {
    currentEmailIndex++;
    renderCurrentEmail();
  }
});


//POLICY → TRAINING & CONTENT 

const policyTextArea = document.getElementById("policy-text");
const microTrainingBtn = document.getElementById("micro-training-btn");
const contentAssetsBtn = document.getElementById("content-assets-btn");
const microTrainingOutput = document.getElementById("micro-training-output");
const contentAssetsOutput = document.getElementById("content-assets-output");

microTrainingBtn.addEventListener("click", async () => {
  const policyText = policyTextArea.value.trim();
  if (!policyText) {
    alert("Please paste a short policy first.");
    return;
  }

  microTrainingOutput.innerHTML = "Generating micro-training script...";
  try {
    const res = await fetch(`${API_BASE}/api/micro-training`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policyText }),
    });
    if (!res.ok) throw new Error("Failed micro-training");
    const data = await res.json();

    microTrainingOutput.innerHTML = "";
    const scriptDiv = document.createElement("div");
    scriptDiv.className = "mt-section";
    scriptDiv.innerHTML = `<h3>Micro-Training Script</h3><p>${data.script}</p>`;
    microTrainingOutput.appendChild(scriptDiv);

    const qDiv = document.createElement("div");
    qDiv.className = "mt-section";
    qDiv.innerHTML = "<h3>Quiz Questions</h3>";
    const list = document.createElement("ol");
    (data.questions || []).forEach((q) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${q.question}</strong>
        <ul>
          ${(q.options || [])
            .map(
              (opt, idx) => `<li>${String.fromCharCode(65 + idx)}. ${opt}</li>`
            )
            .join("")}
        </ul>
      `;
      list.appendChild(li);
    });
    qDiv.appendChild(list);
    microTrainingOutput.appendChild(qDiv);
  } catch (err) {
    console.error(err);
    microTrainingOutput.textContent =
      "Error generating micro-training. Please check the server.";
  }
});

contentAssetsBtn.addEventListener("click", async () => {
  const policyText = policyTextArea.value.trim();
  if (!policyText) {
    alert("Please paste a short policy first.");
    return;
  }

  contentAssetsOutput.innerHTML = "Generating content assets...";
  try {
    const res = await fetch(`${API_BASE}/api/content-assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policyText }),
    });
    if (!res.ok) throw new Error("Failed content assets");
    const data = await res.json();

    contentAssetsOutput.innerHTML = "";

    const infoDiv = document.createElement("div");
    infoDiv.className = "mt-section";
    infoDiv.innerHTML = "<h3>Infographic Bullets</h3>";
    const ul = document.createElement("ul");
    (data.infographicBullets || []).forEach((b) => {
      const li = document.createElement("li");
      li.textContent = b;
      ul.appendChild(li);
    });
    infoDiv.appendChild(ul);
    contentAssetsOutput.appendChild(infoDiv);

    const vidDiv = document.createElement("div");
    vidDiv.className = "mt-section";
    vidDiv.innerHTML = `<h3>Video Script</h3><p>${data.videoScript}</p>`;
    contentAssetsOutput.appendChild(vidDiv);

    const audioDiv = document.createElement("div");
    audioDiv.className = "mt-section";
    audioDiv.innerHTML = "<h3>Audio Jingle Ideas</h3>";
    const audioUl = document.createElement("ul");
    (data.audioJingle || []).forEach((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      audioUl.appendChild(li);
    });
    audioDiv.appendChild(audioUl);
    contentAssetsOutput.appendChild(audioDiv);
  } catch (err) {
    console.error(err);
    contentAssetsOutput.textContent =
      "Error generating assets. Please check the server.";
  }
});
