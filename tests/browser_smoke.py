"""Pemeriksaan warna CSSOM dan judul Homepage pada ukuran HP kecil."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
css = (ROOT / 'style.css').read_text(encoding='utf-8')
js = (ROOT / 'color-theme.js').read_text(encoding='utf-8')
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=os.environ.get('SSC_CHROME_BIN'), args=['--no-sandbox'])
    try:
        page = browser.new_page(viewport={'width': 390, 'height': 850})
        # CSP dinyalakan setelah stylesheet utama, seperti halaman produksi.
        page.set_content('''<!doctype html><html><head><style>''' + css + '''</style>
          <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'unsafe-inline'; style-src 'self'">
          </head><body class="home-page theme-v3"><div id="probe" class="home-story">
          <h2>Judul</h2><p>Penjelasan</p></div></body></html>''')
        page.add_script_tag(content=js)
        background = page.locator('#probe').evaluate('(el) => getComputedStyle(el).backgroundColor')
        page.evaluate("""() => SSCircleTheme.apply({themeOverrides:[{
            selector:'#probe',property:'text',value:'#123456'
        }]})""")
        for element in ('h2', 'p'):
            assert page.locator('#probe ' + element).evaluate('(el) => getComputedStyle(el).color') == 'rgb(18, 52, 86)'
        assert page.locator('#probe').evaluate('(el) => getComputedStyle(el).backgroundColor') == background
        page.evaluate("""() => SSCircleTheme.apply({themeOverrides:[{
            selector:'#probe',property:'border',value:'#abcdef'
        }]})""")
        assert page.locator('#probe').evaluate('(el) => getComputedStyle(el).borderTopColor') == 'rgb(171, 205, 239)'
        assert page.locator('#probe h2').evaluate('(el) => getComputedStyle(el).color') != 'rgb(18, 52, 86)'
        page.close()
        for width in (320,360,375,390,768,1280):
            page = browser.new_page(viewport={'width':width, 'height':900})
            page.set_content('''<!doctype html><html><head><style>''' + css + '''</style></head>
              <body class="home-page theme-v3"><section class="home-hero">
              <div class="home-hero-content"><h1>SSCircle <em>Server.</em></h1></div>
              </section></body></html>''')
            rect = page.locator('.home-hero-content h1 em').bounding_box()
            assert rect and rect['x'] >= -1 and rect['x']+rect['width'] <= width+1, (width,rect)
            page.close()
    finally:
        browser.close()
print('Browser smoke tests OK')
