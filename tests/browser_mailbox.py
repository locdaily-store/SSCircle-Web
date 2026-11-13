"""SSCircle Mail Box regression, uses real current HTML/CSS/JS with fetch mock.
Checks responsive layout, click flow, no automatic Voting redirection.
"""
import os, re, json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent

def inline(name, prelude=''):
    html=(ROOT/name).read_text(encoding='utf-8')
    html=re.sub(r'<link rel="stylesheet" href="([^"]+)">',
      lambda m:'<style>'+(ROOT/m[1].split('?')[0]).read_text(encoding='utf-8')+'</style>',html)
    deferred=[]
    def scripts(m):
        name=m[1].split('?')[0]
        deferred.append('<script>'+(ROOT/name).read_text(encoding='utf-8').replace('</script','<\\/script')+'</script>')
        return ''
    html=re.sub(r'<script src="([^"]+)" defer></script>',scripts,html)
    return html.replace('</head>','<script>'+prelude+'</script></head>').replace('</body>',''.join(deferred)+'</body>')

messages=[
 {'id':'11111111-1111-4111-8111-111111111111','title':'Kode aktivasi akun tersedia','content':'Rahasiakan kode aktivasi.','type':'activation','read':False,'canReveal':True,'expiresAt':'2026-11-08T12:00:00Z','createdAt':'2026-11-07T12:00:00Z'},
 {'id':'22222222-2222-4222-8222-222222222222','title':'Permintaan aktivasi diterima','content':'Menunggu pemeriksaan identitas.','type':'information','read':True,'canReveal':False,'createdAt':'2026-11-07T10:00:00Z'}
]
mailbox_data={'items':messages,'activationRequest':'sent','applicationStatus':'accepted'}
mailbox_mock='''window.fetch=async (url,opts={})=>{
 const p=String(url); let o={};
 if(p==='/api/player/mailbox')o=__MAILBOX__;
 else if(p==='/api/player/mailbox/reveal')o={ok:true,code:'ExAMple-activation-TOKEN-abc123'};
 else if(p==='/api/player/mailbox/read')o={ok:true};
 else if(p==='/api/player/mailbox/request-activation')o={ok:true,delivered:true,message:'Kode dikirim ke Mail Box.'};
 else if(p==='/api/form')o={settings:{homeVotingEnabled:false,seasonArchiveEnabled:true}};
 else o={ok:true};
 return new Response(JSON.stringify(o),{status:200,headers:{'Content-Type':'application/json'}});
};'''.replace('__MAILBOX__',json.dumps(mailbox_data))
status_mock='''window.__statusChecked=0;
window.fetch=async (url,opts={})=>{
 const p=String(url);let o={};
 if(p==='/api/form')o={settings:{homeVotingEnabled:false}};
 else if(p==='/api/status-check'){window.__statusChecked++;o={status:'accepted',submittedAt:'2026-11-07T12:00:00Z'};}
 else if(p==='/api/player/login')o={authenticated:true,status:'accepted',code:'AAAABBBBCCCCDDDDEEEE'};
 else if(p==='/api/player/me')o={authenticated:true,status:'accepted',code:'AAAABBBBCCCCDDDDEEEE'};
 else if(p==='/api/player/mailbox')o=__MAILBOX__;
 else if(p==='/api/player/mailbox/reveal')o={ok:true,code:'ExAMple-activation-TOKEN-abc123'};
 else if(p==='/api/player/mailbox/delete')o={ok:true};
 else if(p==='/api/player/mailbox/read')o={ok:true};
 else o={ok:true};
 return new Response(JSON.stringify(o),{status:200,headers:{'Content-Type':'application/json'}});
};'''.replace('__MAILBOX__',json.dumps(mailbox_data))
admin_data={'items':[{'id':'11111111-1111-4111-8111-111111111111','status':'accepted','displayName':'Anggota-SSCircle','linkedCount':0,'secureActive':False,'secureSessions':0,'activationRequest':'pending','lastSync':None}],
 'awards':[],'hasMore':False,'policy':{'allowBio':True,'allowPublic':False,'allowStats':True,'allowEventAlerts':True},'total':1}
