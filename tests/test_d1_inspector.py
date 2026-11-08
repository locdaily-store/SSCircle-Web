"""Offline tests: no Cloudflare access, no database credentials."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import d1_inspector as inspect


class InspectorTests(unittest.TestCase):
    def fake_reader(self, database, sql):
        self.assertEqual(database, "sscircle-staging")
        if "sqlite_master" in sql:
            return [{"name": "submissions"}, {"name": "minecraft_accounts"},
                    {"name": "member_credentials"}]
        if "PRAGMA table_info" in sql:
            return [
                {"name": "id", "type": "TEXT", "notnull": 1, "pk": 1},
                {"name": "password_hash", "type": "TEXT", "notnull": 0, "pk": 0},
            ]
        if "COUNT(*) AS total" in sql:
            return [{"total": 19}]
        if "GROUP BY status" in sql:
            return [{"kategori": "accepted", "jumlah": 12}]
        if "GROUP BY provider" in sql:
            return [{"kategori": "java_offline", "jumlah": 3}]
        raise AssertionError("Unexpected SQL: " + sql)

    def test_overview_lists_tables_without_member_records(self):
        result = inspect.report("sscircle-staging", "overview", "", self.fake_reader)
        self.assertIn("minecraft_accounts", result)
        self.assertIn("submissions", result)
        self.assertNotIn("password_hash", result)
        self.assertNotIn("SELECT", result)

    def test_table_detail_has_columns_and_count_only(self):
        result = inspect.report("sscircle-staging", "table", "member_credentials", self.fake_reader)
        self.assertIn("password_hash", result)
        self.assertIn("19", result)
        self.assertIn("tidak ditampilkan", result)

    def test_safe_aggregate_only_uses_preset_query(self):
        result = inspect.report("sscircle-staging", "table", "submissions", self.fake_reader)
        self.assertIn("accepted", result)
        self.assertIn("12", result)

    def test_rejects_sql_injection_and_unknown_names(self):
        for name in ("submissions;DROP TABLE submissions", 'submissions" OR 1=1',
                     "sqlite_master", "missing-table", "member_credentials;"):
            with self.subTest(name=name):
                with self.assertRaises(ValueError):
                    inspect.report("sscircle-staging", "table", name, self.fake_reader)

    def test_rejects_malformed_database_name(self):
        for name in ("production; DROP", "../../foo", "", "A" * 90):
            with self.subTest(name=name):
                with self.assertRaises(ValueError):
                    inspect.report(name, "overview", "", self.fake_reader)

    def test_escape_metadata_for_github_markdown(self):
        value = inspect.clean("<script>alert('x')</script>|secret")
        self.assertNotIn("<script>", value)
        self.assertIn(r"\|", value)

    def test_wranger_json_result_shape(self):
        rows = inspect.unpack_json('[{"success":true,"results":[{"name":"members"}]}]')
        self.assertEqual(rows, [{"name": "members"}])
        for bad in ('{"success":true}', '[{"success":false,"results":[]}]',
                    '[{"success":true,"results":"invalid"}]'):
            with self.subTest(bad=bad):
                with self.assertRaises(RuntimeError):
                    inspect.unpack_json(bad)


if __name__ == "__main__":
    unittest.main()
