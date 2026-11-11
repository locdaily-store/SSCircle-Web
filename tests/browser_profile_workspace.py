"""Browser checks for Profile workspace navigation on desktop and mobile."""
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
        '<nav id="player-workspace-nav" class="player-workspace-nav" aria-label="Navigasi bagian Profile">'
        '<div class="player-workspace-main"></div><div class="player-workspace-sub"></div></nav>'
        '<aside class="player-side"><section class="player-card">Kartu profil</section></aside>'
        f'<div class="player-dashboard">{sections}</div></div></main></body></html>'
    )
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width":width, "height":850})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("about:blank")
        page.set_content(page_html)
        page.add_style_tag(content=(ROOT / "player-dashboard.css").read_text(encoding="utf-8"))
        page.add_style_tag(content=(ROOT / "profile-workspace.css").read_text(encoding="utf-8"))
        page.add_script_tag(content=(ROOT / "profile-workspace.js").read_text(encoding="utf-8"))
        buttons = page.locator("[data-workspace-group]")
        assert buttons.count() == 4
        assert page.locator('[data-profile-section="welcome"]').is_visible()
        assert page.locator('[data-profile-section="security"]').is_hidden()
        page.locator('[data-workspace-group="settings"]').click()
        assert page.locator('[data-profile-section="preferences"]').is_visible()
        assert page.locator('[data-profile-section="security"]').is_hidden()
        page.get_by_role("button", name="Keamanan", exact=True).click()
        assert page.locator('[data-profile-section="security"]').is_visible()
        page.locator('[data-workspace-group="community"]').click()
        assert page.locator('[data-profile-section="social"]').is_visible()
        # Profile Studio can hide cards dynamically without leaving an empty screen.
        page.locator('[data-profile-section="social"]').evaluate("(el) => {el.hidden=true}")
        page.evaluate("window.dispatchEvent(new Event('ssc-profile-layout-change'))")
        assert page.locator('[data-profile-section="welcome"]').is_visible()
        assert page.locator('[data-workspace-group="community"]').is_hidden()
        if width <= 420:
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 2")
        assert not errors, errors
        browser.close()


if __name__ == "__main__":
    for width in (1440, 768, 390):
        check(width)
    print("Profile workspace desktop/tablet/mobile: OK")
