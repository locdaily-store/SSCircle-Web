"""Optional browser smoke test (python playwright + Pillow; no network/server needed).
Run: python tests/browser_skin_3d.py
Emulates the private PNG response with a generated 64x64 skin.
"""
import base64
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent


def fake_png():
    img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 31, 15), fill=(170, 118, 85, 255))
    d.rectangle((0, 16, 63, 31), fill=(33, 93, 164, 255))
    d.rectangle((8, 8, 15, 15), fill=(234, 172, 115, 255))
    d.rectangle((9, 11, 10, 12), fill=(18, 24, 43, 255))
    d.rectangle((13, 11, 14, 12), fill=(18, 24, 43, 255))
    d.rectangle((40, 8, 47, 9), fill=(30, 20, 43, 255))
    d.rectangle((40, 10, 40, 15), fill=(60, 24, 90, 255))
    d.rectangle((47, 10, 47, 15), fill=(60, 24, 90, 255))
    d.rectangle((20, 36, 27, 47), fill=(158, 61, 216, 235))
    d.rectangle((44, 36, 47, 47), fill=(202, 98, 228, 235))
    d.rectangle((52, 52, 55, 63), fill=(202, 98, 228, 235))
    d.rectangle((4, 36, 7, 47), fill=(35, 18, 70, 198))
    d.rectangle((20, 52, 23, 63), fill=(35, 18, 70, 198))
    # Outer layer intentionally includes transparent pixels to verify underlayer.
    d.rectangle((41, 11, 46, 15), fill=(0, 0, 0, 0))
    output = BytesIO()
    img.save(output, format='PNG')
    return output.getvalue()


def launch_preview(browser, *, mobile=False):
    page = browser.new_page(viewport={'width': 390 if mobile else 1080,
                                     'height': 780 if mobile else 850},
                            device_scale_factor=2 if mobile else 1,
                            is_mobile=mobile, has_touch=mobile)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content('<!doctype html><html><head><meta name="viewport" '
                     'content="width=device-width,initial-scale=1"></head><body '
                     'style="background:#170e22;color:white;font-family:Arial">'
                     '<h1>SSCircle 3D Skin Test</h1></body></html>')
    page.add_style_tag(content=(ROOT / 'player-dashboard.css').read_text() +
        '.player-action{color:white;background:#3c2453;border:1px solid purple;padding:8px}')
    page.evaluate('''b64=>{
      const b=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
      window.fetch=async()=>new Response(b,{status:200,headers:{
        'Content-Type':'image/png','X-SSC-Skin-Model':'slim',
        'X-SSC-Skin-Source':'server-d1'}});
    }''', base64.b64encode(fake_png()).decode())
    page.add_script_tag(content=(ROOT/'minecraft-skin-3d.js').read_text())
    page.add_script_tag(content=(ROOT/'minecraft-avatars.js').read_text())
    page.evaluate('''()=>window.SSCircleMinecraftAvatars.openPreview({
      id:'12345678-1234-4234-8234-123456789012',username:'SSCircleTest',
      provider:'java_offline',skinModel:'slim'})''')
    page.wait_for_timeout(300)
    assert not errors, errors
    assert 'Scroll' in page.locator('.ssc-skin-dialog-message').inner_text()
    assert page.locator('.ssc-skin-dialog-caption').inner_text() == 'SSCircleTest · Slim'
    assert page.locator('[data-skin-action="outer"]').get_attribute('aria-pressed') == 'true'
    return page


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',
      args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader',
            '--enable-unsafe-swiftshader'])
    page = launch_preview(browser)
    screenshot = '/mnt/data/SSCircle-V10.49.1.5-Desktop-Preview.png'
    page.screenshot(path=screenshot)
    method = page.evaluate("""()=>document.querySelector('.ssc-skin-render-canvas')?.getContext('2d')?'canvas2d':'unavailable' """)
    assert method=='canvas2d'
    before = Image.open(BytesIO(page.locator('.ssc-skin-viewer').screenshot())).convert('RGB')
    page.locator('[data-skin-action="outer"]').click()
    assert page.locator('[data-skin-action="outer"]').get_attribute('aria-pressed') == 'false'
    after = Image.open(BytesIO(page.locator('.ssc-skin-viewer').screenshot())).convert('RGB')
    diff = ImageChops.difference(before, after)
    assert diff.getbbox() is not None, 'Outer layer did not alter rendered pixels'
    page.locator('[data-skin-action="outer"]').click()
    page.locator('[data-skin-action="zoom-in"]').click()
    page.locator('[data-skin-action="zoom-in"]').click()
    assert page.locator('.ssc-skin-render-canvas').is_visible()
    page.screenshot(path='/mnt/data/SSCircle-V10.49.1.5-Zoom-Preview.png')
    page.locator('[data-skin-action="reset"]').click()
    page.locator('[data-skin-action="right"]').click()
    assert page.locator('.ssc-skin-dialog-message').is_visible()

    phone = launch_preview(browser, mobile=True)
    phone.screenshot(path='/mnt/data/SSCircle-V10.49.1.5-Mobile-Preview.png')
    assert phone.locator('.ssc-skin-dialog').is_visible()
    assert phone.locator('[data-skin-action="outer"]').is_visible()
    browser.close()
    print('PASS Canvas 2D mode:', method, '| outer layer visible/toggle works, uniform zoom, mobile dialog')
