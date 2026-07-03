const socket = io();
let currentPlayers = [];
let hasJoined = false;   // Indique si ce client a cliqué sur "Join"

// --- Détection lobby : redirection si partie déjà commencée ---
if (document.getElementById("pseudo")) {
  socket.on("gameState", (started) => {
    if (started && !hasJoined) {
      window.location.href = "waiting.html";
    }
  });

  socket.on("redirectWaiting", () => {
    window.location.href = "waiting.html";
  });
}

// --- Fonctions existantes ---
function join() {
  const pseudo = document.getElementById("pseudo").value;
  socket.emit("join", pseudo);
  hasJoined = true;   // Ce client a rejoint
}

function startGame() {
  const button = document.getElementById("startBtn");

  if (currentPlayers.length < 1) {
    button.classList.add("shake");
    setTimeout(() => {
      button.classList.remove("shake");
    }, 400);
    return;
  }

  socket.emit("startGame");
}

function openEnigme(building) {
  const modal = document.createElement("div");
  modal.classList.add("modal");

  // Prévient le serveur que ce joueur est sur cette énigme -> LED du bâtiment clignote
  socket.emit("enigmeOpened", building.id);

  const hasAudio = building.audioFile && building.audioFile !== "";
  
  modal.innerHTML = `
    <div class="modal-content">
      <button class="close-modal">
        <img src="boutonCroix.png" alt="Fermer">
      </button>
      <h2>${building.name}</h2>

      <p style="font-weight: normal;">${building.enigme}</p>

      ${hasAudio ? `
        <div class="audio-player">
          <audio id="enigmeAudio" controls>
            <source src="assets/audio/${building.audioFile}" type="audio/mpeg">
            Ton navigateur ne supporte pas l'élément audio.
          </audio>
        </div>
      ` : ''}

      <input type="text" id="answerInput" placeholder="Your answer...">

      <button id="validateBtn">Confirm</button>

      <p id="result"></p>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector(".close-modal").onclick = () => {
      if (hasAudio) {
        const audio = document.getElementById("enigmeAudio");
        if (audio) {
          audio.pause();
          audio.currentTime = 0;
        }
      }
      // Prévient le serveur que ce joueur a quitté l'énigme (LED s'éteint si plus personne dessus)
      socket.emit("enigmeClosed", building.id);
      modal.remove();
  };

  document.getElementById("validateBtn").onclick = () => {
    const value = document.getElementById("answerInput").value;

    if (value.trim().toLowerCase() === building.answer.trim().toLowerCase()) {
      socket.emit("unlockBuilding", building.id);
      
      if (hasAudio) {
        const audio = document.getElementById("enigmeAudio");
        if (audio) audio.pause();
      }
      
      modal.remove();
      window.location.href = `${building.name}.html`;
    } else {
      document.getElementById("result").textContent = "Mauvaise réponse";
      const input = document.getElementById("answerInput");
      input.classList.add("shake");
      setTimeout(() => input.classList.remove("shake"), 500);
    }
  };
}

function render(buildings) {
  const grid = document.getElementById("grid");
  if (!grid) return;
  grid.innerHTML = "";

  buildings.forEach(b => {
    const div = document.createElement("div");
    div.classList.add("building");

    if (b.unlocked) {
      div.classList.add("unlocked");
      div.textContent = b.name + " 🔓";
    } else {
      div.classList.add("locked");
      div.textContent = b.name + " 🔒";
    }

    div.onclick = () => {
      if (!b.unlocked) {
        openEnigme(b); 
      }
      else {
        window.location.href = `${b.name}.html`;
      }
    };

    grid.appendChild(div);
  });
}

// --- Événements Socket ---
socket.on("updatePlayers", (players) => {
  currentPlayers = players;
  const container = document.getElementById("players");
  if (container) {
    container.innerHTML = "";

    players.forEach(player => {
      const div = document.createElement("div");
      div.classList.add("player-card");
      div.textContent = player.pseudo;
      container.appendChild(div);
    });
  }
});

socket.on("gameStarted", () => {
  localStorage.removeItem("introSeen");
  // Seul un joueur ayant rejoint reçoit cet événement
  window.location.href = "accueil.html";
});

socket.on("startTimer", (data) => {
  console.log("⏱ Timer serveur reçu :", data);

  // synchronisation propre (important)
  const serverStart = data.startTimestamp;
  const now = Date.now();
  const drift = now - serverStart;

  const adjustedMinutes = data.durationMinutes - (drift / 60000);

  const finalMinutes = Math.max(0, adjustedMinutes);

  nouveauCompteRebours(finalMinutes);
});

socket.on("initBuildings", (buildings) => {
  render(buildings);
});

socket.on("updateBuildings", (buildings) => {
  render(buildings);
});

socket.on("startQuiz", () => {
  window.location.href = "quiz.html";
});

socket.on("gameReset", () => {
  window.location.href = "index.html";
});

socket.on("showEndGamePopup", () => {
  console.log("🔥 popup reçu");

  if (document.querySelector(".end-modal")) return;

  const modal = document.createElement("div");
  modal.classList.add("modal", "end-modal");

  modal.innerHTML = `
    <div class="modal-content">
      <h2>END OF GAME</h2>
      <p id="countdownText">
        You will be redirected in 5 seconds...
      </p>
    </div>
  `;

  document.body.appendChild(modal);

  let countdown = 5;

  const interval = setInterval(() => {
    countdown--;
    document.getElementById("countdownText").textContent =
      `You will be redirected in ${countdown} seconds...`;

    if (countdown <= 0) {
      clearInterval(interval);
      socket.emit("endGame");
      window.location.href = "index.html";
    }
  }, 1000);
});

// --- Compte à rebours ---
let intervalId = null;
let compteurSpan = null;

function sauvegarderHeureFin(timestamp) {
  localStorage.setItem('compteRebours_fin', timestamp);
}

function getHeureFinStockee() {
  const ts = localStorage.getItem('compteRebours_fin');
  if (!ts) return null;
  const timestamp = parseInt(ts, 10);
  return isNaN(timestamp) ? null : timestamp;
}

function effacerStockage() {
  localStorage.removeItem('compteRebours_fin');
}

function calculerTempsRestant(timestampFin) {
  const maintenant = Date.now();
  const diffMs = timestampFin - maintenant;
  if (diffMs <= 0) return "00:00";
  const secondesTotales = Math.floor(diffMs / 1000);
  const minutes = Math.floor(secondesTotales / 60);
  const secondes = secondesTotales % 60;
  return `${minutes.toString().padStart(2, '0')}:${secondes.toString().padStart(2, '0')}`;
}

function mettreAJourAffichage(timestampFin) {
  if (!compteurSpan) return;
  const tempsRestant = calculerTempsRestant(timestampFin);
  compteurSpan.innerText = tempsRestant;
  if (tempsRestant === "00:00") {
      if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
      }
      effacerStockage();
      compteurSpan.innerText = "Temps écoulé !";
      ouvrirPopupPret();
  }
}

function demarrerCompteRebours(timestampFin) {
  if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
  }

  mettreAJourAffichage(timestampFin);

  if (calculerTempsRestant(timestampFin) !== "00:00") {
      intervalId = setInterval(() => {
          mettreAJourAffichage(timestampFin);
      }, 1000);
  } else {
      effacerStockage();
      if (compteurSpan) window.location.href = "quiz.html";
  }
}

function nouveauCompteRebours(minutes) {
  const existing = getHeureFinStockee();

  // empêche double lancement
  if (existing && existing > Date.now()) return;

  const timestampFin = Date.now() + minutes * 60000;
  sauvegarderHeureFin(timestampFin);
  demarrerCompteRebours(timestampFin);
}

function restaurerCompteRebours() {
  compteurSpan = document.getElementById('compteur');
  if (!compteurSpan) return;

  const timestampFin = getHeureFinStockee();
  console.log(timestampFin);

  if (timestampFin && timestampFin > Date.now()) {
      demarrerCompteRebours(timestampFin);
  } else if (timestampFin && timestampFin <= Date.now()) {
      effacerStockage();
      compteurSpan.innerText = "Time is up";
  } else {
      compteurSpan.innerText = "no active timer";
  }
}


restaurerCompteRebours();
if (window.location.pathname.includes("accueil.html")) {
    window.addEventListener("load", () => {
        ouvrirPopupIntro();
    });
}

// --- Carrousel ---
const sliders = document.querySelectorAll(".section-card, .carousel-card");

sliders.forEach(slider => {
    const slides = slider.querySelectorAll(".slide");
    const dots = slider.querySelectorAll(".dot");
    const leftBtn = slider.querySelector(".left");
    const rightBtn = slider.querySelector(".right");
    let current = 0;

    function showSlide(index) {
        slides.forEach(slide => slide.classList.remove("active"));
        dots.forEach(dot => dot.classList.remove("active"));
        slides[index].classList.add("active");
        dots[index].classList.add("active");
    }

    if (rightBtn) {
      rightBtn.addEventListener("click", () => {
          current++;
          if(current >= slides.length) current = 0;
          showSlide(current);
      });
    }

    if (leftBtn) {
      leftBtn.addEventListener("click", () => {
          current--;
          if(current < 0) current = slides.length - 1;
          showSlide(current);
      });
    }

    let startX = 0;
    slider.addEventListener("touchstart", e => {
        startX = e.touches[0].clientX;
    });

    slider.addEventListener("touchend", e => {
        let endX = e.changedTouches[0].clientX;
        let diff = startX - endX;

        if(diff > 50) {
            current++;
            if(current >= slides.length) current = 0;
            showSlide(current);
        }

        if(diff < -50) {
            current--;
            if(current < 0) current = slides.length - 1;
            showSlide(current);
        }
    });
});

// --- Popup "Prêt pour le quiz" ---
function ouvrirPopupPret() {
    if(document.querySelector(".ready-modal")) return;

    const modal = document.createElement("div");
    modal.classList.add("modal", "ready-modal");

    modal.innerHTML = `
        <div class="modal-content">
            <h2>Time is up!</h2>
            <p style="font-weight: normal;">
                Please get ready for the quiz
            </p>
            <button id="readyBtn">
                READY
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("readyBtn").onclick = () => {
        socket.emit("playerReady");
    };
}

