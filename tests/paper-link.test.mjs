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
 assert.match(manifest,/softdepend: \[floodgate, AuthMe, AuthMeReloaded, packetevents, FastLogin, FastLoginPlus, ProtocolLib, SkinsRestorer\]/);
 assert.match(paper,/extends JavaPlugin implements CommandExecutor, TabCompleter, Listener/);
 assert.match(paper,/getCommand\("sscircle"\)\.setExecutor\(this\)/);
 assert.match(paper,/getCommand\("sscircle"\)\.setTabCompleter\(this\)/);
 assert.doesNotMatch(paper,/com\.velocitypowered/);
 assert.match(gradle,/paper-api:26\.3\.build\.\+/);
 assert.match(gradle,/JavaLanguageVersion\.of\(25\)/);
});
test('Paper Direct: mixed login only with authenticated AuthMe and Floodgate XUID',()=>{
 assert.match(paper,/if \(hasUntrustedLoginPlugin\(\)\) return null/);
 assert.match(paper,/mixedModeReady\(\)/);
 assert.match(paper,/AuthMeSessionBridge\.isAuthenticated\(player, authMe\)/);
 assert.match(paper,/isPluginEnabled\(name\)/);
 assert.match(paper,/isFloodgatePlayer/);
 assert.match(paper,/getPlayer", UUID\.class/);
 assert.match(paper,/getXuid/);
 assert.match(paper,/if \(!xuid\.matches\(/);
 assert.match(paper,/return null; \/\/ Do not silently misclassify Bedrock as Java Premium\./);
 assert.match(paper,/player\.getUniqueId\(\)\.toString\(\)/);
 assert.match(paper,/new Identity\("java_offline", accountId,/);
 assert.match(paper,/"authme-session"/);
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
 assert.match(manifest,/version: '10\.54\.6'/);
 assert.match(paper,/implements CommandExecutor, TabCompleter, Listener/);
 assert.match(paper,/public List<String> onTabComplete\(CommandSender sender, Command command, String alias, String\[\] args\)/);
 assert.match(paper,/if \(args\.length != 1\) return List\.of\(\)/);
 assert.match(paper,/List\.of\("help", "status"\)/);
 assert.match(paper,/sender instanceof Player\) options\.add\("link"\)/);
 assert.match(paper,/sender\.hasPermission\("sscircle\.admin"\)\) \{/);
 assert.match(paper,/options\.add\("reload"\)/);
 assert.match(paper,/option\.startsWith\(prefix\)/);
 assert.doesNotMatch(paper,/options\.add\("SC-/);
 assert.match(paper,/private void showHelp\(CommandSender sender\)/);
 assert.match(paper,/if \(args\.length == 0 \|\| \(args\.length == 1 && args\[0\]\.equalsIgnoreCase\("help"\)\)\)/);
});
test('V10.45.2: explain both independent failures without exposing shared secret',()=>{
 assert.match(paper,/statusItem\(sender,"Web SSCircle"/);
 assert.match(paper,/statusItem\(sender,"Kunci aman"/);
 assert.match(paper,/hasConnectionSettings\(\)/);
 assert.match(paper,/authme-mixed-mode\.enabled/);
 assert.match(paper,/server-secret\.txt/);
 assert.match(paper,/SecretFileStore\.resolve\(/);
 assert.match(paper,/System\.getenv\(SECRET_ENV\)/);
 assert.doesNotMatch(paper,/sender\.sendMessage\(.*signingSecret\)/);
});

test('V10.45.3: operator-only signed diagnostic and safe error presentation',()=>{
 assert.match(manifest,/version: '10\.54\.6'/);
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

test('V10.45.4: private file overrides stale environment without leaking secret',()=>{
 const local=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/SecretFileStore.java',import.meta.url),'utf8');
 assert.match(local,/record ResolvedSecret/);
 assert.match(local,/Files\.exists\(file, LinkOption\.NOFOLLOW_LINKS\)/);
 assert.match(local,/return new ResolvedSecret\(loadOrCreate\(directory\), "file privat plugin", false\)/);
 assert.match(local,/SecureRandom/);
 assert.match(paper,/SecretFileStore\.resolve\(/);
 assert.match(paper,/statusItem\(sender,"Sumber kunci",pairing==null\?secretSource:/);
 assert.doesNotMatch(paper,/sender\.sendMessage\([^\n]*signingSecret\)/);
});

test('V10.46.0: explicit AuthMe mode prevents spoofed premium/offline identity',()=>{
 const bridge=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/AuthMeSessionBridge.java',import.meta.url),'utf8');
 const ids=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/AuthMeAccountId.java',import.meta.url),'utf8');
 assert.match(config,/authme-mixed-mode:\s*\n\s*enabled: false/);
 assert.match(paper,/getConfig\(\)\.getBoolean\("authme-mixed-mode.enabled", false\)/);
 assert.match(paper,/isPluginEnabled\("packetevents"\)/);
 assert.match(paper,/AuthMeSessionBridge\.isAuthenticated\(player, authMe\)/);
 assert.match(paper,/if \(!Bukkit\.getOnlineMode\(\)\) \{/);
 assert.match(paper,/new Identity\("java_offline", accountId,/);
 assert.match(paper,/new Identity\("java_premium", uuid, "mojang-online"/);
 assert.match(paper,/return new Identity\("bedrock", xuid, "floodgate-xuid"/);
 assert.match(bridge,/AuthMeApi/);
 assert.match(bridge,/isAuthenticated/);
 assert.match(bridge,/isRegistered/);
 assert.match(bridge,/isUnrestricted/);
 assert.doesNotMatch(bridge,/forceLogin\(/);
 assert.match(ids,/UUID\.nameUUIDFromBytes/);
 assert.match(worker,/authme-session/);
 assert.match(worker,/authmeId\.test/);
});

test('V10.47: vanilla statistics are only sampled for verified identities',()=>{
 const stats=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/PaperStatsSync.java',import.meta.url),'utf8');
 assert.match(stats,/resolveIdentity\.apply\(player\)/);
 assert.match(stats,/if\(id==null\)return/);
 assert.match(stats,/Statistic\.PLAY_ONE_MINUTE/);
 assert.match(stats,/Statistic\.DEATHS/);
 assert.match(stats,/Statistic\.MOB_KILLS/);
 assert.match(stats,/Statistic\.MINE_BLOCK/);
 assert.match(stats,/stats-queue\.properties/);
 assert.match(stats,/sendAsync\(request,HttpResponse\.BodyHandlers\.ofString/);
 assert.match(stats,/eventId\(\)\.equals\(eventId\)/);
 assert.match(stats,/scheduleRetry\(-1,null\)/);
 assert.match(stats,/StandardCopyOption\.ATOMIC_MOVE/);
 assert.match(paper,/statsSync\.start\(\)/);
 assert.match(paper,/statsSync\.stop\(\)/);
 assert.match(worker,/async function minecraftStatsIngest\(req,env\)/);
 assert.match(worker,/STATS_NOT_LINKED/);
 assert.match(worker,/minecraft_stat_receipts/);
});

test('V10.47.2: statistic collection is tick-budgeted, disk I/O asynchronous and season-aware',()=>{
 const stats=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/PaperStatsSync.java',import.meta.url),'utf8');
 assert.match(stats,/capturePeriodTicks\(plugin\.getConfig\(\)\.getInt\("stats-sync\.capture-period-ticks",2\)\)/);
 assert.match(stats,/this::captureScheduled/);
 assert.match(stats,/stats-sync.busy-player-threshold/);
 assert.match(config,/adaptive-enabled:\s*true/);
 assert.match(stats,/blockReadsPerTick=Math\.max/);
 assert.match(stats,/while\(budget-->0&&activeJob\.index<blockMaterials\.size\(\)\)/);
 assert.match(stats,/Executors\.newSingleThreadExecutor/);
 assert.match(stats,/diskWriter\.execute\(this::drainWrites\)/);
 assert.match(stats,/SyncRetryPolicy\.nextBaseDelayMs\(retryDelayMs\)/);
 assert.match(stats,/lastDelivery=/);
 assert.match(config,/block-reads-per-tick:\s*16/);
 assert.match(config,/queue-flush-seconds:\s*10/);
 assert.match(worker,/minecraft_stat_progress/);
 assert.match(worker,/statSeasonActivatedAt/);
 assert.match(worker,/total_playtime/);
});

test('V10.48: health heartbeat is lightweight, asynchronous and cannot execute arbitrary commands',()=>{
 const telemetry=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/PaperSyncTelemetry.java',import.meta.url),'utf8');
 const stats=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/PaperStatsSync.java',import.meta.url),'utf8');
 assert.match(telemetry,/\/api\/minecraft\/sync\/heartbeat/);
 assert.match(telemetry,/sendAsync\(request,HttpResponse\.BodyHandlers\.ofString/);
 assert.match(telemetry,/sync_now/);
 assert.match(telemetry,/stats\.triggerNow\(\)/);
 assert.match(telemetry,/id\.equals\(lastExecutedId\)/);
 assert.match(telemetry,/completedCommandId/);
 assert.match(telemetry,/Bukkit\.getTPS\(\)\[0\]/);
 assert.match(stats,/String deliveryCode\(\)/);
 assert.match(stats,/int captureBacklogCount\(\)/);
 assert.match(paper,/syncTelemetry\.start\(\)/);
 assert.match(config,/sync-monitor:/);
 assert.match(worker,/minecraftSyncHeartbeat\(req,env\)/);
 assert.match(worker,/minecraftSyncAdmin\(req,env,path,method\)/);
 assert.match(worker,/minecraft_sync_commands/);
});

test('V10.48.2: optional FastLogin adapter uses the verified per-session API, never nickname',()=>{
  const bridge=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/FastLoginSessionBridge.java',import.meta.url),'utf8');
   assert.match(bridge,/getMethod\("getStatus",UUID\.class\)/);
   assert.match(bridge,/case "PREMIUM" -> new Probe\(Status\.PREMIUM/);
   assert.match(bridge,/case "CRACKED" -> new Probe\(Status\.CRACKED/);
   assert.match(bridge,/default -> new Probe\(Status\.UNKNOWN/);
  assert.match(paper,/FastLoginSessionBridge\.read\(player, fastLoginPlugin\(\)\)/);
  assert.match(paper,/case PREMIUM -> "fastlogin-premium"/);
  assert.match(paper,/case CRACKED -> "fastlogin-cracked"/);
  assert.match(paper,/new Identity\("java_offline", accountId, source, type\)/);
  assert.doesNotMatch(bridge,/https?:\/\/|api\.mojang/);
});

test('V10.48.3: FastLoginPlus name is detected and duplicate login adapters fail closed',()=>{
  assert.match(paper,/hasConflictingFastLoginPlugins\(\)/);
  assert.match(paper,/isPluginEnabled\("FastLoginPlus"\)/);
  assert.match(paper,/getPlugin\("FastLoginPlus"\)/);
  assert.match(paper,/if \(hasConflictingFastLoginPlugins\(\)\) return null/);
  assert.match(paper,/getStatus\(UUID\)/);
});
test('V10.48.3: stats changes to authSource are not discarded as duplicate snapshots',()=>{
  const stats=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/PaperStatsSync.java',import.meta.url),'utf8');
  assert.match(stats,/sameSnapshotAndEvidence\(old,id\.authSource\(\),playtime,deaths,mobs,blocks\)/);
  assert.match(stats,/old\.authSource\(\)\.equals\(authSource\)/);
  const bridge=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/FastLoginSessionBridge.java',import.meta.url),'utf8');
   assert.match(bridge,/interpretProbe\(Object response\)/);
   assert.match(bridge,/case "PREMIUM" -> new Probe\(Status\.PREMIUM/);
   assert.match(bridge,/case "CRACKED" -> new Probe\(Status\.CRACKED/);
  assert.doesNotMatch(bridge,/api\.mojang|https?:\/\//);
});

test('V10.48.4.3: account safety cannot be bypassed by changed Java session or duplicate login',()=>{
 const guard=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/IdentitySessionGuard.java',import.meta.url),'utf8');
 assert.match(guard,/enum State \{ OK, NO_SESSION, INVALID_NAME, ACCOUNT_CHANGED, DUPLICATE_SESSION \}/);
 assert.match(guard,/owners\.size\(\) != 1/);
 assert.match(paper,/identitySessions\.check\(player\.getUniqueId\(\),player\.getName\(\),accountId\)/);
 assert.match(paper,/identitySessions\.joined\(event\.getPlayer\(\)\.getUniqueId\(\),event\.getPlayer\(\)\.getName\(\)\)/);
 assert.match(paper,/identitySessions\.left\(event\.getPlayer\(\)\.getUniqueId\(\)\)/);
 assert.match(paper,/IdentitySessionGuard\.State\.OK/);
 assert.match(worker,/minecraftIdentityWarnings=/);
});

test('V10.48.4.3: identity proof refresh never waits for stats or invents Premium',()=>{
 const proof=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/PaperIdentitySync.java',import.meta.url),'utf8');
 assert.match(paper,/new PaperIdentitySync\(this,http,this::identityFor/);
 assert.match(paper,/identitySync\.forceAll\(\)/);
 assert.match(paper,/FastLoginSessionBridge\.read\(player,\s*fastLoginPlugin\(\)\)/);
 assert.match(proof,/\/api\/minecraft\/identity\/refresh/);
 assert.match(proof,/sendAsync\(request,HttpResponse\.BodyHandlers\.ofString/);
 assert.match(proof,/SUCCESS_REFRESH_MS=10\*60000L/);
 assert.match(proof,/MAX_ACTIVE=3/);
 assert.match(worker,/async function minecraftIdentityRefresh\(req,env\)/);
 assert.match(worker,/const minecraftLinkedEdition=/);
 assert.doesNotMatch(proof,/player\.getStatistic|MINE_BLOCK|PlayerStatistic/);
});

test('V10.48.4.3: status is grouped, coloured and separates FLP session from licence',()=>{
  const bridge=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/FastLoginSessionBridge.java',import.meta.url),'utf8');
  assert.match(paper,/void showReadableStatus\(CommandSender sender\)/);
  assert.match(paper,/statusSection\(sender,"SERVER & WEBSITE"\)/);
  assert.match(paper,/statusSection\(sender,"AKUN & BUKTI LOGIN"\)/);
  assert.match(paper,/statusSection\(sender,"PENGIRIMAN KE WEBSITE"\)/);
  assert.match(paper,/statusSection\(sender,"LANGKAH BERIKUT"\)/);
  assert.match(paper,/FastLoginSessionBridge\.inspect\(/);
  assert.match(bridge,/enum Reason/);
  assert.match(bridge,/case "PREMIUM"/);
  assert.match(bridge,/case "CRACKED"/);
  assert.match(bridge,/getMethod\("getStatus",UUID\.class\)/);
  assert.doesNotMatch(bridge,/api\.mojang\.com/);
  assert.match(paper,/bukan bukti lisensi Non-Premium/);
});

test('V10.48.4.3: offline-session label is not mistaken for licence ownership',()=>{
  const dash=readFileSync(new URL('../player-dashboard.js',import.meta.url),'utf8');
  const admin=readFileSync(new URL('../minecraft-sync-admin.js',import.meta.url),'utf8');
  const sync=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/PaperIdentitySync.java',import.meta.url),'utf8');
  assert.match(dash,/java_non_premium:'Minecraft Java \(sesi offline\)'/);
  assert.match(admin,/java_non_premium:'Minecraft Java \(sesi offline\)'/);
  assert.match(worker,/SESI_OFFLINE_BELUM_PREMIUM/);
  assert.match(sync,/WEB_VERSION_MISMATCH/);
  assert.match(sync,/IDENTITY_NOT_LINKED/);
});

test('V10.48.4.3: Profile/Admin refresh their actual script URLs after Premium fixes',()=>{
 const profileHtml=readFileSync(new URL('../my-sscircle.html',import.meta.url),'utf8');
 const adminHtml=readFileSync(new URL('../admin.html',import.meta.url),'utf8');
 const headers=readFileSync(new URL('../_headers',import.meta.url),'utf8');
 const dashboardTag=profileHtml.match(/player-dashboard\.js\?v=(\d+)\.(\d+)\.(\d+)/);
 assert.ok(dashboardTag,'Profile harus memuat Player Dashboard dengan versi cache yang jelas');
 const [major,minor,patch]=dashboardTag.slice(1).map(Number);
 assert.ok(major>10||(major===10&&(minor>49||(minor===49&&patch>=1))),
   'Jangan memuat script Dashboard versi lama');
 assert.match(adminHtml,/minecraft-sync-admin\.js\?v=10\.54\.5/);
 assert.match(adminHtml,/minecraft-sync-admin\.css\?v=10\.54\.5/);
 assert.match(headers,/\/my-sscircle\.html\s+Cache-Control: no-store/);
 assert.match(headers,/\/my-sscircle\s+Cache-Control: no-store/);
 assert.match(headers,/\/admin\.html\s+Cache-Control: no-store/);
});

test('V10.48.4.3: monitor heartbeat version validation and precise player diagnostics',()=>{
  const telemetry=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/PaperSyncTelemetry.java',import.meta.url),'utf8');
  assert.match(paper,/hasLegacyProtocolLibLoginListener\(\)/);
  assert.match(paper,/PlayerLoginEvent\.getHandlerList\(\)\.getRegisteredListeners\(\)/);
  assert.match(paper,/Console tidak menampilkan identitas pemain/);
  assert.match(telemetry,/TELEMETRY_INVALID/);
  assert.match(worker,/TELEMETRY_INVALID/);
  assert.ok(worker.includes('input.pluginVersion'));
});

test('V10.49.0: TPS-aware capture and offline identity recovery preserve safety',()=>{
 const stats=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/PaperStatsSync.java',import.meta.url),'utf8');
 const identity=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/PaperIdentitySync.java',import.meta.url),'utf8');
 const retry=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/SyncRetryPolicy.java',import.meta.url),'utf8');
 assert.match(config,/tps-aware-enabled: true/);
 assert.match(config,/low-tps-block-reads-per-tick: 4/);
 assert.match(stats,/int budget=currentReadBudget\(\)/);
 assert.match(stats,/lowTps=samples\.length>0/);
 assert.match(stats,/rememberSample\(key,snapshot\)/);
 assert.match(stats,/SyncRetryPolicy\.delayMs\(/);
 assert.match(stats,/response\.headers\(\)\.firstValue\("Retry-After"\)/);
 assert.match(identity,/if\(state\.inflight\|\|now<state\.retryNotBeforeMs\)continue/);
 assert.match(identity,/SyncRetryPolicy\.delayMs\(/);
 assert.match(identity,/state\.retryDelayMs=RETRY_MS/);
 assert.match(retry,/httpStatus == 429 \|\| httpStatus == 503/);
 assert.match(retry,/MAX_DELAY_MS = 300_000L/);
 assert.doesNotMatch(stats,/http\.send\(/);
 assert.doesNotMatch(identity,/http\.send\(/);
});

test('V10.49.1.1: separate Skin Bridge never bypasses the existing SSCircle login identity guard',()=>{
 const bridge=readFileSync(new URL('../minecraft-skin-bridge-paper/src/main/java/id/sscircle/skin/SSCircleSkinBridge.java',import.meta.url),'utf8');
 const publisher=readFileSync(new URL('../minecraft-skin-bridge-paper/src/main/java/id/sscircle/skin/SkinPublisher.java',import.meta.url),'utf8');
 const addonYml=readFileSync(new URL('../minecraft-skin-bridge-paper/src/main/resources/plugin.yml',import.meta.url),'utf8');
 assert.match(addonYml,/depend: \[SSCirclePlayerSync\]/);
 assert.match(addonYml,/softdepend: \[SkinsRestorer\]/);
 assert.match(bridge,/getDeclaredMethod\("identityFor",Player\.class\)/);
 assert.match(bridge,/identity==null\)return null/);
 assert.match(bridge,/server-secret\.txt/);
 assert.doesNotMatch(bridge,/setSkin\(|setSkinIdOfPlayer|UUID\.nameUUIDFromBytes/);
 assert.match(publisher,/http\.send\(request,HttpResponse\.BodyHandlers\.ofString\(\)\)/);
 assert.match(publisher,/getSkinForPlayer/);
 assert.match(publisher,/textures/);
 assert.match(publisher,/MAX_ACTIVE=2/);
 assert.match(publisher,/runTaskAsynchronously/); // HTTP only on a bounded Bukkit async worker
});


test('V10.49.1.2: Paper Skin Bridge exposes useful HTTP and texture-source diagnostics',()=>{
 const bridge=readFileSync(new URL('../minecraft-skin-bridge-paper/src/main/java/id/sscircle/skin/SSCircleSkinBridge.java',import.meta.url),'utf8');
 const source=readFileSync(new URL('../minecraft-skin-bridge-paper/src/main/java/id/sscircle/skin/SkinPublisher.java',import.meta.url),'utf8');
 assert.match(bridge,/\/ssskin inspect/);
 assert.match(source,/SKINSRESTORER_BELUM_MEMILIKI_SKIN/);
 assert.match(source,/getSkinOfPlayer/);
 assert.match(source,/X-SSC-Signature/);
 assert.match(source,/statusCode==200/);
 assert.match(source,/SKIN_GAMBAR_TERSIMPAN_HTTP_200/);
 assert.match(source,/HTTP_/);
});


test('V10.49.1.3: addon sends PNG only after CDN validation, retries automatic first login and checks D1 ACK',()=>{
 const source=readFileSync(new URL('../minecraft-skin-bridge-paper/src/main/java/id/sscircle/skin/SkinPublisher.java',import.meta.url),'utf8');
 const addon=readFileSync(new URL('../minecraft-skin-bridge-paper/src/main/java/id/sscircle/skin/SSCircleSkinBridge.java',import.meta.url),'utf8');
 assert.match(source,/skinPngBase64/);
 assert.match(source,/MAX_IMAGE_BYTES=131072/);
 assert.match(source,/textures\.minecraft\.net\/texture\//);
 assert.match(source,/scheduleRetry\(uuid,0,100L\)/);
 assert.match(source,/LOGIN_BELUM_TERVERIFIKASI.*retry\(uuid,attempt\)/);
 assert.match(source,/imageStored/);
 assert.match(source,/WORKER_BELUM_SUPPORT_SIMPAN_PNG/);
 assert.match(addon,/10\.49\.1\.4/);
});


test('V10.49.1.7: Paper and SkinBridge use server-scoped HMAC headers',()=>{
 const core=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/SSCirclePaperLinkPlugin.java',import.meta.url),'utf8');
 const agent=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/ServerPairing.java',import.meta.url),'utf8');
 assert.match(config,/auto-pairing:\s*\n  enabled: true/);
 assert.match(core,/startPairingIfNeeded\(\)/);
 assert.match(core,/pairingServerId\(\)/);
 assert.match(agent,/runTaskTimerAsynchronously/);
 assert.match(agent,/server-pair\/register/);
 assert.match(agent,/server-pair\/poll/);
 for(const file of ['PaperStatsSync.java','PaperIdentitySync.java','PaperSyncTelemetry.java','PaperSkinSync.java']){
  const content=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/'+file,import.meta.url),'utf8');
  assert.match(content,/X-SSC-Server-Id/,file);
 }
 const bridge=readFileSync(new URL('../minecraft-skin-bridge-paper/src/main/java/id/sscircle/skin/SSCircleSkinBridge.java',import.meta.url),'utf8');
 const skin=readFileSync(new URL('../minecraft-skin-bridge-paper/src/main/java/id/sscircle/skin/SkinPublisher.java',import.meta.url),'utf8');
 assert.match(bridge,/activeCoreSecret/);assert.match(bridge,/activeCoreId/);
 assert.match(skin,/X-SSC-Server-Id/);
});


test('statistics collection stops retrying unsupported material categories on future scans',()=>{
 const stats=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/PaperStatsSync.java',import.meta.url),'utf8');
 assert.match(stats,/rejectedMaterials\.add\(material\)/);
 assert.match(stats,/blockMaterials\.removeAll\(rejectedMaterials\)/);
 assert.match(stats,/activeJob=null;\s*\/\/ Only compact after/);
 assert.match(stats,/http\.sendAsync\(/);
});

test('V10.54: bounded snapshot cache, coalesced disk writer, and non-destructive overflow',()=>{
 const stats=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/PaperStatsSync.java',import.meta.url),'utf8');
 assert.match(stats,/MAX_RECENT_SAMPLES=2048/);
 assert.match(stats,/AtomicReference<List<Snapshot>> waitingWrite/);
 assert.match(stats,/writerRunning\.compareAndSet\(false,true\)/);
 assert.match(stats,/queueDigest\(props,copy\.size\(\)\)/);
 assert.match(stats,/\.damaged-/);
 assert.match(stats,/queueLocked=true/);
 assert.doesNotMatch(stats,/pending\.remove\(pending\.keySet\(\)\.iterator\(\)\.next\(\)\)/);
});

test('V10.54.6: lightweight capture intervals and a single bounded skin publishing queue',()=>{
 const stats=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/PaperStatsSync.java',import.meta.url),'utf8');
 const fallback=readFileSync(new URL('../minecraft-link-paper/src/main/java/id/sscircle/paper/PaperSkinSync.java',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../minecraft-skin-bridge-paper/src/main/java/id/sscircle/skin/SkinPublisher.java',import.meta.url),'utf8');
 const bridgeConfig=readFileSync(new URL('../minecraft-skin-bridge-paper/src/main/resources/config.yml',import.meta.url),'utf8');
 assert.match(stats,/capturePeriodTicks/);
 assert.match(config,/capture-period-ticks: 2/);
 assert.match(fallback,/skin-sync.profile-scan-ticks/);
 assert.match(bridge,/ArrayDeque<UUID> pendingScans/);
 assert.match(bridge,/runTaskTimer\(plugin,this::drainScans,1L,20L\)/);
 assert.match(bridge,/queuedPlayers\.add\(uuid\)/);
 assert.match(bridge,/pauseForLowTps\(\)/);
 assert.match(bridgeConfig,/pause-on-low-tps: true/);
 assert.doesNotMatch(bridge,/index\+\+\*20L/);
});
