-- Adds participant self-registration (a coordinator shares a tournament's public link/QR
-- at an event; attendees add themselves to the roster). Organizer-added participants are
-- auto-approved (existing behavior, unaffected); self-registered ones start 'pending'
-- until the organizer approves or rejects (rejects reuse the existing delete endpoint —
-- a pending row is a real row, so deleting it is the reject action).
--
-- TeamController::draw() and the participant-count/eligibility checks must only consider
-- 'approved' rows — a pending walk-up registration should never silently end up on a team
-- without the organizer having seen it.

ALTER TABLE participants
  ADD COLUMN registration_status ENUM('approved', 'pending') NOT NULL DEFAULT 'approved' AFTER name;
