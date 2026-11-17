-- Sponsor logos (FEATURE_TRACKER item 20). Shown in a bar across the bottom of the public
-- bracket page and of TV mode. Pro only, checked when a logo is added; logos already up keep
-- showing if the plan lapses, like every other paid feature mid-event.
--
-- The image lives in the database rather than on disk because deploy.ps1 mirrors the web
-- root and would delete any uploaded file on the next deploy. Logos are small (1 MB cap, see
-- api/lib/SponsorImage.php), and this way they are covered by the database backups too.
--
-- `token` is random and goes in the image URL, so a logo can't be fetched by walking ids, and
-- the URL can be cached forever: a logo is never replaced in place, only removed and re-added.

CREATE TABLE IF NOT EXISTS tournament_sponsors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  url VARCHAR(500) NULL,
  mime VARCHAR(20) NOT NULL,
  image MEDIUMBLOB NOT NULL,
  width INT UNSIGNED NOT NULL,
  height INT UNSIGNED NOT NULL,
  token CHAR(32) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  INDEX idx_sponsors_tournament (tournament_id, position)
);
