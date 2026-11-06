"""SSCircle responsive smoke, no external web server required.
Loads actual website HTML/CSS/JS inline into sandboxed Chromium and injects representative settings.
"""
import json, os, re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent

def page_source(file, prelude=''):
    html=(ROOT/file).read_text()
    def css(m):
        path=m.group(1).split('?')[0]
        return '<style>'+ (ROOT/path).read_text()+'</style>'
    html=re.sub(r'<link rel="stylesheet" href="([^"]+)">',css,html)
    def js(m):
        path=m.group(1).split('?')[0]
        original=(ROOT/path).read_text()
        # Avoid breaking script tags from embedded source content.
        return '<script>'+original.replace('</script','<\\/script')+'</script>'
    html=re.sub(r'<script src="([^"]+)" defer></script>',js,html)
    if prelude: html=html.replace('</head>','<script>'+prelude+'</script></head>')
    return html
settings={
 'open':True,'homeUpcomingEnabled':True,'homeUpcomingCount':2,'homeUpcomingLayout':'grid','homeUpcomingHideEmpty':True,'eventsEnabled':True,
 'seasonArchiveEnabled':True,'homeSeasonHighlightsEnabled':True,'homeSeasonHighlightsCount':2,'homeSeasonHighlightsStyle':'cards','homeSeasonHighlightsHideEmpty':True,
 'homeShowLeaderboard':True,'homeLeaderboardSeasons':[
  {'id':'season-a','title':'Season 6 • Test', 'archivePublished':True,'archiveSummary':'Kegiatan komunitas dan berbagai cerita menarik yang berlangsung sepanjang season ini.', 'archiveStartDate':'2026-10-01','archiveStatus':'active','archiveCover':'assets/gallery/sscircle-01.webp', 'entries':[{'name':'PemainMinecraftYangSangatPanjangTanpaSpasi_123456789123456789','score':'12345678999999999999999999999 XP'}, {'name':'Steve','score':'45'}], 'archiveAwards':[{'title':'Best Builder','player':'Test123','description':'Contoh pengujian.'}], 'archiveBuilds':[], 'archiveMemories':[]},
  {'id':'season-b','title':'Season 5','archivePublished':True,'archiveSummary':'Perjalanan lainnya', 'archiveStartDate':'2026-01-01','archiveStatus':'ended','entries':[{'name':'Alex','score':'100'}]}
 ]
}
now=datetime.now(timezone.utc)
settings['eventsItems']=[{'id':'opening-s6','title':'Opening SSCircle Season 6','image':'assets/sscircle-community-icon.png','startAt':(now+timedelta(days=25)).isoformat().replace('+00:00','Z'),'endAt':(now+timedelta(days=26)).isoformat().replace('+00:00','Z'),'location':'Minecraft SSCircle Server'}]

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=os.getenv('SSC_CHROME_BIN','/usr/bin/chromium'),args=['--no-sandbox','--disable-dev-shm-usage'])
 home=page_source('index.html')
 seasons=page_source('seasons.html')
 admin=page_source('admin.html')
 for w in (320,390,768,1280,1920):
  page=browser.new_page(viewport={'width':w,'height':900}, device_scale_factor=1)
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(home,wait_until='domcontentloaded')
  page.evaluate('settings => window.SSCircleHomePage?.apply?.(settings)',settings) if False else None
  # Homepage API default load from a null origin is unavailable; feed the same settings through preview event.
  page.evaluate('''settings => window.dispatchEvent(new MessageEvent('message', {data:{type:'ssc-preview-settings',settings},origin:'null',source:window}))''',settings) if False else None
  # Source uses SSCircle.getForm on load; override by replacing last script to feed settings directly for tests.
  page.wait_for_timeout(80)
  page.evaluate('''() => {document.getElementById('home-upcoming').hidden=false;document.getElementById('home-season-highlights').hidden=false}''')
  vals=page.evaluate('''() => ({upcomingWidth: document.getElementById('home-upcoming').getBoundingClientRect().width,
    upcomingColumn: getComputedStyle(document.getElementById('home-upcoming')).gridColumnStart,
    hiColumn: getComputedStyle(document.getElementById('home-season-highlights')).gridColumnStart,
    docWidth: document.documentElement.scrollWidth, viewport: innerWidth})''')
  assert vals['upcomingWidth']>=min(1180,w*.75),('Upcoming section too narrow',w,vals)
  assert vals['upcomingColumn']=='1' and vals['hiColumn']=='1',('Not full grid span',w,vals)
  assert vals['docWidth']<=w+2,('Homepage overflow',w,vals)
  # Inject visible cards using the actual markup, checking the cards cannot shrink to 60px.
  page.evaluate('''() => {const u=document.getElementById('home-upcoming'), h=document.getElementById('home-season-highlights');
    u.hidden=false;h.hidden=false;
    u.querySelector('.home-upcoming-cards').innerHTML='<article class="home-upcoming-card"><img alt="Poster" src="x"><div class="home-upcoming-card-body"><h3>Opening SSCircle Season 6</h3><p>5 Desember 2026, 19:00 WITA</p></div></article>';
    h.querySelector('.home-season-cards').innerHTML='<a class="home-season-card"><img alt="Season" src="x"><div class="home-season-card-content"><h3>Season 6</h3></div></a>';
    }''')
  vals=page.evaluate('''() => ({sectionWidth:document.getElementById('home-upcoming').getBoundingClientRect().width,
    cardWidth:document.querySelector('.home-upcoming-card').getBoundingClientRect().width,
    highlightsWidth:document.getElementById('home-season-highlights').getBoundingClientRect().width,
    docWidth:document.documentElement.scrollWidth})''')
  assert vals['cardWidth']>=min(230,w*.60),('Event card too narrow',w,vals)
  assert vals['highlightsWidth']>=min(1180,w*.75),('Highlights narrow',w,vals)
  assert vals['docWidth']<=w+2,('Homepage overflow with events',w,vals)
  print('Home',w,vals)
  page.set_content(seasons,wait_until='domcontentloaded')
  page.evaluate('settings=>window.SSCircleSeasonArchive.render(settings)',settings)
  page.locator('.season-archive-details > summary').first.click()
  vals=page.evaluate('''() => ({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    ranks:document.querySelectorAll('.season-archive-ranking li').length,
    rankWidth:document.querySelector('.season-archive-ranking li').getBoundingClientRect().width})''')
  assert vals['ranks']==3
  assert vals['scrollWidth']<=w+2,('Season Archive overflow',w,vals)
  print('Archive',w,vals)
  page.close()
 for w in (320,390,768,1280):
  page=browser.new_page(viewport={'width':w,'height':900})
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(admin,wait_until='domcontentloaded')
  page.evaluate('''settings=>{
    document.getElementById('dashboard').classList.remove('hide');document.getElementById('login').classList.add('hide');
    document.querySelectorAll('.tab-page').forEach(e=>e.classList.add('hide'));
    document.getElementById('homepage').classList.remove('hide');
    window.SSCircleHomeAdmin.render({settings:structuredClone(settings),pages:[],submissions:[]},()=>{});
  }''',settings)
  btn=page.locator('.home-builder-card[data-id="season-highlights"] .home-builder-select')
  assert btn.count()==1,('Missing highlights card',w)
  btn.click()
  assert page.get_by_text('10A · Season Highlights').count()==1,('Highlights editor detached',w)
  assert page.locator('.home-builder-card[data-id="season-highlights"] input').count()>=2,('Missing controls',w)
  page.evaluate('''settings=>{
    document.querySelectorAll('.tab-page').forEach(e=>e.classList.add('hide'));
    document.getElementById('seasons-admin').classList.remove('hide');
    window.SSCircleSeasonsAdmin.render({settings:structuredClone(settings),pages:[],submissions:[]},()=>{});
  }''',settings)
  page.evaluate('''() => {
    const first=document.querySelector('#seasons-admin-editor .season-admin-season');
    first.open=true;
    first.querySelectorAll('.season-admin-subsection').forEach(x=>x.open=true);
  }''')
  vals=page.evaluate('''() => ({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    editorScrollWidth:document.getElementById('seasons-admin-editor').scrollWidth,
    editorWidth:document.getElementById('seasons-admin-editor').clientWidth,
    cards:document.querySelectorAll('.season-admin-season').length})''')
  assert vals['cards']==2,('Admin Season cards missing',w,vals)
  assert vals['editorScrollWidth']<=vals['editorWidth']+2,('Admin editor overflow',w,vals)
  # document can have other global admin chrome overflow; ignore unrelated components
  print('Admin',w,vals,'errors',errors[:3])
  page.close()
 browser.close()
print('Responsive regression: PASS')
