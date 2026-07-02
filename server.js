const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

const WebSocket = require("ws");

let gameStarted = false;
let gameTimeout = null; 

app.use(express.static("public"));

let players = [];
let waitingPlayers = [];

let buildings = [
  { id: 1, name: "Bus and railway stations", unlocked: false, enigme: "Which vehicule does the following sound like ?",
    answer: "train", audioFile: "train_sound.mp3"},
  { id: 2, name: "Hospital", unlocked: false, enigme: "Find the hidden disease", 
    answer: "tuberculosis"},
  { id: 3, name: "Town hall", unlocked: false, enigme:"Unscramble: OEVT", answer:"vote"},
  { id: 4, name: "Schools", unlocked: false, enigme: "Number of trees in the park * number of railway stations - total number of trees", answer: "-23"},
  { id: 5, name: "Parks", unlocked: false, enigme: "Who won the Noughts and Crosses (X/O)?", answer: "X"},
  { id: 6, name: "Shops", unlocked: false, enigme: "What is the city's main restaurant ?", answer: "pizzeria"},
  { id: 7, name: "Sharing areas", unlocked: false, enigme: "I am the only fruit here", answer: "tomato"},
  { id: 8, name: "Sports complex", unlocked: false, enigme: "Take a look at our backs", answer: "sustainable"},
  { id: 9, name: "Housing", unlocked: false, enigme: "Can you lift me up ?", answer: "cooperative"}
];

// =====================================================================
// ---------- Gestion des LEDs des bâtiments (ESP32) ----------
// =====================================================================
// Pour chaque bâtiment (id 1 à 9), on garde la liste des joueurs (socket.id)
// qui ont actuellement l'énigme ouverte.
let openEnigmes = {};
buildings.forEach(b => { openEnigmes[b.id] = new Set(); });

// État LED pour chaque bâtiment, dans l'ordre des ids (1 -> index 0, ... 9 -> index 8)
// '0' = éteint, '1' = clignote, '2' = allumé fixe
function computeLedString() {
  return buildings
    .map(b => {
      if (b.unlocked) return "2"; // énigme réussie -> allumé fixe
      if (openEnigmes[b.id].size > 0) return "1"; // au moins un joueur dessus -> clignote
      return "0"; // personne dessus et pas résolu -> éteint
    })
    .join("");
}

// ---------- Serveur WebSocket dédié à l'ESP32 ----------
const wss = new WebSocket.Server({ server: http, path: "/esp32" });
let esp32Clients = new Set();

function broadcastLedStates() {
  const ledString = computeLedString();
  esp32Clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(ledString);
    }
  });
}

wss.on("connection", (ws) => {
  console.log("🔌 ESP32 connecté");
  esp32Clients.add(ws);

  // Envoie l'état actuel dès la connexion
  ws.send(computeLedString());

  ws.on("close", () => {
    esp32Clients.delete(ws);
    console.log("🔌 ESP32 déconnecté");
  });

  ws.on("error", () => {
    esp32Clients.delete(ws);
  });
});

// Remet toutes les énigmes ouvertes à zéro (appelé à la fin de partie)
function resetOpenEnigmes() {
  buildings.forEach(b => { openEnigmes[b.id] = new Set(); });
}

function resetGame() {
  console.log("🔥 reset game");

  if (gameTimeout) {
    clearTimeout(gameTimeout);
    gameTimeout = null;
  }

  gameStarted = false;
  players = [];
  waitingPlayers = [];

  buildings = buildings.map(b => ({
    ...b,
    unlocked: false
  }));

  if (quizState.timerTimeout) {
    clearTimeout(quizState.timerTimeout);
  }

  quizState = {
    isActive: false,
    currentQuestionIndex: 0,
    teamAnswers: [],
    allAnswers: [],
    questionScores: [],
    quizStartTime: null,
    questionStartTime: null,
    timerTimeout: null
  };

  io.emit("updatePlayers", players);
  io.emit("updateBuildings", buildings);
  io.emit("gameReset");

    // Toutes les LEDs s'éteignent à la fin de la partie
  resetOpenEnigmes();
  broadcastLedStates();
}
// ---------- État du quiz collaboratif ----------
let quizState = {
  isActive: false,
  currentQuestionIndex: 0,
  teamAnswers: [],
  allAnswers: [],
  questionScores: [],
  quizStartTime: null,
  questionStartTime: null,
  timerTimeout: null
};

