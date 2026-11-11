"""Browser regression: SSCircle member directory, Manage Friends and profile modal."""
import json
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGE = (ROOT / "my-sscircle.html").read_text(encoding="utf-8")
START = PAGE.index('        <section data-profile-section="social"')
END = PAGE.index('        <section data-profile-section="security"', START)
SECTION = PAGE[START:END]
MEMBER = "22222222-2222-4222-8222-222222222222"
PUBLIC_ID = "SSC-M" + MEMBER[-12:].upper()

def check(viewport):
    page_html = '<!doctype html><html lang="id"><head><meta charset="utf-8"></head><body>' + (
        '<main class="player-dashboard" style="max-width:1060px;margin:0 auto;">' + SECTION +
        '</main></body></html>'
    )
    requests = []
    errors = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport=viewport)
        page.on("pageerror", lambda e: errors.append(str(e)))

        def reply(route):
            url = urlparse(route.request.url)
            path = url.path
            if path == "/social-browser-fixture":
                return route.fulfill(status=200, content_type="text/html; charset=utf-8", body=page_html)
            requests.append(path)
            if path == "/api/player/social/directory":
                payload = {"items": [{
                    "id": MEMBER, "memberId": PUBLIC_ID,
                    "displayName": "Beta Explorer", "minecraftName": "BetaCraft",
                    "avatarAccountId": None
                }], "hasMore": False, "nextOffset": 1}
            elif path == "/api/player/social/search":
                assert PUBLIC_ID in parse_qs(url.query).get("q", [])
                payload = {"items": [{
                    "id": MEMBER, "memberId": PUBLIC_ID,
                    "displayName": "Beta Explorer", "minecraftName": "BetaCraft",
                    "avatarAccountId": None
                }]}
            elif path == "/api/player/social/friends":
                payload = {"items": [{
                    "id": MEMBER, "memberId": PUBLIC_ID,
                    "displayName": "Beta Explorer", "relationship": "outgoing"
                }]}
            elif path == "/api/player/social/profile":
                payload = {
                    "id": MEMBER, "memberId": PUBLIC_ID, "displayName": "Beta Explorer",
                    "joinedAt": "2026-11-11T01:00:00Z", "bio": "Pemain SSCircle",
                    "relationship": "outgoing", "avatarAccountId": None,
                    "accounts": [], "statistics": [], "statsVisible": False,
                    "achievements": [{"title": "Builder", "seasonTitle": "Season 6"}]
                }
            else:
                return route.fulfill(status=404, body="Not found")
            return route.fulfill(status=200, content_type="application/json", body=json.dumps(payload))

        page.route("https://sscircle.test/**", reply)
        page.goto("https://sscircle.test/social-browser-fixture", wait_until="domcontentloaded")
        page.add_style_tag(content=(ROOT / "member-social.css").read_text(encoding="utf-8"))
        page.add_script_tag(content=(ROOT / "member-social.js").read_text(encoding="utf-8"))
        page.locator("#ssc-social-directory").click()
        page.locator(".ssc-social-result-button").first.wait_for()
        assert PUBLIC_ID in page.locator(".ssc-social-result-button").inner_text()
        page.locator(".ssc-social-result-button").first.click()
        page.locator("#ssc-social-modal[open]").wait_for()
        page.locator("#ssc-social-modal h3").wait_for()
        assert "Pemain SSCircle" in page.locator("#ssc-social-modal").inner_text()
        assert "Builder" in page.locator("#ssc-social-modal").inner_text()
        assert page.locator("#ssc-social-modal img").count() > 0
        page.keyboard.press("Escape")
        assert not page.locator("#ssc-social-modal").evaluate("(e) => e.open")
        page.locator("#ssc-social-search").fill(PUBLIC_ID)
        page.locator("#ssc-social-search-button").click()
        page.wait_for_function("document.getElementById('ssc-social-result-title').textContent === 'Hasil pencarian'")
        assert PUBLIC_ID in page.locator(".ssc-social-result-button").first.inner_text()
        assert "/api/player/social/search" in requests
        page.locator('[data-ssc-friends-tab="outgoing"]').click()
        page.locator(".ssc-social-friend").first.wait_for()
        assert "Beta Explorer" in page.locator("#ssc-social-friends").inner_text()
        if viewport["width"] <= 420:
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
        assert "/api/player/social/directory" in requests
        assert "/api/player/social/profile" in requests
        assert not errors, errors
        browser.close()

if __name__ == "__main__":
    check({"width": 1365, "height": 850})
    check({"width": 390, "height": 844})
    print("Member Social modal/directory/browser desktop+mobile: OK")
