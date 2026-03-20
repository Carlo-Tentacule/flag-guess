const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
// Servir les fichiers frontend situés dans le dossier "public"
app.use(express.static('public'));

// Variables pour stocker les pays en mémoire (évite les appels répétés à l'API flagcdn)
let countries = {};
let countryCodes = [];

// Pool de connexion à la base de données (MySQL / MariaDB)
// Utilise les variables d'environnement afin de respecter les bonnes pratiques AWS (variables injectées).
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Map contextuelle pour stocker la bonne réponse en fonction d'un questionId généré.
// Format: { 'uuid-de-la-question': 'code-iso-du-pays' }
const activeQuestions = new Map();

// Initialisation : récupérer la liste des pays depuis l'API de base
async function init() {
    try {
        const response = await fetch('https://flagcdn.com/en/codes.json');
        countries = await response.json();

        // On filtre uniquement les codes à 2 lettres (standard ISO)
        // car la liste inclut aussi des codes spécifiques (ex. provinces canadiennes ou organisations).
        countryCodes = Object.keys(countries).filter(c => c.length === 2);
        console.log(`Chargement de ${countryCodes.length} pays réussi.`);
    } catch (err) {
        console.error("Erreur lors de la récupération des pays:", err);
    }
}

// Fonction utilitaire pour tirer N éléments au hasard dans un tableau sans remise
function getRandomElements(arr, n) {
    const result = new Array(n);
    let len = arr.length;
    const taken = new Array(len);
    if (n > len) throw new RangeError("Trop d'éléments demandés !");
    while (n--) {
        const x = Math.floor(Math.random() * len);
        result[n] = arr[x in taken ? taken[x] : x];
        taken[x] = --len in taken ? taken[len] : len;
    }
    return result;
}

// Endpoint GET pour générer une nouvelle question
app.get('/api/question', (req, res) => {
    if (countryCodes.length === 0) {
        return res.status(500).json({ error: "Liste des pays non chargée" });
    }

    // 1. Tirer 4 pays au hasard
    const selectedCodes = getRandomElements(countryCodes, 4);

    // 2. Le premier de la sélection sera notre "bonne réponse"
    const correctCode = selectedCodes[0];

    // 3. Mélanger les 4 options sélectionnées pour l'affichage (sinon la bonne serait toujours en premier)
    const shuffledOptions = [...selectedCodes].sort(() => Math.random() - 0.5);

    // 4. Formater les options pour n'envoyer que les noms de pays au frontend
    const options = shuffledOptions.map(code => ({
        code: code,
        name: countries[code]
    }));

    // 5. Créer un ID unique pour la question
    const questionId = crypto.randomUUID();

    // 6. Mémoriser la bonne réponse pour cet ID côté serveur
    activeQuestions.set(questionId, correctCode);

    // Système de nettoyage basique pour éviter les fuites de mémoire (max 10 000 questions en attente)
    if (activeQuestions.size > 10000) {
        const firstKey = activeQuestions.keys().next().value;
        activeQuestions.delete(firstKey);
    }

    // Retourne les infos requises sans divulguer la bonne réponse
    res.json({
        questionId: questionId,
        flagUrl: `https://flagcdn.com/w320/${correctCode}.png`, // Chargement dynamique via API flagcdn (same width 320px)
        options: options.map(opt => opt.name)
    });
});

// Endpoint POST pour vérifier la réponse soumise par l'utilisateur
app.post('/api/answer', async (req, res) => {
    const { questionId, answer } = req.body; // answer contient le nom du pays envoyé

    if (!questionId || !answer) {
        return res.status(400).json({ error: "questionId et answer sont requis" });
    }

    // Récupère le code stocké via l'identifiant de la question
    const correctCode = activeQuestions.get(questionId);

    if (!correctCode) {
        return res.status(404).json({ error: "Question expirée ou incorrecte" });
    }

    const correctCountryName = countries[correctCode];
    const isCorrect = (answer === correctCountryName);

    // Une fois validée, on supprime la question pour éviter qu'une même requête postée plusieurs fois ne compte
    activeQuestions.delete(questionId);

    // Mettre à jour les statistiques globales en base de données
    try {
        if (pool) {
            const fieldToIncrement = isCorrect ? 'correct_guesses' : 'wrong_guesses';
            // Requête SQL de type "Mise à jour ou Insertion (Upsert)" selon que le flag existe déjà dans la table ou non
            const query = `
                INSERT INTO flag_stats (country_code, correct_guesses, wrong_guesses) 
                VALUES (?, ?, ?) 
                ON DUPLICATE KEY UPDATE ${fieldToIncrement} = ${fieldToIncrement} + 1
            `;
            await pool.query(query, [
                correctCode,
                isCorrect ? 1 : 0,
                isCorrect ? 0 : 1
            ]);
        }
    } catch (dbErr) {
        console.error("Erreur d'insertion en BDD, l'endpoint renvoie la réponse client sans planter:", dbErr);
    }

    // On renvoie la validation au frontend, accompagnée du nom de la bonne réponse
    res.json({
        correct: isCorrect,
        correctAnswer: correctCountryName
    });
});

// Lancement du serveur
const PORT = process.env.PORT || 3000;
init().then(() => {
    app.listen(PORT, () => {
        console.log(`Serveur démarré sur le port ${PORT}`);
    });
});