const quizQuestions = [
  {
  text: "Which ideas are part of a 15-minute city? (2)",
  options: [
    "Large free car parks",
    "Most daily needs nearby",
    "Less dependence on cars",
    "Longer commutes"
  ],
  correct: [1,2],
  maxChoices: 4,
  explanation: "A 15-minute city lets people reach most daily needs on foot or by bike, reducing the need for cars.",
  timed: true
},
{
  text: "What is 'appropriate care'? (2)",
  options: [
    "Avoid unnecessary treatments",
    "Close small hospitals",
    "Reduce unnecessary prescriptions",
    "Shorten every consultation"
  ],
  correct: [0,2],
  maxChoices: 4,
  explanation: "Appropriate care means avoiding unnecessary tests and prescriptions while maintaining high-quality healthcare.",
  timed: true
},
{
  text: "What is special about Infomaniak? (2)",
  options: [
    "It recovers data-centre heat",
    "It powers electric buses",
    "It heats nearby homes",
    "It produces hydrogen"
  ],
  correct: [0,2],
  maxChoices: 4,
  explanation: "The Swiss company Infomaniak uses the waste heat from its data centre to heat nearby homes.",
  timed: true
},
{
  text: "Why are trees so valuable in cities? (2)",
  options: [
    "They produce electricity",
    "They provide shade",
    "They absorb CO₂",
    "They reduce internet usage"
  ],
  correct: [1,2],
  maxChoices: 4,
  explanation: "Trees cool cities by providing shade while also absorbing CO₂ and improving air quality.",
  timed: true
},
{
  text: "Nordic schools are known for... (2)",
  options: [
    "More exams",
    "Personalised learning",
    "Greater school autonomy",
    "Longer school days"
  ],
  correct: [1,2],
  maxChoices: 4,
  explanation: "Nordic education focuses on autonomy, cooperation and personalised learning.",
  timed: true
},
{
  text: "How do cooperative supermarkets reduce prices? (2)",
  options: [
    "Members volunteer a few hours",
    "They only sell imported food",
    "Customers become co-owners",
    "They replace all cashiers"
  ],
  correct: [0,2],
  maxChoices: 4,
  explanation: "Members help run the supermarket and become co-owners, reducing operating costs.",
  timed: true
},
{
  text: "What is 'Design to Repair'? (2)",
  options: [
    "Replace worn parts",
    "Buy new equipment more often",
    "Make products easier to repair",
    "Use disposable materials"
  ],
  correct: [0,2],
  maxChoices: 4,
  explanation: "Products should be designed so that damaged parts can be replaced instead of throwing everything away.",
  timed: true
},
{
  text: "What makes local democracy more representative? (2)",
  options: [
    "Higher salaries for CEOs",
    "Financial support for elected officials",
    "More diverse candidates",
    "Fewer municipal councils"
  ],
  correct: [1,2],
  maxChoices: 4,
  explanation: "Better financial support helps people from all backgrounds become candidates, improving representation.",
  timed: true
},
{
  text: "Which initiatives are part of the sharing economy? (2)",
  options: [
    "Repair cafés",
    "Libraries of Things",
    "Shopping malls",
    "Private storage units"
  ],
  correct: [0,1],
  maxChoices: 4,
  explanation: "Repair cafés and Libraries of Things help people share resources instead of buying new ones.",
  timed: true
},
{
  text: "What can people exchange in a time bank? (2)",
  options: [
    "Money",
    "Hours of help",
    "Skills",
    "Cryptocurrency"
  ],
  correct: [1,2],
  maxChoices: 4,
  explanation: "Time banks allow people to exchange services and skills using time instead of money.",
  timed: true
}
];

function calculateFinalScore() {
  let totalPoints = 0;
  const results = [];
  
  for (let i = 0; i < quizQuestions.length; i++) {
    const userAnswers = quizState.allAnswers[i] || [];
    const correctAnswers = quizQuestions[i].correct;
    const isCorrect = userAnswers.length === correctAnswers.length &&
      correctAnswers.every(idx => userAnswers.includes(idx));
    
    // Calcul du score pour cette question
    const questionScore = quizState.questionScores[i] || 0;
    
    totalPoints += questionScore;
    
    results.push({
      questionIndex: i,
      questionText: quizQuestions[i].text,
      userAnswers: userAnswers,
      correctAnswers: correctAnswers,
      options: quizQuestions[i].options,
      isCorrect: isCorrect,
      score: questionScore,
      explanation: quizQuestions[i].explanation
    });
  }
  
  // Détermination de la ligue
  let league = "Bronze";

if (totalPoints >= 9000) {
    league = "Challenger";
}
else if (totalPoints >= 7000) {
    league = "Master";
}
else if (totalPoints >= 4500) {
    league = "Platinium";
}

  return { 
    totalPoints, 
    totalQuestions: quizQuestions.length, 
    results,
    league
  };
}

