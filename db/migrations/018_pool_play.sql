-- Pool play before the bracket (FEATURE_TRACKER.md item 18).
--
-- Every team plays a few pool games; the standings become the bracket's seed order.
-- Additive and defaulted: no existing tournament changes mode, and nothing reads the new
-- table unless a tournament is in pool_play mode.

-- A third way to seed, alongside 'automatic' (draw order) and 'manual' (drag to order).
ALTER TABLE tournaments
  MODIFY COLUMN seeding_mode ENUM('automatic', 'manual', 'pool_play') NOT NULL DEFAULT 'automatic';

-- How many pool games each team plays. Only read in pool_play mode; PoolPlay::MIN_GAMES
-- and MAX_GAMES (2..5) bound it.
ALTER TABLE tournaments
  ADD COLUMN pool_games TINYINT NOT NULL DEFAULT 3 AFTER seeding_mode;

-- Pool games live in their own table rather than in `matches` on purpose. Every reader of
-- `matches` assumes it holds the bracket: champion detection, the score cascade, the
-- tournament list's round/progress stats, link previews, round-completed notifications.
-- Pool games have no forward edges and no champion, and mixing them in would mean teaching
-- every one of those queries to skip them, with a silent wrong answer wherever one was
-- missed. A separate table needs no changes to any of them.
--
-- No row for a team sitting a round out (an odd field): its absence is the bye.
CREATE TABLE IF NOT EXISTS pool_matches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id INT NOT NULL,
  round INT NOT NULL,
  match_number INT NOT NULL,
  team1_id INT NOT NULL,
  team2_id INT NOT NULL,
  team1_score INT DEFAULT NULL,
  team2_score INT DEFAULT NULL,
  winner_id INT DEFAULT NULL,
  status ENUM('ready', 'complete') NOT NULL DEFAULT 'ready',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (team1_id) REFERENCES teams(id),
  FOREIGN KEY (team2_id) REFERENCES teams(id),
  FOREIGN KEY (winner_id) REFERENCES teams(id),
  INDEX idx_pool_matches_tournament_round (tournament_id, round, match_number)
);
