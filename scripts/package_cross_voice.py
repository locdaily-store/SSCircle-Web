#!/usr/bin/env python3
"""Create deterministic archives from tracked SSCircle Cross Voice sources and real compiled jar."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import subprocess

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
JAR = ROOT / "build/cross-voice/SSCircleCrossVoice.jar"
FILES = (
    "voice.html", "voice.css", "voice.js", "voice-config.js", "voice-worklet.js",
    "index.html", "public-unified.js", "scripts/package-cloudflare.py",
    "cross-voice",
)
EXCLUDES = {"node_modules", "build", ".gradle", "dist", ".git", "test-results"}
def include(path):
    parts = path.relative_to(ROOT).parts
    return not any(part in EXCLUDES for part in parts) and path.is_file()
def archive(name, files):
    with ZipFile(DIST / name,"w",ZIP_DEFLATED,compresslevel=8) as bundle:
        for path in sorted(set(files)):
            if not path.is_file():raise FileNotFoundError(path)
            bundle.write(path,path.relative_to(ROOT).as_posix())
        bundle.write(JAR,"SSCircleCrossVoice.jar")
    print("Created",name)
def main():
    if not JAR.is_file() or JAR.stat().st_size<3000:
        raise RuntimeError("Real Gradle-compiled SSCircleCrossVoice.jar is required")
    DIST.mkdir(exist_ok=True)
    complete=[]
    for entry in FILES:
        path=ROOT / entry
        if path.is_dir():complete.extend(x for x in path.rglob("*") if include(x))
        elif path.is_file():complete.append(path)
    if not complete:raise RuntimeError("No source files available")
    archive("SSCircle-Cross-Voice-FULL.zip",complete)
    branch=subprocess.check_output(["git","rev-parse","--abbrev-ref","HEAD"],cwd=ROOT,text=True).strip()
    base=subprocess.check_output(["git","merge-base","origin/main","HEAD"],cwd=ROOT,text=True).strip()
    names=subprocess.check_output(["git","diff","--name-only","--diff-filter=ACM",base,"HEAD"],
                                  cwd=ROOT,text=True).splitlines()
    changed=[ROOT / name for name in names if include(ROOT / name) and
             not name.startswith((".github/","tests/"))]
    if not changed:raise RuntimeError("No tracked changes relative to main")
    archive("SSCircle-Cross-Voice-ONLY-CHANGES.zip",changed)
if __name__=="__main__":main()
