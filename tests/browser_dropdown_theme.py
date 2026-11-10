"""Smoke test for SSCircle's native dropdown color contract on Chromium.
Uses a local fixture only: no server, DB or production requests.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent
style = root / 'style.css'
assert style.exists()

def rgb_str(value):
    return value.replace(' ', '')

with TemporaryDirectory(prefix='ssc-dropdown-') as temp:
    fixture = Path(temp) / 'index.html'
    fixture.write_text(f'''<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="{style.as_uri()}"><title>Dropdown SSCircle</title></head>
<body class="admin-page theme-v3" style="padding:28px;min-height:650px"><main style="max-width:620px;margin:auto;padding:30px;border:1px solid #62457d;border-radius:18px;background:#21162d"><h1 style="color:#faf6ff">Dropdown SSCircle V10.49.1.6</h1><p style="color:#c7b5d6">Pratinjau tema pilihan Admin Control</p>
<div class="ssc-sync-filters"><label for="option">Pilih fitur SSCircle</label><select id="option"><option value="a">Atur Homepage</option><option value="b">Atur Voting</option><option value="c">Atur Season Archive</option></select></div>
<label for="ssc-mc-unlink-account">Akun Minecraft</label><select id="ssc-mc-unlink-account"><option value="player">Akun Utama</option><option value="guest">Akun Tambahan</option></select>
<label for="disabled">Pengaturan terbatas</label><select id="disabled" disabled><option>Belum tersedia</option></select></main></body></html>''',encoding='utf8')
    with sync_playwright() as pw:
        opts = {'headless': True, 'args': ['--no-sandbox']}
        if Path('/usr/bin/chromium').exists():
            opts['executable_path'] = '/usr/bin/chromium'
        browser = pw.chromium.launch(**opts)
        for w,h in [(1200,800),(390,844)]:
            page = browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
            page.set_content(fixture.read_text(encoding='utf8').replace(f'<link rel="stylesheet" href="{style.as_uri()}">','<style>'+style.read_text(encoding='utf8')+'</style>'))
            for selector in ['#option','#ssc-mc-unlink-account','#disabled']:
                data=page.eval_on_selector(selector,"e => ({bg:getComputedStyle(e).backgroundColor,fg:getComputedStyle(e).color,scheme:getComputedStyle(e).colorScheme,optbg:getComputedStyle(e.options[0]).backgroundColor,optfg:getComputedStyle(e.options[0]).color})")
                assert data['bg'] not in ('rgba(0, 0, 0, 0)','transparent','rgb(255, 255, 255)'), (selector,data)
                assert data['fg'] != data['bg'],(selector,data)
                assert 'dark' in data['scheme'],(selector,data)
                assert data['optbg'] != 'rgb(255, 255, 255)',(selector,data)
                assert data['optfg'] != data['optbg'],(selector,data)
            page.select_option('#option', 'c')
            assert page.locator('#option').input_value() == 'c'
            if w==1200:
                page.screenshot(path='/mnt/data/SSCircle-V10.49.1.6-Dropdown-Desktop.png',full_page=True)
            else:
                page.screenshot(path='/mnt/data/SSCircle-V10.49.1.6-Dropdown-Mobile.png',full_page=True)
            # After applying a custom (bright) theme, both the native control and options
            # must follow the same theme tokens, without reverting to white-on-white.
            page.eval_on_selector('body',"e=>{e.style.setProperty('--ssc-input','#f0e9fa');e.style.setProperty('--ssc-input-text','#21122e');}")
            custom=page.eval_on_selector('#option',"e=>({bg:getComputedStyle(e).backgroundColor, fg:getComputedStyle(e).color, optbg:getComputedStyle(e.options[0]).backgroundColor,optfg:getComputedStyle(e.options[0]).color})")
            assert custom['bg']=='rgb(240, 233, 250)',custom
            assert custom['fg']=='rgb(33, 18, 46)',custom
            assert custom['optbg']=='rgb(240, 233, 250)',custom
            assert custom['optfg']=='rgb(33, 18, 46)',custom
            page.close()
        browser.close()
print('OK: dropdown CSS desktop, mobile, selected option, dark/custom light theme')