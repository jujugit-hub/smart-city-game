// ---------- QUIZ COLLABORATIF - CORRECTION FINALE UNIQUEMENT ----------
let currentIndex = 0;
let questions = [];
let totalQuestions = 0;
let currentQuestionNumber = 0;
let timeLeft = 30;
let timerInterval = null;
let answerValidated = false;
let teamAnswers = [];

const questionCounterElem = document.getElementById("questionCounter");
const questionTextElem = document.getElementById("questionText");
const optionsContainer = document.getElementById("optionsContainer");
const validateBtn = document.getElementById("validateBtn");
const resultMessageDiv = document.getElementById("resultMessage");
const timerDisplay = document.getElementById("timer");

const socket = io();

// ----- Fonctions -----
function getSelectedIndices() {
    const checkboxes = document.querySelectorAll('#optionsContainer input[type="checkbox"]');
    const selected = [];
    checkboxes.forEach(cb => {
        if (cb.checked) selected.push(parseInt(cb.value));
    });
    return selected;
}

function updateTeamAnswers() {
    if (answerValidated) return;
    teamAnswers = getSelectedIndices();
    socket.emit("updateTeamAnswer", { answers: teamAnswers });
}

function setLimitMessage(limit) {
    if (limit) {
        resultMessageDiv.innerHTML = '<p>⚠️ Only ${limit} option(s) can be selected</p>';
    } else {
        resultMessageDiv.innerHTML = "";
    }
}

function animateButton() {
    validateBtn.classList.add('shake');
    setTimeout(() => {
        validateBtn.classList.remove('shake');
    }, 500);
}

function disableInputs(disabled) {
    const checkboxes = document.querySelectorAll('#optionsContainer input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.disabled = disabled;
    });
    validateBtn.disabled = disabled;
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
        } else {
            timeLeft--;
            if (timerDisplay) timerDisplay.textContent = timeLeft;
            
            if (timeLeft === 5) {
                timerDisplay.style.color = "#ff6b6b";
                timerDisplay.style.fontSize = "1.3em";
            }
        }
    }, 1000);
}

function attachLimitHandlers() {
    const q = questions[currentIndex];
    if (!q) return;
    
    const maxChoices = q.maxChoices;
    if (!maxChoices || maxChoices <= 0) return;

    const checkboxes = document.querySelectorAll('#optionsContainer input[type="checkbox"]');
    const handler = function(event) {
        if (answerValidated) {
            event.preventDefault();
            return;
        }
        const cb = event.target;
        const currentlyChecked = getSelectedIndices().length;
        if (!cb.checked && currentlyChecked >= maxChoices) {
            event.preventDefault();
            setLimitMessage(maxChoices);
            animateButton();
        } else {
            setLimitMessage(null);
            setTimeout(() => updateTeamAnswers(), 0);
        }
    };
    checkboxes.forEach(cb => {
        cb.removeEventListener('click', handler);
        cb.addEventListener('click', handler);
    });
}

function displayCurrentQuestion() {
    const q = questions[currentIndex];
    if (!q) return;

    if (questionCounterElem) {
        questionCounterElem.textContent = `Question ${currentQuestionNumber} / ${totalQuestions}`;
    }

    if (questionTextElem) {
        questionTextElem.innerHTML = `<p>${q.text}</p>`;
    }

    let optionsHtml = "";
    q.options.forEach((opt, idx) => {
        const optionId = `opt_${idx}`;
        const isChecked = teamAnswers.includes(idx);
        optionsHtml += `
            <input type="checkbox" id="${optionId}" name="questionOption" value="${idx}" ${isChecked ? 'checked' : ''}>
            <label for="${optionId}" class="quiz-card">${opt}</label>
        `;
    });
    
    if (optionsContainer) {
        optionsContainer.innerHTML = optionsHtml;
    }
    
    if (resultMessageDiv) {
        resultMessageDiv.innerHTML = "";
    }
    
    answerValidated = false;
    
    if (validateBtn) {
        validateBtn.style.display = "block";
        validateBtn.disabled = false;
        validateBtn.textContent = "CONFIRM";
    }
    
    if (timerDisplay) {
        timerDisplay.style.color = "";
        timerDisplay.style.fontSize = "";
    }

    attachLimitHandlers();
    
    const checkboxes = document.querySelectorAll('#optionsContainer input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', () => updateTeamAnswers());
    });
    
    timeLeft = 30;
    if (timerDisplay) timerDisplay.textContent = timeLeft;
    startTimer();
}