function nextQuestion() {
  quizState.currentQuestionIndex++;
  
  if (quizState.currentQuestionIndex >= quizQuestions.length) {
    console.log("🏁 Quiz terminé ! Affichage de la correction finale");
    const finalResults = calculateFinalScore();
    
    io.emit("quizFinished", {
      totalPoints: finalResults.totalPoints,
      total: finalResults.totalQuestions,
      results: finalResults.results,
      league: finalResults.league
    });
    
    // Plus de timeout automatique – la réinitialisation se fait via endGame (clic sur "Retour au lobby")
    return;
  }
  
  quizState.teamAnswers = [];
  quizState.questionStartTime = Date.now();
  
  const currentQuestion = quizQuestions[quizState.currentQuestionIndex];
  
  console.log(`📤 Envoi de la question ${quizState.currentQuestionIndex + 1}`);
  
  io.emit("nextQuestion", {
    index: quizState.currentQuestionIndex,
    question: currentQuestion,
    totalQuestions: quizQuestions.length,
    questionNumber: quizState.currentQuestionIndex + 1,
    teamAnswers: quizState.teamAnswers,
    questionStartTime: quizState.questionStartTime
  });
  
  if (quizState.timerTimeout) {
    clearTimeout(quizState.timerTimeout);
  }
  
  quizState.timerTimeout = setTimeout(() => {
    console.log("⏰ Timer écoulé, auto-sauvegarde de la réponse...");
    if (quizState.isActive && quizState.questionStartTime) {
      const timeElapsed = Date.now() - quizState.questionStartTime;
      if (timeElapsed >= 30000) {
        autoSaveAnswer();
      }
    }
  }, 30000);
}

function autoSaveAnswer() {
  if (quizState.teamAnswers.length > 0 || quizState.allAnswers[quizState.currentQuestionIndex]) {
    saveCurrentAnswerAndContinue();
  } else {
    console.log("Aucune réponse sélectionnée, sauvegarde d'une réponse vide");
    quizState.allAnswers[quizState.currentQuestionIndex] = [];
    saveCurrentAnswerAndContinue();
  }
}

function saveCurrentAnswerAndContinue() {
  if (!quizState.allAnswers[quizState.currentQuestionIndex]) {
    quizState.allAnswers[quizState.currentQuestionIndex] = [...quizState.teamAnswers];
  }
  
  setTimeout(() => {
    if (quizState.isActive) {
      nextQuestion();
    }
  }, 1000);
}

