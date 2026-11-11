"""Regression checks for the real Cloudflare upload package."""
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile
from importlib.util import module_from_spec, spec_from_file_location

ROOT = Path(__file__).resolve().parents[1]

class CloudflarePackageTests(unittest.TestCase):
    def test_zip_is_versioned_valid_and_excludes_private_sources(self):
        module_path = ROOT / 'scripts/package-cloudflare.py'
        spec = spec_from_file_location('package_cloudflare', module_path)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)
        version = json.loads((ROOT / 'package.json').read_text('utf-8'))['version']
        with tempfile.TemporaryDirectory() as directory:
            path = module.build(directory)
            self.assertEqual(path.name, 'SSCircle-Cloudflare-Upload-V' + version + '.zip')
            with ZipFile(path) as archive:
                names = archive.namelist()
                self.assertIsNone(archive.testzip())
                self.assertEqual(len(names), len(set(names)))
                for required in module.REQUIRED:
                    self.assertIn(required, names)
                self.assertTrue(all(not name.startswith(('.github/', 'tests/', 'docs/',
                    'scripts/', 'migrations/', 'dev/', 'minecraft-link-paper/',
                    'minecraft-skin-bridge-paper/', 'minecraft-link-velocity/')) for name in names))
                self.assertTrue(all('secret' not in name.lower() for name in names))
                self.assertNotIn('package.json', names)
                self.assertIn(b'const SSC_RUNTIME_RELEASE', archive.read('_worker.js'))

if __name__ == '__main__':
    unittest.main()
