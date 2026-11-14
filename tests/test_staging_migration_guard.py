"""Offline checks for the SSCircle D1 staging migration guard."""

import sys
import sqlite3
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from validate_staging_migration import validate


class StagingGuardTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)
        (self.root / "migrations").mkdir()
        (self.root / "migrations" / "v10_51_example.sql").write_text(
            "CREATE TABLE IF NOT EXISTS staging_example (id INTEGER PRIMARY KEY);",
            encoding="utf-8",
        )

    def tearDown(self):
        self.tempdir.cleanup()

    def test_accepted_staging_database_and_reviewed_sql(self):
        self.assertEqual(
            validate("sscircle-staging", "v10_51_example.sql", self.root).name,
            "v10_51_example.sql",
        )
        validate("staging_sscircle_test", "v10_51_example.sql", self.root)

    def test_production_and_ambiguous_targets_rejected(self):
        for name in ("sscircle", "sscircle-production", "sscircle-prod",
                     "sscircle-staging-production", "staging-live", "staging2",
                     "", "staging; DROP DATABASE"):
            with self.subTest(name=name):
                with self.assertRaises(ValueError):
                    validate(name, "v10_51_example.sql", self.root)

    def test_unreviewed_paths_and_empty_files_rejected(self):
        (self.root / "migrations" / "empty.sql").touch()
        for name in ("../production.sql", "test.yml", "empty.sql",
                     "not-present.sql", "/tmp/a.sql", "bad name.sql"):
            with self.subTest(name=name):
                with self.assertRaises(ValueError):
                    validate("sscircle-staging", name, self.root)


    def test_destructive_sql_is_rejected_from_automatic_staging(self):
        migration = self.root / "migrations" / "v10_58_unsafe.sql"
        statements = [
            "DROP TABLE submissions;",
            "DROP INDEX idx_players;",
            "ALTER TABLE members DROP COLUMN name;",
            "DELETE FROM member_profiles;",
            "ATTACH DATABASE 'other.db' AS other;",
            "PRAGMA writable_schema=ON;",
            "PRAGMA foreign_keys=OFF;",
        ]
        for statement in statements:
            with self.subTest(statement=statement):
                migration.write_text(statement, encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "destruktif"):
                    validate("sscircle-staging", migration.name, self.root)

    def test_keywords_inside_comments_are_not_destructive_sql(self):
        migration = self.root / "migrations" / "v10_58_notes.sql"
        migration.write_text(
            "-- DROP TABLE is forbidden by policy, but this is only a note\n"
            "CREATE TABLE IF NOT EXISTS notes (text TEXT NOT NULL);\n"
            "INSERT INTO notes(text) VALUES('DELETE FROM is just text');",
            encoding="utf-8",
        )
        self.assertEqual(
            validate("sscircle-staging", migration.name, self.root), migration
        )

    def test_additive_sql_can_be_replayed_without_duplicate_schema(self):
        migration = self.root / "migrations" / "v10_58_additive.sql"
        sql = ("CREATE TABLE IF NOT EXISTS sscircle_stage_check "
               "(id TEXT PRIMARY KEY, value INTEGER DEFAULT 0);"
               "CREATE INDEX IF NOT EXISTS idx_stage_value "
               "ON sscircle_stage_check(value);")
        migration.write_text(sql, encoding="utf-8")
        approved = validate("sscircle-staging", migration.name, self.root)
        db = sqlite3.connect(":memory:")
        try:
            db.executescript(approved.read_text(encoding="utf-8"))
            db.execute("INSERT INTO sscircle_stage_check(id,value) VALUES('member-1',1)")
            db.executescript(approved.read_text(encoding="utf-8"))
            self.assertEqual(db.execute(
                "SELECT COUNT(*) FROM sscircle_stage_check").fetchone()[0], 1)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