io.on("connection", (socket) => {
  socket.emit("gameState", gameStarted);
  socket.emit("updatePlayers", players);
  console.log("Un joueur connecté");

  socket.on("join", (pseudo) => {
    if (gameStarted) {
      waitingPlayers.push({ id: socket.id, pseudo: pseudo });
      socket.emit("redirectWaiting");
      return;
    }

    players.push({
      id: socket.id,
      pseudo: pseudo
    });
    io.emit("updatePlayers", players);
  });
  
  socket.on("disconnect", () => {
    players = players.filter(p => p.id !== socket.id);
    waitingPlayers = waitingPlayers.filter(w => w.id !== socket.id);
    io.emit("updatePlayers", players);

    // Retire ce joueur de toutes les énigmes qu'il avait ouvertes
    let ledsChanged = false;
    buildings.forEach(b => {
      if (openEnigmes[b.id].delete(socket.id)) {
        ledsChanged = true;
      }
    });
    if (ledsChanged) broadcastLedStates();
  });

  socket.on("startGame", () => {
    if (gameStarted) return;
    if (players.length < 1) return;

    gameStarted = true;

    gameTimeout = setTimeout(() => {
      console.log("⏰ Partie expirée après 35 minutes");
      resetGame();
    }, 35 * 60 * 1000);

    // 1. Envoyer "gameStarted" aux joueurs ayant rejoint
    players.forEach(p => {
      const playerSocket = io.sockets.sockets.get(p.id);
      if (playerSocket) playerSocket.emit("gameStarted");
    });

    // 2. Envoyer "redirectWaiting" à tous les autres clients connectés
    const allSockets = io.sockets.sockets;
    for (let [socketId, clientSocket] of allSockets) {
      const isPlayer = players.some(p => p.id === socketId);
      if (!isPlayer) {
        clientSocket.emit("redirectWaiting");
      }
    }
  });

  socket.emit("initBuildings", buildings);

  socket.on("unlockBuilding", (id) => {
    const b = buildings.find(b => b.id === id);
    if (b) {
      b.unlocked = true;
      io.emit("updateBuildings", buildings);
      
      // L'énigme est résolue : plus personne n'est "dessus", la LED reste allumée fixe
      if (openEnigmes[id]) {
        openEnigmes[id].clear();
      }
      broadcastLedStates();
    }
  });

    // Un joueur ouvre l'énigme d'un bâtiment -> la LED correspondante doit clignoter
  socket.on("enigmeOpened", (id) => {
    if (openEnigmes[id]) {
      openEnigmes[id].add(socket.id);
      broadcastLedStates();
    }
  });

  // Un joueur ferme l'énigme sans la résoudre -> on le retire de la liste
  socket.on("enigmeClosed", (id) => {
    if (openEnigmes[id]) {
      openEnigmes[id].delete(socket.id);
      broadcastLedStates();
    }
  });
  
  socket.on("playerReady", () => {
    // Les énigmes non résolues s'arrêtent : leur LED ne doit plus clignoter
    buildings.forEach(b => {
      if (!b.unlocked) {
        openEnigmes[b.id].clear();
      }
    });
    broadcastLedStates();

    // Envoi du quiz aux joueurs actifs
    io.emit("startQuiz");
    
    // Redirection des joueurs en attente vers le lobby
    waitingPlayers.forEach(w => {
      const waitingSocket = io.sockets.sockets.get(w.id);
      if (waitingSocket) waitingSocket.emit("gameReset");
    });
    waitingPlayers = [];
  });
  
  socket.on("requestAllQuestions", () => {
    socket.emit("allQuestions", quizQuestions);
  });

  socket.on("startQuizGame", () => {
    console.log("🎮 Démarrage du quiz collaboratif");
    quizState.isActive = true;
    quizState.currentQuestionIndex = 0;
    quizState.teamAnswers = [];
    quizState.allAnswers = [];
    quizState.questionScores = [];
    quizState.timerTimeout = null;
    quizState.questionStartTime = Date.now();

    socket.emit("allQuestions", quizQuestions);

    const firstQuestion = quizQuestions[0];
    console.log("📤 Envoi de la première question");
    io.emit("nextQuestion", {
        index: 0,
        question: firstQuestion,
        totalQuestions: quizQuestions.length,
        questionNumber: 1,
        teamAnswers: [],
        questionStartTime: Date.now()
    });

    quizState.timerTimeout = setTimeout(() => {
        console.log("⏰ Timer première question écoulé");
        if (quizState.isActive) {
            autoSaveAnswer();
        }
    }, 30000);
  });
  
  socket.on("updateTeamAnswer", (data) => {
    if (!quizState.isActive) return;
    
    const { answers } = data;
    quizState.teamAnswers = answers;
    
    io.emit("teamAnswersUpdated", {
      teamAnswers: quizState.teamAnswers,
      questionIndex: quizState.currentQuestionIndex
    });
  });
  
  socket.on("endGame", () => {
    resetGame();
  });

  socket.on("validateTeamAnswerAndNext", () => {
    if (!quizState.isActive) return;

    console.log(`✅ Validation de la réponse pour la question ${quizState.currentQuestionIndex + 1} et passage à la suivante`);

    quizState.allAnswers[quizState.currentQuestionIndex] = [...quizState.teamAnswers];

    const question = quizQuestions[quizState.currentQuestionIndex];

    const isCorrect =
        quizState.teamAnswers.length === question.correct.length &&
        question.correct.every(i => quizState.teamAnswers.includes(i));

    let score = 0;

    if (isCorrect) {

        if (question.timed) {

            const elapsed = Date.now() - quizState.questionStartTime;
            const remaining = Math.max(0, 30000 - elapsed);

            score = 500 + Math.floor((remaining / 30000) * 500);

        } else {

            score = 1000;

        }
    }

    quizState.questionScores[quizState.currentQuestionIndex] = score;

    if (quizState.timerTimeout) {
        clearTimeout(quizState.timerTimeout);
    }

    io.emit("answerValidated", {
        questionIndex: quizState.currentQuestionIndex,
        nextQuestionNumber: quizState.currentQuestionIndex + 2
    });

    setTimeout(() => {
        if (quizState.isActive) {
            nextQuestion();
        }
    }, 1500);
  });
});

const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
  console.log("Serveur lancé sur http://localhost:3000");
});