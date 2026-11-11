"""Browser checks for three Profile categories on desktop, tablet and mobile."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
KEYS = ("welcome", "security", "preferences", "achievements", "linking", "stats", "social", "explore")

def check(width):
    sections = "".join(
        f'<section data-profile-section="{key}" class="player-card"><h2>{key}</h2><p>Konten {key}</p></section>'
        for key in KEYS
    )
    page_html = (
        '<!doctype html><html lang="id"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<body class="home-page player-page">'
        '<header class="home-header" style="position:absolute;top:0;height:96px">Header</header>'
        '<main id="player-main" class="player-main home-container">'
        '<div class="player-layout" id="player-content">'
        '<nav id="player-workspace-nav" class="player-workspace-nav" aria-label="Navigasi Profile">'
        '<div class="player-workspace-main"></div></nav>'
        '<aside class="player-side"><section class="player-card">Kartu profil</section></aside>'
        f'<div class="player-dashboard">{sections}</div></div></main></body></html>'
    )
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": width, "height": 850})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("about:blank")
        page.set_content(page_html)
        page.add_style_tag(content=(ROOT / "player-dashboard.css").read_text(encoding="utf-8"))
        page.add_style_tag(content=(ROOT / "profile-workspace.css").read_text(encoding="utf-8"))
        page.add_script_tag(content=(ROOT / "profile-workspace.js").read_text(encoding="utf-8"))

        buttons = page.locator("[data-workspace-group]")
        assert buttons.count() == 3
        assert buttons.all_text_contents() == ["Profile", "Pengaturan Akun", "Komunitas"]
        assert page.locator(".player-workspace-sub").count() == 0
        def visible(key):
            return page.locator(f'[data-profile-section="{key}"]').is_visible()
        def hidden(key):
            return page.locator(f'[data-profile-section="{key}"]').is_hidden()

        # One click reveals all three Profile cards, in the requested order.
        assert all(visible(k) for k in ("welcome", "achievements", "stats"))
        assert all(hidden(k) for k in ("linking", "security", "preferences", "social", "explore"))
        def top(key):
            return page.locator(f'[data-profile-section="{key}"]').bounding_box()["y"]
        assert top("welcome") < top("achievements") < top("stats")

        page.locator('[data-workspace-group="settings"]').click()
        assert all(visible(k) for k in ("linking", "security", "preferences"))
        assert all(hidden(k) for k in ("welcome", "achievements", "stats", "social", "explore"))
        assert top("linking") < top("security") < top("preferences")

        page.locator('[data-workspace-group="community"]').click()
        assert all(visible(k) for k in ("social", "explore"))
        assert all(hidden(k) for k in ("welcome", "linking", "stats"))

        # Profile Studio hiding one card must leave remaining cards available.
        page.locator('[data-profile-section="social"]').evaluate("(el) => {el.hidden=true}")
        page.evaluate("window.dispatchEvent(new Event('ssc-profile-layout-change'))")
        assert visible("explore")
        assert hidden("social")
        assert page.locator('[data-workspace-group="community"]').is_visible()

        # When an entire category is disabled, fall back safely to Profile.
        page.locator('[data-profile-section="explore"]').evaluate("(el) => {el.hidden=true}")
        page.evaluate("window.dispatchEvent(new Event('ssc-profile-layout-change'))")
        assert visible("welcome") and visible("achievements") and visible("stats")
        assert page.locator('[data-workspace-group="community"]').is_hidden()

        # Legacy callers requesting a section still open that section's category.
        page.evaluate("window.SSCircleProfileWorkspace.open('security')")
        assert visible("linking") and visible("security") and visible("preferences")

        if width <= 420:
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 2")
        assert not errors, errors
        browser.close()

if __name__ == "__main__":
    for width in (1440, 768, 390):
        check(width)
    print("Profile three categories desktop/tablet/mobile: OK")
