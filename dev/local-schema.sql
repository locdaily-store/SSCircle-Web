-- SSCircle standalone local D1 bootstrap. Never run with --remote.
-- Minimal legacy V8-compatible core schema. New SSCircle 10.49.x tables are
-- created by _worker.js on demand via ensureMemberCenter/ensureMailbox.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS form_config (
  id INTEGER PRIMARY KEY CHECK (id=1),
  settings TEXT NOT NULL DEFAULT '{}',
  pages TEXT NOT NULL DEFAULT '[]',
  questions TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  submitted_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  answers TEXT NOT NULL DEFAULT '{}',
  question_snapshot TEXT NOT NULL DEFAULT '[]',
  tracking_code TEXT UNIQUE,
  rejection_reason TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_ssc_local_submissions_time ON submissions(submitted_at);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS revoked_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'private',
  submission_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS media_blobs (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
