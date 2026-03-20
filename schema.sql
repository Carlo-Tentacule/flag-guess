-- Script de création de la table pour les statistiques des drapeaux
-- Cette table est stockée sur votre instance RDS ou votre serveur DB privé.

CREATE TABLE IF NOT EXISTS flag_stats (
    -- country_code sert d'identifiant en s'appuyant sur la norme ISO alpha-2 (2 caractères)
    country_code VARCHAR(2) PRIMARY KEY,
    
    -- Statistiques globales des réponses
    correct_guesses INT NOT NULL DEFAULT 0,
    wrong_guesses INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
