"""Offline checks for the SSCircle D1 staging migration guard."""

import sys
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


if __name__ == "__main__":
    unittest.main()
