-- Adds user accounts, scoped tournament roles, and an audit trail.
-- Existing admins are copied as active super-admin users. Existing tournaments
-- intentionally have no owner because the legacy schema did not record one.

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NULL UNIQUE,
  email VARCHAR(255) NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('super_admin', 'organizer') NOT NULL DEFAULT 'organizer',
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO users (username, password_hash, role, status)
SELECT username, password_hash, 'super_admin', 'active'
FROM admins
ON DUPLICATE KEY UPDATE
  password_hash = VALUES(password_hash),
  role = 'super_admin',
  status = 'active';

ALTER TABLE tournaments
  ADD COLUMN created_by_user_id INT NULL AFTER status,
  ADD CONSTRAINT fk_tournaments_created_by_user
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE tournament_members (
  tournament_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('owner', 'manager', 'scorekeeper') NOT NULL,
  granted_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tournament_id, user_id),
  INDEX idx_tournament_members_user (user_id),
  CONSTRAINT fk_tournament_members_tournament
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  CONSTRAINT fk_tournament_members_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tournament_members_granted_by
    FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE audit_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tournament_id INT NULL,
  actor_user_id INT NULL,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(100) NULL,
  target_id VARCHAR(100) NULL,
  details_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_log_tournament_created (tournament_id, created_at),
  INDEX idx_audit_log_actor_created (actor_user_id, created_at),
  CONSTRAINT fk_audit_log_tournament
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_log_actor
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);
