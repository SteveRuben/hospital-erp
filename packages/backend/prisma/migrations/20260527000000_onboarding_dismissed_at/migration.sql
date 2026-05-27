-- Per-admin onboarding wizard dismissal timestamp. NULL = wizard pending
-- for this user. The API re-prompts after a 7-day cooldown so an admin who
-- dismissed weeks ago is reminded — matches Option B of the 2026-05-27
-- "is sessionStorage really the right scope?" review.
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_dismissed_at TIMESTAMP;
