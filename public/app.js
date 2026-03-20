// Configuration : sur le même domaine, le port est soit le même si statique, ou /api pour relative
const API_URL = '/api';

// État global
let currentQuestionId = null;
let stats = {
    seen: 0,
    correct: 0,
    wrong: 0
};
let isAnswering = false;

// Sélecteurs d'éléments du DOM
const flagImage = document.getElementById('flag-image');
const loader = document.getElementById('loader');
const optionsContainer = document.getElementById('options-container');
const resultMessage = document.getElementById('result-message');
const nextBtn = document.getElementById('next-btn');

const seenSpan = document.querySelector('#seen-badge span');
const correctSpan = document.querySelector('#correct-badge span');
const wrongSpan = document.querySelector('#wrong-badge span');

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', () => {
    // Tentative de récupération des stats locales du navigateur
    const savedStats = localStorage.getItem('flagQuizStats');
    if (savedStats) {
        stats = JSON.parse(savedStats);
        updateStats();
    }

    // Charger la première question
    loadQuestion();

    // Bouton suivant
    nextBtn.addEventListener('click', loadQuestion);
});

// Met à jour les scores sur l'UI et dans le localStorage
function updateStats() {
    seenSpan.textContent = stats.seen;
    correctSpan.textContent = stats.correct;
    wrongSpan.textContent = stats.wrong;
    localStorage.setItem('flagQuizStats', JSON.stringify(stats));
}

// Interroge l'API pour récupérer un nouveau drapeau à deviner
async function loadQuestion() {
    isAnswering = false;

    // Réinitialisation de l'UI
    flagImage.style.display = 'none';
    loader.style.display = 'block';
    optionsContainer.innerHTML = '';
    resultMessage.classList.add('hidden');
    resultMessage.className = 'result-message hidden';
    nextBtn.classList.add('hidden');

    try {
        const response = await fetch(`${API_URL}/question`);
        if (!response.ok) throw new Error("Erreur réseau");

        const data = await response.json();
        currentQuestionId = data.questionId;

        // Charger l'image dynamiquement, et ne l'afficher qu'une fois chargée
        flagImage.onload = () => {
            loader.style.display = 'none';
            flagImage.style.display = 'block';

            // On incrémente "drapeaux vus" seulement une fois que l'image apparaît
            stats.seen++;
            updateStats();
        };
        flagImage.src = data.flagUrl;

        // Génération dynamique des boutons avec les 4 réponses possibles
        const letters = ['a', 'b', 'c', 'd'];
        data.options.forEach((optionText, index) => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.innerHTML = `<span class="option-letter">${letters[index]}</span> ${optionText}`;
            btn.onclick = () => handleAnswer(btn, optionText);
            optionsContainer.appendChild(btn);
        });

    } catch (error) {
        console.error("Erreur lors du chargement de la question:", error);
        resultMessage.textContent = "Serveur indisponible ou erreur réseau.";
        resultMessage.classList.remove('hidden');
        resultMessage.classList.add('error');
    }
}

// S'exécute quand l'utilisateur clique sur une réponse
async function handleAnswer(selectedBtn, answer) {
    if (isAnswering) return;
    isAnswering = true;

    // Désactive tous les boutons pour empêcher le spam
    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach(btn => btn.disabled = true);

    try {
        const response = await fetch(`${API_URL}/answer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                questionId: currentQuestionId,
                answer: answer
            })
        });

        if (!response.ok) throw new Error("Erreur réseau");

        const data = await response.json();

        // Gérer le feedback visuel selon que la réponse soit correcte ou non
        if (data.correct) {
            selectedBtn.classList.add('correct');
            stats.correct++;

            resultMessage.textContent = "Bien joué ! 🎉";
            resultMessage.classList.add('success');
            resultMessage.classList.remove('hidden');
        } else {
            selectedBtn.classList.add('wrong');
            stats.wrong++;

            // Mettre en exergue le bouton de la bonne réponse
            buttons.forEach(btn => {
                // On vérifie le texte pur sans la lettre (astuce : on compare le texte du bouton ou bien grâce à notre map de data)
                if (btn.textContent.includes(data.correctAnswer)) {
                    btn.classList.add('correct');
                }
            });

            resultMessage.textContent = `Faux ! La bonne réponse était : ${data.correctAnswer}`;
            resultMessage.classList.add('error');
            resultMessage.classList.remove('hidden');
        }

        updateStats();
        nextBtn.classList.remove('hidden'); // Afficher le bouton suivant

    } catch (error) {
        console.error("Erreur de vérification de réponse:", error);
        resultMessage.textContent = "Vérification impossible (api fermée ?).";
        resultMessage.classList.remove('hidden');
        resultMessage.classList.add('error');
        nextBtn.classList.remove('hidden');
    }
}