admin_mock='''window.fetch=async(path,options={})=>{
 const value=String(path).split('?')[0];
 let response={};
 if(value==='/api/admin/member-center')response=__ADMIN__;
 else if(value==='/api/admin/mailbox/approve')response={ok:true,delivered:true,message:'Kode telah dikirim ke Mail Box.'};
 else if(value==='/api/form')response={settings:{}};
 return new Response(JSON.stringify(response),{status:200,headers:{'Content-Type':'application/json'}});
};'''.replace('__ADMIN__',json.dumps(admin_data))
with sync_playwright() as p:
    chrome=os.getenv('SSC_CHROME_BIN','/usr/bin/chromium')
    launch={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
    if Path(chrome).exists(): launch['executable_path']=chrome
    browser=p.chromium.launch(**launch)
    for width in (320,390,768,1280,1920):
        page=browser.new_page(viewport={'width':width,'height':900})
        errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
        page.set_content(inline('mailbox.html',mailbox_mock),wait_until='domcontentloaded')
        page.get_by_text('Kode aktivasi akun tersedia').wait_for()
        assert page.locator('.mailbox-item').count()==2
        size=page.evaluate('''() => ({vw:innerWidth,scroll:document.documentElement.scrollWidth})''')
        assert size['scroll']<=size['vw']+2,('Mail Box overflow',width,size)
        page.locator('.mailbox-item').first.click()
        assert page.locator('#mailbox-detail-title').inner_text()=='Kode aktivasi akun tersedia'
        page.locator('#mailbox-reveal').click()
        page.locator('#mailbox-secret-row').wait_for(state='visible')
        assert 'ExAMple' in page.locator('#mailbox-secret-value').inner_text()
        assert not errs,('Mail Box JS',width,errs)
        print('MAILBOX',width,'PASS')
        page.close()
    for width in (320,390,768,1280):
        page=browser.new_page(viewport={'width':width,'height':900})
        errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
        page.set_content(inline('status.html',status_mock),wait_until='domcontentloaded')
        page.locator('#status-code').fill('AAAABBBBCCCCDDDDEEEE')
        page.locator('#status-check-button').click()
        page.get_by_text('Pendaftaran diterima',exact=True).wait_for()
        page.wait_for_timeout(70)
        assert page.evaluate('window.__statusChecked')==1
        assert page.locator('.status-voting-result-link').is_hidden()
        assert page.locator('#status-result a[href="/mailbox"]').is_visible()
        assert page.locator('#status-result a[href="/my-sscircle"]').is_visible()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
        # A member reads and removes notifications without navigating away.
        page.on('dialog',lambda d:d.accept())
        page.locator('#status-result a[href="/mailbox"]').click()
        page.locator('#ssc-mailbox-dialog[open]').wait_for(state='visible')
        assert page.locator('#ssc-mailbox-list .mailbox-item').count()==2
        page.locator('#ssc-mailbox-list .mailbox-item').first.click()
        assert page.locator('#ssc-mailbox-delete').is_disabled(), 'Active activation code must be preserved'
        page.locator('#ssc-mailbox-list .mailbox-item').nth(1).click()
        assert page.locator('#ssc-mailbox-delete').is_enabled()
        page.locator('#ssc-mailbox-delete').click()
        # The website now uses SSCircle's themed confirmation instead of window.confirm.
        # Confirm the real dialog so this test also covers the current delete flow.
        page.locator('dialog.ssc-circle-dialog[open] .ssc-circle-dialog-accept').click()
        page.wait_for_function("document.querySelectorAll('#ssc-mailbox-list .mailbox-item').length === 1")
        assert page.locator('#ssc-mailbox-list .mailbox-item').count()==1
        page.locator('#ssc-mailbox-close').click()
        assert not page.locator('#ssc-mailbox-dialog').is_visible()
        # The eye icon must reveal and re-hide the same typed password.
        page.locator('#status-secure-login-panel > summary').click()
        password_input=page.locator('#status-secure-password')
        password_input.fill('KataSandi#123')
        eye=page.locator('#status-secure-password + .ssc-password-eye')
        assert eye.is_visible(),('Missing password eye icon',width)
        eye.click()
        assert password_input.get_attribute('type')=='text'
        assert password_input.input_value()=='KataSandi#123'
        eye.click()
        assert password_input.get_attribute('type')=='password'
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
        assert not errs,('Status JS',width,errs)
        print('STATUS',width,'STAYS ON PAGE, PASS')
        page.close()
    # Discord requirement must appear even when the existing saved categories
    # have no Discord rule; the invite must be a clickable official link.
    rules_mock='''window.fetch=async path=>{
      const p=String(path);
      const data=p==='/api/rules'?{
        registrationOpen:true,rulesEnabled:true,version:'signed-test-version',
        discordRequired:true,discordInviteUrl:'https://discord.gg/vQQSgY2GRS'
      }:{settings:{homeDiscordUrl:'https://discord.gg/vQQSgY2GRS'}};
      return new Response(JSON.stringify(data),{status:200,
        headers:{'Content-Type':'application/json'}});
    };'''
    for width in (320,390,768,1280):
        rules=browser.new_page(viewport={'width':width,'height':850})
        rule_errors=[]
        rules.on('pageerror',lambda e:rule_errors.append(str(e)))
        rules.set_content(inline('rules.html',rules_mock),wait_until='domcontentloaded')
        assert rules.locator('#rules-discord-join').is_visible()
        assert rules.locator('#rules-discord-join').get_attribute('href')=='https://discord.gg/vQQSgY2GRS'
        assert rules.locator('#rules-discord-check').is_visible()
        assert rules.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),('Discord rules overflow',width)
        assert not rule_errors,('Rules Javascript',width,rule_errors)
        rules.close()
    page=browser.new_page(viewport={'width':390,'height':950})
    page.on('dialog',lambda d:d.accept())
    page.set_content(inline('admin.html',admin_mock),wait_until='domcontentloaded')
    page.evaluate('''() => {document.getElementById('dashboard').classList.remove('hide');document.getElementById('login').classList.add('hide');document.getElementById('members-admin').classList.remove('hide');}''')
    page.evaluate('window.SSCircleMemberCenterAdmin.load(true)')
    page.locator('.member-admin-tab').nth(5).click()
    page.get_by_text('Verifikasi & kirim kode ke Mail Box').click()
    page.locator('dialog.ssc-circle-dialog[open] .ssc-circle-dialog-accept').click()
    page.get_by_text('Kode otomatis dikirim').wait_for()
    assert page.get_by_text('Kode otomatis dikirim').count()==1
    assert page.locator('.member-admin-invite-secret').count()==0
    assert page.evaluate("document.querySelector('#members-admin-root').scrollWidth <= document.querySelector('#members-admin-root').clientWidth+2")
    page.close()
    # V10.42: a transient error must clear private mail from the previous load.
    recovery=browser.new_page(viewport={'width':390,'height':820})
    widget_js=(ROOT/'mailbox-widget.js').read_text(encoding='utf-8')
    mock_data=json.dumps({'items':messages,'activationRequest':'sent','applicationStatus':'accepted'})
    recovery_mock="""window.__mailboxFailure=0;
    window.fetch=async()=>{
      let code=window.__mailboxFailure;
      let data=code===0?__DATA__:{error:code===2?'Masuk kembali.':'Layanan belum tersedia.'};
      return new Response(JSON.stringify(data),{
        status:code===2?403:code===1?503:200,
        headers:{'Content-Type':'application/json'}
      });
    };""".replace('__DATA__',mock_data)
    shell='<!doctype html><html><body><button data-open-mailbox>Buka inbox</button>'
    dialog_js=(ROOT/'ssc-dialog.js').read_text(encoding='utf-8')
    shell+='<script>'+recovery_mock+'</script><script>'+dialog_js.replace('</script','<\\/script')+'</script>'
    shell+='<script>'+widget_js.replace('</script','<\\/script')+'</script></body></html>'
    recovery.set_content(shell,wait_until='domcontentloaded')
    recovery.get_by_text('Buka inbox').click()
    recovery.locator('#ssc-mailbox-list .mailbox-item').first.wait_for()
    assert recovery.locator('#ssc-mailbox-list .mailbox-item').count()==2
    recovery.evaluate('window.__mailboxFailure=1')
    recovery.locator('#ssc-mailbox-refresh').click()
    recovery.get_by_text('Gagal memuat pesan. Tekan Perbarui untuk mencoba lagi.').wait_for()
    assert recovery.locator('#ssc-mailbox-list .mailbox-item').count()==0
    recovery.evaluate('window.__mailboxFailure=2')
    recovery.locator('#ssc-mailbox-refresh').click()
    recovery.locator('#ssc-mailbox-signin').wait_for(state='visible')
    assert recovery.locator('#ssc-mailbox-signin').get_attribute('href')=='/status.html#kode-milikku'
    recovery.evaluate('window.__mailboxFailure=0')
    recovery.locator('#ssc-mailbox-refresh').click()
    recovery.locator('#ssc-mailbox-list .mailbox-item').first.wait_for()
    assert recovery.locator('#ssc-mailbox-signin').is_hidden()
    # V10.43: selection checkbox never offers an active activation code for deletion.
    recovery.locator('#ssc-mailbox-select-mode').click()
    assert recovery.locator('.ssc-mailbox-select-control input').count()==2
    assert recovery.locator('.ssc-mailbox-select-control input').first.is_disabled()
    recovery.locator('#ssc-mailbox-select-all').click()
    assert recovery.locator('#ssc-mailbox-selected-count').inner_text()=='1 dipilih'
    recovery.on('dialog',lambda d:d.accept())
    recovery.locator('#ssc-mailbox-delete-selected').click()
    recovery.locator('dialog.ssc-circle-dialog[open] .ssc-circle-dialog-accept').click()
    recovery.wait_for_function("document.querySelectorAll('#ssc-mailbox-list .mailbox-item').length === 1")
    assert recovery.locator('#ssc-mailbox-list .mailbox-item').count()==1
    recovery.close()

    # V10.43: Profile Studio can reorder with pointer and has a real mobile preview switch.
    studio=browser.new_page(viewport={'width':430,'height':890})
    editor=(ROOT/'profile-admin.js').read_text(encoding='utf-8')
    studio_css=(ROOT/'profile-ui.css').read_text(encoding='utf-8')
    shell='<!doctype html><html><head><style>'+studio_css+'</style></head><body>'
    shell+='<div id="profile-admin-root"></div><div id="profile-preview-devices">'
    shell+='<button type="button" data-profile-device="desktop">Desktop</button>'
    shell+='<button type="button" data-profile-device="mobile">HP</button></div>'
    shell+='<div id="profile-preview-stage" data-device="desktop"></div>'
    shell+='<script>'+editor.replace('</script','<\\/script')+'</script></body></html>'
    studio.set_content(shell,wait_until='domcontentloaded')
    studio.evaluate("""() => window.SSCircleProfileAdmin.render({settings:{
      profilePageTitle:'Profile',profilePageSubtitle:'Pratinjau profil anggota',
      profilePageLayout:'sidebar',profilePageHeroStyle:'default',profilePageCardStyle:'soft',
      profilePageSections:['welcome','security','preferences','achievements','linking','stats','explore'],
      profilePageHidden:[]
    }},()=>{})""")
    assert studio.locator('.ssc-profile-admin-card').count()==8
    assert studio.locator('[data-section-id="social"]').count()==1
    assert studio.locator('[data-section-id="security"] input[type=checkbox]').is_disabled()
    studio.locator('[data-profile-device="mobile"]').click()
    assert studio.locator('#profile-preview-stage').get_attribute('data-device')=='mobile'
    first=studio.locator('.ssc-profile-drag-handle').first.bounding_box()
    third=studio.locator('.ssc-profile-admin-card').nth(2).bounding_box()
    studio.mouse.move(first['x']+first['width']/2,first['y']+first['height']/2)
    studio.mouse.down()
    studio.mouse.move(third['x']+third['width']/2,third['y']+third['height']*.8,steps=6)
    studio.mouse.up()
    studio.wait_for_function("document.querySelector('.ssc-profile-admin-card').dataset.sectionId !== 'welcome'")
    assert studio.locator('.ssc-profile-admin-card').first.get_attribute('data-section-id')=='security'
    assert studio.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
    studio.close()
    browser.close()
    print('BROWSER MAILBOX REGRESSION PASS')
