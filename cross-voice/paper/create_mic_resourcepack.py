#!/usr/bin/env python3
"""Build a self-contained, reproducible Java 26.3 SSCircle microphone glyph pack."""
import base64
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

MIC_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAVUlEQVR42q1TQQ4"
    "AIAiS1v+/XJe6AbOUk0tlyCjCYB24meGWWZ0iYAuKhBIAQObNnpDFeDGN9XsV"
    "/GCqhjKtXUG05+AOsiQyEmQVKF/KSYzqbyyfsAGvbk/nHcyoGwAAAABJRU5ErkJggg=="
)
ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "dist" / "SSCircle-Mic-Glyph-Java-26.3.zip"
PACK = {
    "pack": {
        "description": "SSCircle Voice Bedrock microphone icon, Java 26.3",
        "min_format": [97, 1],
        "max_format": [97, 1],
    }
}
FONT = {
    "providers": [
        {
            "type": "bitmap",
            "file": "sscircle:font/microphone.png",
            "ascent": 11,
            "height": 14,
            "chars": ["\ue401"],
        }
    ]
}
README = (
    "SSCircle Mic Glyph v0.2.5 | Minecraft Java 26.3\n"
    "Install the ZIP under Options > Resource Packs on Java clients.\n"
    "Do not extract it for manual Resource Pack selection.\n"
    "The Paper plugin renders U+E401 with font sscircle:voice for paired Bedrock players.\n"
    "For auto-install, host the zip and configure server.properties resource-pack URL.\n"
    "If your server already requires a resource pack, merge this glyph into that pack.\n"
    "Without the pack, the icon may look like a missing-character square.\n"
)
def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8")

DEST.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(DEST, "w", ZIP_DEFLATED) as zip_file:
    zip_file.writestr("pack.mcmeta", json_bytes(PACK))
    zip_file.writestr("assets/sscircle/font/voice.json", json_bytes(FONT))
    zip_file.writestr("assets/sscircle/textures/font/microphone.png",
                      base64.b64decode(MIC_PNG_B64))
    zip_file.writestr("README-ID.txt", README)
with ZipFile(DEST) as zip_file:
    assert zip_file.testzip() is None
    assert zip_file.read("assets/sscircle/textures/font/microphone.png").startswith(
        b"\x89PNG\r\n\x1a\n"
    )
print("Built", DEST, DEST.stat().st_size, "bytes")
