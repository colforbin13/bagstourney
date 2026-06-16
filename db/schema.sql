-- Bean Bag Tournament Database Schema
-- MySQL 5.7+

CREATE DATABASE IF NOT EXISTS beanbag_tournament CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE beanbag_tournament;

-- Admin users
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tournament
CREATE TABLE IF NOT EXISTS tournaments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  status ENUM('setup', 'active', 'complete') DEFAULT 'setup',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Participants (individuals entered before teams are drawn)
CREATE TABLE IF NOT EXISTS participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

-- Teams (2 participants per team, created when draw happens)
CREATE TABLE IF NOT EXISTS teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  participant1_id INT NOT NULL,
  participant2_id INT NOT NULL,
  seed INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (participant1_id) REFERENCES participants(id),
  FOREIGN KEY (participant2_id) REFERENCES participants(id)
);

-- Bracket matches
CREATE TABLE IF NOT EXISTS matches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id INT NOT NULL,
  round INT NOT NULL,               -- 1 = first round, 2 = quarterfinal, etc.
  match_number INT NOT NULL,        -- position within the round
  team1_id INT DEFAULT NULL,
  team2_id INT DEFAULT NULL,
  team1_score INT DEFAULT NULL,
  team2_score INT DEFAULT NULL,
  winner_id INT DEFAULT NULL,
  next_match_id INT DEFAULT NULL,   -- where winner advances to
  next_match_slot TINYINT DEFAULT NULL, -- 1 = team1 slot, 2 = team2 slot
  status ENUM('pending', 'ready', 'complete') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (team1_id) REFERENCES teams(id),
  FOREIGN KEY (team2_id) REFERENCES teams(id),
  FOREIGN KEY (winner_id) REFERENCES teams(id),
  FOREIGN KEY (next_match_id) REFERENCES matches(id)
);

-- Seed default admin (password: admin123 — CHANGE THIS)
INSERT INTO admins (username, password_hash) VALUES
  ('admin', '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi');

-- Example tournament (optional, remove for production)
-- INSERT INTO tournaments (name, status) VALUES ('Summer 2025', 'setup');