function ouvrirPopupIntro() {
    if (localStorage.getItem("introSeen") === "true") return;

    // Ne pas réafficher si elle existe déjà
    if (document.querySelector(".intro-modal")) return;

    const modal = document.createElement("div");
    modal.classList.add("modal", "intro-modal");

    modal.innerHTML = `
        <div class="modal-content">
            <h2>Welcome!</h2>

            <p style="font-weight: normal;">
                Ready to discover an alternative sustainable city, but not sure where to start?
            </p>
            <h3>🎯 Your mission</h3>

            <p style="font-weight: normal;">
                Solve the riddles to unlock each building.
            </p>
            <h3>🤝 Teamwork</h3>

            <p style="font-weight: normal;">
                The game is collaborative, so communicate with your teammates and avoid working on the same building.
            </p>
            <h3>🧠 Final challenge</h3>
            <p style="font-weight: normal;">
                Once the time is up, a final collaborative quiz will begin, so be sure to read all the information you discover carefully.
            </p>
            <p style="font-weight: bold; color:#F9A620;">
                The timer is already running. Click "Start the Adventure" and begin exploring!
            </p>

            <button id="startGameBtn">
                START THE ADVENTURE
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("startGameBtn").onclick = () => {
      localStorage.setItem("introSeen", "true");
        modal.remove();
    };
}

// =============================================
// BOUTON POUR FORCER LA FIN DU COMPTE À REBOURS
// =============================================
function finirCompteRebours() {
    // 1. Arrêter le rafraîchissement du timer
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    // 2. Effacer la clé localStorage pour éviter une reprise
    effacerStockage();
    // 3. Mettre à jour l'affichage du compteur
    if (compteurSpan) {
        compteurSpan.innerText = "00:00";
    }
    // 4. Afficher la pop-up "Prêt pour le quiz"
    ouvrirPopupPret();
}

// Écouteur sur le bouton (exécuté après le chargement du DOM)
document.addEventListener("DOMContentLoaded", function() {
    const forceBtn = document.getElementById("forceQuizBtn");
    if (forceBtn) {
        forceBtn.addEventListener("click", function() {
            finirCompteRebours();
        });
    }
});