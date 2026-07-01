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
  { id: 3, name: "Town hall", unlocked: false, enigme:"Paris' most famous Anne (surname only)", answer:"hidalgo"},
  { id: 4, name: "Schools", unlocked: false, enigme: "number of buildings * number of houses - number of railway stations", answer: "47"},
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
  quizStartTime: null,
  questionStartTime: null,
  timerTimeout: null
};

const quizQuestions = [
  {
    text: "What percentage of passengers experienced delays of more than 30 minutes?",
    options: ["11%", "17%", "21%", "27%"],
    correct: [2],
    maxChoices: 4,
    explanation: "Selon l'étude, 21% des passagers ont subi un retard de plus de 30 minutes."
  },
  {
    text: "What standards should a shop meet ?",
    options: ["work with local producers exclusively", "be close to housings", "be huge in order to better manage large numbers of people", "prioritise seasonal and local products"],
    correct: [0, 2],
    maxChoices: 4,
    explanation: "Les commerces devraient travailler avec des producteurs locaux et privilégier les produits de saison."
  },
  {
    text: "Which company is using the heat produced by its AI to heat homes in Switzerland ?",
    options: ["Riot company", "Microsoft", "Google", "Infomaniak"],
    correct: [3],
    maxChoices: 4,
    explanation: "Infomaniak utilise la chaleur générée par son IA pour chauffer des logements en Suisse."
  }
];

function calculateFinalScore() {
  let score = 0;
  const results = [];
  
  for (let i = 0; i < quizQuestions.length; i++) {
    const userAnswers = quizState.allAnswers[i] || [];
    const correctAnswers = quizQuestions[i].correct;
    const isCorrect = userAnswers.length === correctAnswers.length &&
      correctAnswers.every(idx => userAnswers.includes(idx));
    
    if (isCorrect) score++;
    
    results.push({
      questionIndex: i,
      questionText: quizQuestions[i].text,
      userAnswers: userAnswers,
      correctAnswers: correctAnswers,
      options: quizQuestions[i].options,
      isCorrect: isCorrect,
      explanation: quizQuestions[i].explanation
    });
  }
  
  return { score, total: quizQuestions.length, results };
}

function nextQuestion() {
  quizState.currentQuestionIndex++;
  
  if (quizState.currentQuestionIndex >= quizQuestions.length) {
    console.log("🏁 Quiz terminé ! Affichage de la correction finale");
    const finalResults = calculateFinalScore();
    
    io.emit("quizFinished", {
      score: finalResults.score,
      total: finalResults.total,
      results: finalResults.results
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
    teamAnswers: quizState.teamAnswers
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
      console.log("⏰ Partie expirée après 45 minutes");
      resetGame();
    }, 45 * 60 * 1000);

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
    quizState.timerTimeout = null;

    socket.emit("allQuestions", quizQuestions);

    const firstQuestion = quizQuestions[0];
    console.log("📤 Envoi de la première question");
    io.emit("nextQuestion", {
        index: 0,
        question: firstQuestion,
        totalQuestions: quizQuestions.length,
        questionNumber: 1,
        teamAnswers: []
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