function showFinalCorrection(data) {
    if (timerInterval) clearInterval(timerInterval);
    
    let resultsHtml = `
        <div style="padding: 20px; max-height: 80vh; overflow-y: auto;">
            <h1 style="font-size: 36px; margin-bottom: 20px;">FINAL SCORE</h1>
            <h2 style="font-size: 28px; margin-bottom: 30px;">${data.score} / ${data.total}</h2>
            <div style="display: flex; flex-direction: column; gap: 20px;">
    `;
    
    data.results.forEach((result, idx) => {
        const isCorrect = result.isCorrect;
        resultsHtml += `
            <div style="background: rgba(255,255,255,0.1); border-radius: 15px; padding: 20px; text-align: left;">
                <h3 style="margin-bottom: 15px;">
                    ${isCorrect ? '✅' : '❌'} Question ${idx + 1}: ${result.questionText}
                </h3>
                <div style="margin: 15px 0;">
                    <strong style="color: #F9A620;">Team's answer :</strong><br>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px;">
        `;
        
        if (result.userAnswers.length === 0) {
            resultsHtml += `<span style="background: #666; padding: 5px 15px; border-radius: 20px;">No answer</span>`;
        } else {
            result.userAnswers.forEach(answerIdx => {
                resultsHtml += `<span style="background: #F9A620; padding: 5px 15px; border-radius: 20px;">${result.options[answerIdx]}</span>`;
            });
        }
        
        resultsHtml += `
                    </div>
                </div>
                <div>
                    <strong style="color: #F9A620;">Correct answer :</strong><br>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px;">
        `;
        
        result.correctAnswers.forEach(correctIdx => {
            resultsHtml += `<span style="background: #104911; padding: 5px 15px; border-radius: 20px;">${result.options[correctIdx]}</span>`;
        });
        
        resultsHtml += `
                    </div>
                </div>
                <p style="margin-top: 15px; font-size: 14px; color: #ddd;">
                    💡 ${result.explanation}
                </p>
            </div>
        `;
    });
    
    resultsHtml += `
            </div>
            <button id="backToLobbyBtn" style="margin-top: 30px; padding: 12px 24px; font-size: 18px; background: #F9A620; border: none; border-radius: 10px; cursor: pointer;">
                BACK TO LOBBY
            </button>
        </div>
    `;
    
    if (questionTextElem) {
        questionTextElem.innerHTML = resultsHtml;
    }
    
    if (optionsContainer) {
        optionsContainer.innerHTML = "";
    }
    
    if (validateBtn) {
        validateBtn.style.display = "none";
    }
    
    if (questionCounterElem) {
        questionCounterElem.style.display = "none";
    }
    
    if (timerDisplay && timerDisplay.parentElement) {
        timerDisplay.parentElement.style.display = "none";
    }
    
    // Ajout de l'écouteur sur le bouton
    const backBtn = document.getElementById("backToLobbyBtn");
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            socket.emit("endGame");
        });
    }
}

function onValidate() {
    if (answerValidated) return;

    const selected = getSelectedIndices();
    if (selected.length === 0) {
        animateButton();
        if (resultMessageDiv) {
            resultMessageDiv.innerHTML = "<p>⚠️ The team has to select at least one answer !</p>";
        }
        return;
    }

    answerValidated = true;
    disableInputs(true);

    if (timerInterval) clearInterval(timerInterval);

    socket.emit("validateTeamAnswerAndNext");

    if (validateBtn) {
        validateBtn.disabled = true;
    }

    if (resultMessageDiv) {
        resultMessageDiv.innerHTML = "<p>Answer saved !</p>";
    }
}

// ---------- Socket Events ----------
socket.on("nextQuestion", (data) => {
    console.log(`📥 Question ${data.questionNumber} reçue`);
    currentIndex = data.index;
    currentQuestionNumber = data.questionNumber;
    teamAnswers = data.teamAnswers || [];
    displayCurrentQuestion();
});

socket.on("startQuizGame", () => {
    console.log("🎮 Démarrage du quiz collaboratif");
    socket.emit("requestAllQuestions");
});

socket.on("allQuestions", (allQuestions) => {
    questions = allQuestions;
    totalQuestions = questions.length;
    currentIndex = 0;
    currentQuestionNumber = 1;
    teamAnswers = [];
    displayCurrentQuestion();
});

socket.on("teamAnswersUpdated", (data) => {
    if (answerValidated) return;
    
    teamAnswers = data.teamAnswers;
    
    const checkboxes = document.querySelectorAll('#optionsContainer input[type="checkbox"]');
    checkboxes.forEach((cb, idx) => {
        cb.checked = teamAnswers.includes(parseInt(cb.value));
    });
});

socket.on("answerValidated", (data) => {
    console.log(`✅ Réponse validée pour la question ${data.questionIndex + 1}`);
    if (resultMessageDiv && !answerValidated) {
        resultMessageDiv.innerHTML = `Answer saved ! Question ${data.nextQuestionNumber} incoming...`;
    }
});

socket.on("quizFinished", (data) => {
    console.log("🏁 Quiz terminé, affichage de la correction finale");
    showFinalCorrection(data);
});

socket.on("gameReset", () => {
    window.location.href = "index.html";
});

// Initialisation
if (validateBtn) {
    validateBtn.addEventListener("click", onValidate);
}

socket.emit("startQuizGame");