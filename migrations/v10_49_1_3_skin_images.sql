-- SSCircle V10.49.1.3 (staging): optional idempotent D1 migration.
-- Worker creates this table automatically when the DB binding is available.
-- Do not run in production without backup and staging verification.
CREATE TABLE IF NOT EXISTS minecraft_account_skin_images (
  account_id TEXT PRIMARY KEY,
  texture_hash TEXT NOT NULL,
  png_base64 TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(account_id) REFERENCES minecraft_accounts(id) ON DELETE CASCADE
);
