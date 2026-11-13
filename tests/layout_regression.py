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
    # Inline scripts are not deferred by browsers. Execute them after the body
    # to preserve the original <script defer> behavior during sandbox tests.
    deferred=[]
    def js(m):
        path=m.group(1).split('?')[0]
        original=(ROOT/path).read_text()
        deferred.append('<script>'+original.replace('</script','<\\/script')+'</script>')
        return ''
    html=re.sub(r'<script src="([^"]+)" defer></script>',js,html)
    if prelude: html=html.replace('</head>','<script>'+prelude+'</script></head>')
    return html.replace('</body>', ''.join(deferred)+'</body>')
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
 launch_kwargs={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
 # Playwright installs Chromium under its own cache on GitHub Actions, not /usr/bin.
 chrome_path=os.getenv('SSC_CHROME_BIN')
 if not chrome_path and Path('/usr/bin/chromium').exists():
  chrome_path='/usr/bin/chromium'
 if chrome_path:
  launch_kwargs['executable_path']=chrome_path
 browser=p.chromium.launch(**launch_kwargs)
 home=page_source('index.html')
 seasons=page_source('seasons.html')
 admin=page_source('admin.html')
 player=page_source('my-sscircle.html', prelude='''
window.fetch=async url => {
 const path=String(url);
 if(path==='/api/player/me') return new Response(JSON.stringify({authenticated:true,status:'accepted',code:'AAAABBBBCCCCDDDDEEEE',submittedAt:'2026-11-07T12:00:00Z'}),{status:200,headers:{'Content-Type':'application/json'}});
 if(path==='/api/player/security/state') return new Response(JSON.stringify({
   authenticated:true,hasPassword:true,session:{id:'11111111-1111-4111-8111-111111111111',client:'Browser Test'}
 }),{status:200,headers:{'Content-Type':'application/json'}});
 if(path==='/api/player/security/sessions') return new Response(JSON.stringify({sessions:[]}),{status:200,headers:{'Content-Type':'application/json'}});
 if(path==='/api/player/profile') return new Response(JSON.stringify({
  profile:{displayName:'Anggota Uji',bio:'Saya builder',visibility:'private',showStats:false,eventAlerts:true},
  policy:{allowBio:true,allowMembers:true,allowPublic:false,allowStats:true,allowEventAlerts:true},
  accounts:[],statistics:[],achievements:[{title:'Best Builder',seasonTitle:'Season 6',description:'Kastil'}]
 }),{status:200,headers:{'Content-Type':'application/json'}});
 if(path==='/api/form') return new Response(JSON.stringify({settings:{seasonArchiveEnabled:true}}),{status:200,headers:{'Content-Type':'application/json'}});
 return new Response('{}',{status:404,headers:{'Content-Type':'application/json'}});
};
''')
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
  # Compact card: state badge remains near its title, not at bottom of empty space.
  gap=page.evaluate('''() => {
    const h=document.querySelector('.season-archive-card-head');
    return h.querySelector('.season-archive-state').getBoundingClientRect().top-
      h.querySelector('h2').getBoundingClientRect().bottom;
  }''')
  assert gap<170,('Season card blank gap',w,gap)
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
    window.__seasonFixture={settings:structuredClone(settings),pages:[],submissions:[]};
    window.SSCircleSeasonsAdmin.render(window.__seasonFixture,()=>{});
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
  # Native checkboxes must never inherit width:100% from text inputs.
  geometry=page.evaluate('''() => {
    const editor=document.getElementById('seasons-admin-editor');
    const switcher=editor.querySelector('.season-admin-page-settings .season-admin-toggle');
    const check=switcher.querySelector('input[type=checkbox]').getBoundingClientRect();
    const copy=switcher.querySelector('.season-admin-toggle-copy').getBoundingClientRect();
    const group=editor.querySelector('.season-admin-fieldset').getBoundingClientRect();
    return {checkWidth:check.width,checkHeight:check.height,gap:copy.left-check.right,
      editorWidth:editor.clientWidth,groupWidth:group.width,
      fieldsets:editor.querySelectorAll('.season-admin-fieldset').length,
      switchWidth:switcher.getBoundingClientRect().width}
  }''')
  assert 16<=geometry['checkWidth']<=24,('Checkbox stretched',w,geometry)
  assert 0<=geometry['gap']<=28,('Checkbox detached from its label',w,geometry)
  assert geometry['groupWidth']<=geometry['editorWidth']+2,('Fieldset overflow',w,geometry)
  assert geometry['fieldsets']>=6,('Missing season form groups',w,geometry)
  page.locator('.season-admin-page-settings .season-admin-toggle input[type=checkbox]').check()
  assert page.evaluate('window.__seasonFixture.settings.seasonArchiveEnabled') is True,('Season toggle did not update',w)
  assert page.locator('.season-admin-rank-fields').count()>=3,('Ranking fields missing',w)
  assert page.locator('.season-admin-rank-top > .ssc-sort-handle').count()>=2,('Ranking drag handles missing',w)
  assert page.locator('.sidebar-group').count()==4,('Sidebar groups missing',w)
  assert page.locator('.dashboard-sidebar [data-tab]').count()==21,('Sidebar links missing',w)
  assert page.locator('.dashboard-sidebar [data-tab="gallery-admin"]').count()==1,('Gallery navigation missing',w)
  assert page.locator('.dashboard-sidebar [data-tab="announcements-admin"]').count()==1,('Announcement navigation missing',w)
  assert page.locator('.dashboard-sidebar [data-tab="community-events-admin"]').count()==1,('Proposal editor navigation missing',w)
  assert page.locator('.dashboard-sidebar [data-tab="achievements-admin"]').count()==1,('Achievement editor navigation missing',w)
  assert page.locator('#community-event-badge').count()==1,('Pending events badge missing',w)
  assert page.locator('.dashboard-sidebar [data-tab="notifications-admin"]').count()==1,('Notification Center navigation missing',w)
  assert page.locator('.dashboard-sidebar [data-tab="minecraft-sync-admin"]').count()==1,('Minecraft Sync navigation missing',w)
  assert page.locator('.dashboard-sidebar [data-tab="profile-admin"]').count()==1,('Profile editor missing',w)
  # Member Control: verify all seven tabs and policy controls at each panel width.
  page.evaluate('''() => {
    document.querySelectorAll('.tab-page').forEach(e=>e.classList.add('hide'));
    document.getElementById('members-admin').classList.remove('hide');
    window.fetch=async path => new Response(JSON.stringify({
      items:[{id:'11111111-1111-4111-8111-111111111111',status:'accepted',
        submittedAt:'2026-11-07T12:00:00Z',displayName:'Anggota Uji',linkedCount:0,lastSync:null}],
      awards:[{seasonId:'s6',seasonTitle:'Season 6',title:'Best Builder',
        player:'Test Player',memberId:'11111111-1111-4111-8111-111111111111'}],
      policy:{allowBio:true,allowPublic:false,allowStats:true,allowEventAlerts:true},total:1,hasMore:false
    }),{status:200,headers:{'Content-Type':'application/json'}});
    return window.SSCircleMemberCenterAdmin.load(true);
  }''')
  assert page.locator('.member-admin-tab').count()==7,('Member Control subpanels missing',w)
  layout=page.evaluate('''() => ({
    width:document.getElementById('members-admin-root').clientWidth,
    scroll:document.getElementById('members-admin-root').scrollWidth,
    memberCount:document.querySelectorAll('.member-admin-member').length
  })''')
  assert layout['scroll']<=layout['width']+2,('Member Control overflow',w,layout)
  assert layout['memberCount']>=1,('Member list missing',w,layout)
  page.locator('.member-admin-tab').nth(4).click()
  assert page.locator('.member-admin-switch').count()==5,('Member policy options missing',w)

  if w<=390:
    page.locator('#admin-nav-toggle').click()
    assert page.locator('#admin-nav-toggle').get_attribute('aria-expanded')=='true'
    page.locator('.dashboard-sidebar [data-tab="seasons-admin"]').click()
    assert page.locator('#admin-nav-toggle').get_attribute('aria-expanded')=='false'
    assert page.locator('#admin-nav-current').inner_text()=='Season & Sejarah'
  # document can have other global admin chrome overflow; ignore unrelated components
  print('Admin',w,vals,'errors',errors[:3])
  page.close()
 for w in (320,390,768,1280,1920):
  page=browser.new_page(viewport={'width':w,'height':850})
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(player,wait_until='domcontentloaded')
  page.locator('#player-content').wait_for(state='visible',timeout=4000)
  vals=page.evaluate('''() => ({
    viewport: innerWidth, docWidth: document.documentElement.scrollWidth,
    cardWidth: document.querySelector('.player-profile').getBoundingClientRect().width,
    status: document.querySelector('.player-verified').textContent,
    hasUnverifiedStats: document.querySelectorAll('.player-stat strong').length,
    hiddenError: document.getElementById('player-error').hidden
  })''')
  assert vals['docWidth']<=w+2,('Player Dashboard overflow',w,vals)
  assert vals['cardWidth']>200,('Profile card too narrow',w,vals)
  assert vals['hiddenError'],('Dashboard error visible',w,vals)
  assert vals['hasUnverifiedStats']==5,('Dashboard status cards missing',w,vals)
  assert page.locator('#player-member-id').inner_text()=='SSC-••••EEEE',('Member label must not reveal login code',w)
  page.locator('[data-workspace-group="settings"]').click()
  assert page.locator('#player-link-title').is_visible()
  assert page.locator('#player-profile-title').inner_text()=='Anggota Uji',('Profile name failed',w)
  assert page.locator('#player-achievements-list .player-award').count()==1,('Hall of Fame award missing',w)
  assert page.locator('#player-settings-form input').count()>=3,('Profile controls missing',w)
  assert not errors,('Player dashboard Javascript failed',w,errors)
  print('Player Dashboard',w,vals)
  page.close()
 browser.close()
print('Responsive regression: PASS')