import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const paper=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/SSCirclePaperLinkPlugin.java',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../minecraft-link-paper/src/main/resources/plugin.yml',import.meta.url),'utf8');
const config=readFileSync(new URL('../minecraft-link-paper/src/main/resources/config.yml',import.meta.url),'utf8');
const gradle=readFileSync(new URL('../minecraft-link-paper/build.gradle.kts',import.meta.url),'utf8');
const worker=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
test('Paper Direct: class and plugin.yml target Paper 26.3, not Velocity',()=>{
 assert.match(manifest,/api-version: '26\.3'/);
 assert.match(manifest,/main: id\.sscircle\.paper\.SSCirclePaperLinkPlugin/);
 assert.match(manifest,/sscircle:/);
 assert.match(manifest,/softdepend: \[floodgate\]/);
 assert.match(paper,/extends JavaPlugin implements CommandExecutor, TabCompleter, Listener/);
 assert.match(paper,/getCommand\("sscircle"\)\.setExecutor\(this\)/);
 assert.match(paper,/getCommand\("sscircle"\)\.setTabCompleter\(this\)/);
 assert.doesNotMatch(paper,/com\.velocitypowered/);
 assert.match(gradle,/paper-api:26\.3\.build\.\+/);
 assert.match(gradle,/JavaLanguageVersion\.of\(25\)/);
});
test('Paper Direct: fail closed for offline/mixed login, validate Bedrock by Floodgate XUID',()=>{
 assert.match(paper,/if \(!Bukkit\.getOnlineMode\(\) \|\| hasUntrustedLoginPlugin\(\)\)/);
 assert.match(paper,/isPluginEnabled\(name\)/);
 assert.match(paper,/isFloodgatePlayer/);
 assert.match(paper,/getPlayer", UUID\.class/);
 assert.match(paper,/getXuid/);
 assert.match(paper,/if \(!xuid\.matches\(/);
 assert.match(paper,/return null; \/\/ Do not silently misclassify Bedrock as Java Premium\./);
 assert.match(paper,/player\.getUniqueId\(\)\.toString\(\)/);
 assert.doesNotMatch(paper,/java_offline",/);
 assert.doesNotMatch(paper,/offline-uuid/);
});
test('Paper Direct: same signed claim contract as V10.45 website',()=>{
 assert.match(paper,/private static final String CLAIM_PATH = "\/api\/minecraft\/link\/claim"/);
 assert.match(paper,/"POST\\n" \+ CLAIM_PATH \+ "\\n"/);
 assert.match(paper,/X-SSC-Timestamp/);
 assert.match(paper,/X-SSC-Nonce/);
 assert.match(paper,/X-SSC-Signature/);
 assert.match(paper,/HmacSHA256/);
 assert.match(paper,/sendAsync\(request, HttpResponse\.BodyHandlers\.ofString/);
 assert.match(paper,/getServer\(\)\.getScheduler\(\)\.runTask\(this,/);
 assert.match(paper,/SSCIRCLE_LINK_SERVER_SECRET/);
 assert.match(worker,/async function minecraftLinkClaim\(req,env\)/);
 assert.match(worker,/POST\\n\/api\/minecraft\/link\/claim\\n/);
 assert.match(worker,/identity\.source!==bodyValue\.authSource/);
});
test('Paper Direct: no insecure default endpoint or secrets in shipped config',()=>{
 assert.match(config,/endpoint: "https:\/\/example\.pages\.dev"/);
 assert.match(paper,/"example\.pages\.dev"\.equalsIgnoreCase/);
 assert.match(paper,/!"https"\.equalsIgnoreCase\(uri\.getScheme\(\)\)/);
 assert.doesNotMatch(config,/(?:api[_-]?key|server[_-]?secret|password)\s*:\s*["'][A-Za-z0-9_-]{16,}["']/i);
 assert.doesNotMatch(paper,/getLogger\(\).*(?:code|signingSecret|signature)/);
 assert.match(paper,/getServer\(\)\.getPluginManager\(\)\.registerEvents\(this, this\)/);
});

test('V10.45.2: safe tab-completion shows matching commands and hides admin-only reload',()=>{
 assert.match(manifest,/version: '10\.45\.2'/);
 assert.match(paper,/implements CommandExecutor, TabCompleter, Listener/);
 assert.match(paper,/public List<String> onTabComplete\(CommandSender sender, Command command, String alias, String\[\] args\)/);
 assert.match(paper,/if \(args\.length != 1\) return List\.of\(\)/);
 assert.match(paper,/List\.of\("help", "status"\)/);
 assert.match(paper,/sender instanceof Player\) options\.add\("link"\)/);
 assert.match(paper,/sender\.hasPermission\("sscircle\.admin"\)\) options\.add\("reload"\)/);
 assert.match(paper,/option\.startsWith\(prefix\)/);
 assert.doesNotMatch(paper,/options\.add\("SC-/);
 assert.match(paper,/private void showHelp\(CommandSender sender\)/);
 assert.match(paper,/if \(args\.length == 0 \|\| \(args\.length == 1 && args\[0\]\.equalsIgnoreCase\("help"\)\)\)/);
});
test('V10.45.2: explain both independent failures without exposing shared secret',()=>{
 assert.match(paper,/Alamat website HTTPS:/);
 assert.match(paper,/Kunci komunikasi website:/);
 assert.match(paper,/Konfigurasi website:/);
 assert.match(paper,/online-mode=true di server\.properties/);
 assert.match(paper,/SSCIRCLE_LINK_SERVER_SECRET lalu restart Paper/);
 assert.match(paper,/String secret = System\.getenv\(SECRET_ENV\)/);
 assert.doesNotMatch(paper,/sender\.sendMessage\(.*signingSecret\)/);
});

test('V10.45.3: operator-only signed diagnostic and safe error presentation',()=>{
 assert.match(manifest,/version: '10\.45\.3'/);
 assert.match(paper,/private static final String DIAGNOSE_PATH = "\/api\/minecraft\/link\/diagnose"/);
 assert.match(paper,/options\.add\("diagnose"\)/);
 assert.match(paper,/private void runDiagnostic\(CommandSender sender\)/);
 assert.match(paper,/getScheduler\(\)\.runTask\(this/);
 assert.match(paper,/private static String safeResponseCode/);
 assert.match(paper,/private static String safeFailureReason/);
 assert.match(paper,/case "SIGNATURE_INVALID"/);
 assert.match(paper,/case "CLOCK_SKEW"/);
 assert.match(paper,/case 403 -> "Akses website ditolak/);
 assert.match(worker,/async function minecraftLinkDiagnose\(req,env\)/);
 assert.match(worker,/if\(path==='\/api\/minecraft\/link\/diagnose' && method==='POST'\)/);
 assert.doesNotMatch(paper,/sendMessage\(.*\.body\(\)\)/);
});
