-- SSCircle V10.49.0: reviewable, additive D1 schema only.
-- Worker seeds legacy totals once via minecraft_multi_migrated; do not manually
-- duplicate history or alter minecraft_accounts/playerdata/UUID.
CREATE TABLE IF NOT EXISTS minecraft_multi_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 1,
  max_accounts INTEGER NOT NULL DEFAULT 3,updated_at TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO minecraft_multi_settings(id,enabled,max_accounts,updated_at)
VALUES(1,1,3,'');
CREATE TABLE IF NOT EXISTS minecraft_account_preferences (
  account_id TEXT PRIMARY KEY,application_id TEXT NOT NULL,is_primary INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(account_id) REFERENCES minecraft_accounts(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mc_primary_per_member
  ON minecraft_account_preferences(application_id) WHERE is_primary=1;
CREATE TABLE IF NOT EXISTS minecraft_account_audit (
  id TEXT PRIMARY KEY,application_id TEXT NOT NULL,account_id TEXT NOT NULL,
  action TEXT NOT NULL,at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mc_account_audit_member
  ON minecraft_account_audit(application_id,at);
CREATE TABLE IF NOT EXISTS minecraft_account_stat_progress (
  application_id TEXT NOT NULL,provider TEXT NOT NULL,provider_id TEXT NOT NULL,
  season_id TEXT NOT NULL,last_captured_at TEXT NOT NULL,
  last_playtime INTEGER NOT NULL DEFAULT 0,last_deaths INTEGER NOT NULL DEFAULT 0,
  last_mobs INTEGER NOT NULL DEFAULT 0,last_blocks INTEGER NOT NULL DEFAULT 0,
  total_playtime INTEGER NOT NULL DEFAULT 0,total_deaths INTEGER NOT NULL DEFAULT 0,
  total_mobs INTEGER NOT NULL DEFAULT 0,total_blocks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(application_id,provider,provider_id,season_id)
);
CREATE INDEX IF NOT EXISTS idx_mc_acct_stats_member_season
  ON minecraft_account_stat_progress(application_id,season_id);
CREATE TABLE IF NOT EXISTS minecraft_multi_migrated (
  id INTEGER PRIMARY KEY CHECK(id=1),at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS minecraft_stat_legacy (
  application_id TEXT NOT NULL,season_id TEXT NOT NULL,
  playtime_seconds INTEGER NOT NULL,deaths INTEGER NOT NULL,
  mob_kills INTEGER NOT NULL,blocks_mined INTEGER NOT NULL,
  last_synced_at TEXT NOT NULL,PRIMARY KEY(application_id,season_id)
);
