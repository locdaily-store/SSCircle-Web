package id.sscircle.paper;

import org.bukkit.Bukkit;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.EventPriority;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerLoginEvent;
import org.bukkit.plugin.RegisteredListener;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.plugin.IllegalPluginAccessException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Direct Paper linking: verified Mojang sessions, Floodgate XUIDs, or
 * authenticated AuthMe local accounts. Offline UUIDs never prove Premium.
 */
public final class SSCirclePaperLinkPlugin extends JavaPlugin implements CommandExecutor, TabCompleter, Listener {
    private static final int REQUEST_TIMEOUT_SECONDS = 12;
    private static final long COMMAND_COOLDOWN_MS = 6000L;
    private static final String SECRET_ENV = "SSCIRCLE_LINK_SERVER_SECRET";
    private static final String CLAIM_PATH = "/api/minecraft/link/claim";
    private static final String DIAGNOSE_PATH = "/api/minecraft/link/diagnose";
    private static final Pattern RESPONSE_CODE = Pattern.compile("\\\"code\\\"\\s*:\\s*\\\"([A-Z_]{4,40})\\\"");

    private final Map<UUID, Long> lastRequestAt = new ConcurrentHashMap<>();
    private final IdentitySessionGuard identitySessions = new IdentitySessionGuard();
    private HttpClient http;
    private String endpoint = "";
    private String signingSecret = "";
    private String secretSource = "tidak tersedia";
    private PaperStatsSync statsSync;
    private PaperIdentitySync identitySync;
    private PaperSyncTelemetry syncTelemetry;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(7))
            .build();
        if (getCommand("sscircle") == null) {
            getLogger().severe("Perintah SSCircle tidak terdaftar. Nonaktifkan plugin.");
            getServer().getPluginManager().disablePlugin(this);
            return;
        }
        getCommand("sscircle").setExecutor(this);
        getCommand("sscircle").setTabCompleter(this);
        getServer().getPluginManager().registerEvents(this, this);
        // Loading a plugin while players are already online must not bypass
        // session binding. The guard is also populated on ordinary joins.
        for (Player online : Bukkit.getOnlinePlayers())
            identitySessions.joined(online.getUniqueId(), online.getName());
        readSettings();
        statsSync = new PaperStatsSync(this,http,this::identityFor,()->endpoint,()->signingSecret);
        statsSync.start();
        // Refresh session proof without waiting for the next expensive stat
        // sampling round. This also replaces stale CRACKED labels after login.
        identitySync=new PaperIdentitySync(this,http,this::identityFor,
            ()->endpoint,()->signingSecret);
        identitySync.start();
        syncTelemetry=new PaperSyncTelemetry(this,statsSync,http,()->endpoint,()->signingSecret);
        syncTelemetry.start();
        if (!Bukkit.getOnlineMode()) {
            if (mixedModeReady()) {
                getLogger().warning("Mode campuran AuthMe siap. Status Premium hanya ditentukan dari bukti sesi FastLogin; Bedrock melalui Floodgate.");
                if (hasConflictingFastLoginPlugins()) {
                    getLogger().warning("FastLogin dan FastLoginPlus aktif bersamaan. Nonaktifkan salah satu; klasifikasi Premium SSCircle ditahan.");
                } else if (fastLoginPlugin() != null) {
                    getLogger().info("Adapter "+fastLoginPlugin().getName()
                        +" siap; bukti Premium diperiksa per sesi melalui getStatus(UUID), tanpa polling Mojang.");
                }
            } else {
                getLogger().warning("Paper offline-mode tanpa adapter AuthMe terverifikasi. Java linking tetap ditolak.");
            }
        }
        getLogger().info("SSCircle Player Sync Paper siap. Gunakan /sscircle status untuk memeriksa konfigurasi.");
    }

    @Override
    public void onDisable() {
        if (statsSync != null) statsSync.stop();
        if (identitySync != null) identitySync.stop();
        identitySessions.clear();
        lastRequestAt.clear();
    }

    private void readSettings() {
        endpoint = "";
        signingSecret = "";
        secretSource = "tidak tersedia";
        try {
            SecretFileStore.ResolvedSecret resolved = SecretFileStore.resolve(
                getDataFolder().toPath(), System.getenv(SECRET_ENV));
            signingSecret = resolved.value();
            secretSource = resolved.source();
            if (resolved.generated()) {
                getLogger().warning("Kunci baru dibuat pada plugins/SSCirclePlayerSync/server-secret.txt.");
                getLogger().warning("Kunci ini HARUS disamakan dengan SSCIRCLE_LINK_SERVER_SECRET Cloudflare.");
            } else {
                getLogger().info("Kunci SSCircle dibaca dari " + secretSource + " (nilai dirahasiakan).");
            }
        } catch (java.io.IOException ex) {
            getLogger().warning("File secret lokal tidak dapat dibaca. Periksa isinya dan izin folder.");
        }
        String configuredUrl = getConfig().getString("endpoint", "").trim();
        try {
            URI uri = URI.create(configuredUrl);
            if (!"https".equalsIgnoreCase(uri.getScheme())
                || uri.getHost() == null || uri.getHost().isBlank()
                || uri.getUserInfo() != null || uri.getRawQuery() != null
                || uri.getRawFragment() != null || uri.getPort() == 0
                || "example.pages.dev".equalsIgnoreCase(uri.getHost())
                || (uri.getPath() != null && !uri.getPath().isBlank()
                    && !"/".equals(uri.getPath()))) {
                getLogger().warning("Alamat website belum valid. Gunakan domain HTTPS tanpa path.");
                return;
            }
            endpoint = uri.toString().replaceAll("/+$", "");
            if (hasConnectionSettings()) {
                getLogger().info("Alamat website dan kunci server terbaca. Koneksi HTTPS belum diuji.");
            } else {
                getLogger().warning("Alamat website sudah valid, tetapi secret masih belum tersedia.");
            }
        } catch (IllegalArgumentException ex) {
            getLogger().warning("Alamat website tidak valid. Periksa plugins/SSCirclePlayerSync/config.yml.");
        }
    }

    // Tab completion suggests safe subcommands, but never one-time link codes.
    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length != 1) return List.of();
        String prefix = args[0].toLowerCase(Locale.ROOT);
        List<String> options = new ArrayList<>(List.of("help", "status"));
        if (sender instanceof Player) options.add("link");
        if (sender.hasPermission("sscircle.admin")) {
            options.add("diagnose");
            options.add("sync");
            options.add("reload");
        }
        return options.stream().filter(option -> option.startsWith(prefix)).sorted().toList();
    }

    private void showHelp(CommandSender sender) {
        sender.sendMessage("SSCircle Player Sync - Pilihan perintah:");
        sender.sendMessage("/sscircle help - Menampilkan panduan");
        sender.sendMessage("/sscircle status - Periksa koneksi dan autentikasi");
        if (sender instanceof Player) {
            sender.sendMessage("/sscircle link <kode> - Hubungkan akun dari Profile website");
        }
        if (sender.hasPermission("sscircle.admin")) {
            sender.sendMessage("/sscircle diagnose - Periksa koneksi HTTPS dan kecocokan secret tanpa kode");
            sender.sendMessage("/sscircle sync - Kirim statistik pemain online sekarang (OP)");
            sender.sendMessage("/sscircle reload - Muat ulang pengaturan website");
        }
        sender.sendMessage("Tekan Tab setelah /sscircle untuk memilih subperintah.");
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0 || (args.length == 1 && args[0].equalsIgnoreCase("help"))) {
            showHelp(sender);
            return true;
        }
        if (args.length == 1 && args[0].equalsIgnoreCase("diagnose")) {
            if (!sender.hasPermission("sscircle.admin")) {
                sender.sendMessage("Hanya pengurus yang boleh menjalankan diagnosis koneksi.");
                return true;
            }
            runDiagnostic(sender);
            return true;
        }
        if (args.length == 1 && args[0].equalsIgnoreCase("sync")) {
            if (!sender.hasPermission("sscircle.admin")) {
                sender.sendMessage("Hanya pengurus yang dapat memicu sinkronisasi.");
                return true;
            }
            if (statsSync == null || !getConfig().getBoolean("stats-sync.enabled",true)) {
                sender.sendMessage("Sinkronisasi statistik belum aktif.");
            } else {
                statsSync.triggerNow();
                sender.sendMessage("Statistik pemain online dimasukkan ke antrean.");
            }
            if(identitySync!=null) {
                identitySync.forceAll();
                sender.sendMessage("Bukti sesi Premium/Non-Premium akan diperiksa ulang secara terpisah.");
            }
            sender.sendMessage("Cek /sscircle status untuk status pengiriman.");
            return true;
        }
        if (args.length == 1 && args[0].equalsIgnoreCase("reload")) {
            if (!sender.hasPermission("sscircle.admin")) {
                sender.sendMessage("Kamu tidak mempunyai izin untuk memuat ulang SSCircle.");
                return true;
            }
            reloadConfig();
            readSettings();
            sender.sendMessage("Konfigurasi dan file secret SSCircle sudah diperiksa ulang.");
            sender.sendMessage("Environment Windows yang berubah tetap membutuhkan restart proses Paper.");
            return true;
        }
        if (args.length == 1 && args[0].equalsIgnoreCase("status")) {
            showReadableStatus(sender);
            return true;
        }

        if (!(sender instanceof Player player)) {
            sender.sendMessage("Perintah linking hanya dapat digunakan pemain yang masuk dalam game.");
            return true;
        }
        if (args.length != 2 || !args[0].equalsIgnoreCase("link")
            || !args[1].matches("SC-[A-Za-z0-9_-]{24}")) {
            player.sendMessage("Gunakan /sscircle link <kode> dari Profile SSCircle, atau /sscircle status.");
            return true;
        }
        if (!hasConnectionSettings()) {
            player.sendMessage("Penghubung SSCircle belum dikonfigurasi oleh pengurus server.");
            return true;
        }

        // Identitas hanya diperoleh dari akun yang benar-benar terautentikasi.
        Identity identity = identityFor(player);
        if (identity == null) {
            player.sendMessage("Identitas belum diverifikasi. Java: masuk AuthMe; Bedrock: pastikan Floodgate aktif. Jalankan /sscircle status.");
            return true;
        }

        long now = System.currentTimeMillis();
        long stored = lastRequestAt.compute(player.getUniqueId(), (key, previous) ->
            previous == null || now - previous >= COMMAND_COOLDOWN_MS ? now : previous);
        if (stored != now) {
            player.sendMessage("Tunggu beberapa detik sebelum memasukkan kode lagi.");
            return true;
        }

        // Keep the code only within this request; never log or persist it.
        String code = args[1];
        String json = "{\"code\":\"" + code
            + "\",\"provider\":\"" + identity.provider()
            + "\",\"providerId\":\"" + identity.verifiedId()
            + "\",\"username\":\"" + jsonEscape(player.getName())
            + "\",\"authSource\":\"" + identity.authSource() + "\"}";
        long timestamp = System.currentTimeMillis() / 1000L;
        String nonce = UUID.randomUUID().toString();

        try {
            String signedText = "POST\n" + CLAIM_PATH + "\n"
                + timestamp + "\n" + nonce + "\n" + json;
            String signature = hmac(signingSecret, signedText);
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(endpoint + CLAIM_PATH))
                .timeout(Duration.ofSeconds(REQUEST_TIMEOUT_SECONDS))
                .header("Content-Type", "application/json")
                .header("X-SSC-Timestamp", Long.toString(timestamp))
                .header("X-SSC-Nonce", nonce)
                .header("X-SSC-Signature", signature)
                .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8))
                .build();

            player.sendMessage("SSCircle sedang memeriksa kode melalui koneksi aman...");
            http.sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
                .whenComplete((response, error) -> {
                    if (!isEnabled()) return;
                    try {
                        // Bukkit player state and messages stay on the main thread.
                        getServer().getScheduler().runTask(this, () ->
                            deliverResult(player.getUniqueId(), response, error));
                    } catch (IllegalPluginAccessException ignored) {
                        // Server is shutting down; no async interaction with Bukkit.
                    }
                });
        } catch (Exception ex) {
            // No secret, code, or request body in logs.
            getLogger().warning("Tidak dapat membuat request verifikasi SSCircle.");
            player.sendMessage("Penghubung SSCircle belum siap. Periksa konfigurasi pengurus.");
        }
        return true;
    }

    // Do not send player identity or a one-time code during diagnosis.
    private void runDiagnostic(CommandSender sender) {
        if (!hasConnectionSettings()) {
            sender.sendMessage("SSCircle: alamat HTTPS atau secret proses Paper belum terkonfigurasi.");
            sender.sendMessage("Gunakan /sscircle status untuk melihat komponen yang belum lengkap.");
            return;
        }
        try {
            String json = "{}";
            long timestamp = System.currentTimeMillis() / 1000L;
            String nonce = UUID.randomUUID().toString();
            String signedText = "POST\n" + DIAGNOSE_PATH + "\n" + timestamp + "\n" + nonce + "\n" + json;
            String signature = hmac(signingSecret, signedText);
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(endpoint + DIAGNOSE_PATH))
                .timeout(Duration.ofSeconds(REQUEST_TIMEOUT_SECONDS))
                .header("Content-Type", "application/json")
                .header("X-SSC-Timestamp", Long.toString(timestamp))
                .header("X-SSC-Nonce", nonce)
                .header("X-SSC-Signature", signature)
                .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8))
                .build();
            sender.sendMessage("SSCircle: memeriksa jalur HTTPS dan signature dari website...");
            http.sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
                .whenComplete((response, error) -> {
                    if (!isEnabled()) return;
                    try {
                        getServer().getScheduler().runTask(this, () -> {
                            if (sender instanceof Player player && !player.isOnline()) return;
                            if (error != null || response == null) {
                                sender.sendMessage("SSCircle: gagal menghubungi website HTTPS. Periksa domain, DNS dan internet.");
                            } else if (response.statusCode() == 200 && "DIAGNOSTIC_OK".equals(safeResponseCode(response))) {
                                sender.sendMessage("SSCircle: sambungan WEBSITE BERHASIL. Secret Paper dan Cloudflare cocok.");
                                sender.sendMessage("Jika link tetap ditolak, buat kode baru lalu periksa status akun di Profile.");
                            } else {
                                sender.sendMessage("SSCircle: diagnosis website HTTP " + response.statusCode()
                                    + ". " + safeFailureReason(response));
                            }
                        });
                    } catch (IllegalPluginAccessException ignored) {
                        // Paper shutdown; do not use Bukkit from the HTTP callback.
                    }
                });
        } catch (Exception ex) {
            getLogger().warning("SSCircle: gagal membangun request diagnosis HTTPS.");
            sender.sendMessage("SSCircle: diagnosis belum dapat dijalankan.");
        }
    }

    private static String safeResponseCode(HttpResponse<String> response) {
        String body = response.body();
        if (body == null || body.length() > 2000) return "";
        Matcher matcher = RESPONSE_CODE.matcher(body);
        if (!matcher.find()) return "";
        String code = matcher.group(1);
        return switch (code) {
            case "DIAGNOSTIC_OK", "CLOCK_SKEW", "SIGNATURE_INVALID", "HEADERS_INVALID",
                "SERVER_SECRET_MISSING", "IDENTITY_INVALID", "MEMBER_NOT_ACCEPTED" -> code;
            default -> "";
        };
    }

    // Only map known safe protocol categories. Never echo arbitrary HTML, URLs,
    // tokens, signatures or response bodies from a proxy/WAF to Minecraft.
    private static String safeFailureReason(HttpResponse<String> response) {
        String code = safeResponseCode(response);
        return switch (code) {
            case "CLOCK_SKEW" -> "Jam PC berbeda lebih dari 90 detik dari website. Sinkronkan waktu Windows.";
            case "SIGNATURE_INVALID" -> "Kunci Paper tidak cocok dengan Cloudflare. Periksa /sscircle status dan samakan server-secret.txt dengan secret Production/Preview.";
            case "HEADERS_INVALID" -> "Header signature/timestamp rusak; periksa versi plugin dan proxy HTTP.";
            case "SERVER_SECRET_MISSING" -> "Secret belum aktif pada deployment Cloudflare yang dituju.";
            case "IDENTITY_INVALID" -> "Identitas pemain tidak diterima oleh backend, bukan masalah kode.";
            case "MEMBER_NOT_ACCEPTED" -> "Akun pendaftar website tidak lagi berstatus Diterima.";
            default -> switch (response.statusCode()) {
                case 401 -> "Autentikasi ditolak tanpa kode SSCircle. Periksa secret dan proteksi Cloudflare.";
                case 403 -> "Akses website ditolak. Periksa Cloudflare Access/WAF atau deployment; belum tentu masalah identitas.";
                case 404 -> "Endpoint tidak ditemukan. Deploy website SSCircle terbaru ke domain yang digunakan plugin.";
                case 503 -> "Layanan SSCircle belum siap pada deployment website.";
                default -> "Website mengembalikan status tidak terduga. Periksa deployment dan log Cloudflare.";
            };
        };
    }

    private void deliverResult(UUID uuid, HttpResponse<String> response, Throwable failure) {
        Player player = Bukkit.getPlayer(uuid);
        if (player == null || !player.isOnline()) return;
        if (failure != null || response == null) {
            player.sendMessage("Tidak bisa menghubungi website SSCircle. Periksa internet dan domain HTTPS.");
            return;
        }
        int status = response.statusCode();
        if (status == 200 && response.body().contains("\"ok\":true")) {
            player.sendMessage("Akun Minecraft sudah diperiksa! Kembali ke Profile SSCircle untuk konfirmasi.");
        } else if (status == 404 || status == 410) {
            player.sendMessage("Kode tidak ditemukan atau kedaluwarsa. Buat kode baru di Profile.");
        } else if (status == 409) {
            player.sendMessage("Kode sudah digunakan atau identitas sudah ditautkan. Periksa Profile.");
        } else if (status == 401 || status == 403) {
            player.sendMessage("Verifikasi ditolak (HTTP " + status + "). " + safeFailureReason(response));
            player.sendMessage("OP dapat menjalankan /sscircle diagnose tanpa menggunakan kode baru.");
        } else if (status == 503) {
            player.sendMessage("Fitur linking website belum diaktifkan. Hubungi pengurus SSCircle.");
        } else {
            player.sendMessage("Linking belum berhasil (status " + status + "). Coba lagi atau hubungi pengurus.");
        }
    }

    // Grouped, coloured, short diagnostics. Avoid raw secrets, UUIDs or login
    // tokens. Every value is sent as a component to prevent formatting injection.
    private void statusHeading(CommandSender sender,String title) {
        sender.sendMessage(Component.text("──────── ",NamedTextColor.DARK_GRAY)
            .append(Component.text(title,NamedTextColor.AQUA)
                .decorate(TextDecoration.BOLD))
            .append(Component.text(" ────────",NamedTextColor.DARK_GRAY)));
    }
    private void statusSection(CommandSender sender,String title) {
        sender.sendMessage(Component.text("◆ "+title,NamedTextColor.GOLD)
            .decorate(TextDecoration.BOLD));
    }
    private void statusItem(CommandSender sender,String title,String value,NamedTextColor color){
        sender.sendMessage(Component.text("  "+title+": ",NamedTextColor.GRAY)
            .append(Component.text(value,color)));
    }
    private void statusHint(CommandSender sender,String message,NamedTextColor color){
        sender.sendMessage(Component.text("  • "+message,color));
    }

    private void showReadableStatus(CommandSender sender){
        boolean operator=sender.hasPermission("sscircle.admin");
        statusHeading(sender,"SSCircle "+getDescription().getVersion());
        statusSection(sender,"SERVER & WEBSITE");
        statusItem(sender,"Mode server",Bukkit.getOnlineMode()?"Online (Mojang)":
            "Offline (AuthMe + FastLoginPlus)",
            Bukkit.getOnlineMode()?NamedTextColor.GREEN:NamedTextColor.YELLOW);
        statusItem(sender,"Web SSCircle",endpoint.isBlank()?"URL belum benar":
            "URL HTTPS terisi (belum tentu online)",
            endpoint.isBlank()?NamedTextColor.RED:NamedTextColor.GREEN);
        statusItem(sender,"Kunci aman",SecretFileStore.isValidSecret(signingSecret)
            ?"Ada (nilai disembunyikan)":"Belum valid",
            SecretFileStore.isValidSecret(signingSecret)
                ?NamedTextColor.GREEN:NamedTextColor.RED);
        if(!Bukkit.getOnlineMode()){
            statusItem(sender,"AuthMe",authMePlugin()==null?"Tidak aktif":"Terpasang",
                authMePlugin()==null?NamedTextColor.RED:NamedTextColor.GREEN);
            boolean packet=getServer().getPluginManager().isPluginEnabled("packetevents")
                ||getServer().getPluginManager().isPluginEnabled("PacketEvents");
            statusItem(sender,"PacketEvents",packet?"Aktif":"Tidak aktif",
                packet?NamedTextColor.GREEN:NamedTextColor.RED);
            boolean protocol=getServer().getPluginManager().isPluginEnabled("ProtocolLib");
            statusItem(sender,"ProtocolLib",protocol?"Aktif":"Tidak aktif",
                protocol?NamedTextColor.GREEN:NamedTextColor.RED);
            // Paper warns that legacy PlayerLoginEvent listeners can disable
            // configuration-phase re-authentication. Identify that condition
            // without claiming it conclusively caused this player's failure.
            if(operator&&protocol&&hasLegacyProtocolLibLoginListener())
                statusHint(sender,
                    "ProtocolLib memakai PlayerLoginEvent: fitur konfigurasi login Paper berpotensi terganggu.",
                    NamedTextColor.YELLOW);
            Plugin adapter=fastLoginPlugin();
            statusItem(sender,"FastLogin adapter",hasConflictingFastLoginPlugins()
                ?"KONFLIK: dua plugin terpasang":
                adapter==null?"Tidak terdeteksi":
                adapter.getName()+" "+adapter.getDescription().getVersion(),
                adapter!=null?NamedTextColor.GREEN:NamedTextColor.RED);
            if(!mixedModeReady())
                statusHint(sender,"Mode campuran belum siap. Cek config, AuthMe dan PacketEvents.",
                    NamedTextColor.RED);
        }
        if(sender instanceof Player player){
            statusSection(sender,"AKUN & BUKTI LOGIN");
            if(isVerifiedBedrock(player)){
                statusItem(sender,"Jenis", "Bedrock - Floodgate XUID",NamedTextColor.GREEN);
            }else if(Bukkit.getOnlineMode()){
                statusItem(sender,"Jenis","Java Premium (diverifikasi server online-mode)",
                    NamedTextColor.GREEN);
            }else{
                boolean authenticated=AuthMeSessionBridge.isAuthenticated(player,authMePlugin());
                statusItem(sender,"Autentikasi AuthMe",authenticated?"Sudah masuk":"Belum diverifikasi",
                    authenticated?NamedTextColor.GREEN:NamedTextColor.RED);
                FastLoginSessionBridge.Probe probe=FastLoginSessionBridge.inspect(
                    player,fastLoginPlugin());
                statusItem(sender,"Sesi FastLoginPlus",sessionStatusLabel(probe),
                    probe.status()==FastLoginSessionBridge.Status.PREMIUM
                        ?NamedTextColor.GREEN:NamedTextColor.YELLOW);
                statusHint(sender,sessionHelpText(probe),NamedTextColor.YELLOW);
                String localId=AuthMeAccountId.fromPlayerName(player.getName());
                IdentitySessionGuard.State guard=identitySessions.check(
                    player.getUniqueId(),player.getName(),localId);
                statusItem(sender,"Keamanan sesi",guard==IdentitySessionGuard.State.OK
                    ?"Aman":guard.name()+" (link ditahan)",
                    guard==IdentitySessionGuard.State.OK
                        ?NamedTextColor.GREEN:NamedTextColor.RED);
            }
            statusSection(sender,"PENGIRIMAN KE WEBSITE");
            statusItem(sender,"Bukti jenis Minecraft",identitySync==null
                ?"Belum aktif":identitySync.statusFor(player),NamedTextColor.YELLOW);
        }
        if(!(sender instanceof Player))
            statusHint(sender,
                "Console tidak menampilkan identitas pemain. Jalankan /sscircle status dari chat Minecraft.",
                NamedTextColor.YELLOW);
        statusSection(sender,"STATISTIK");
        boolean enabled=getConfig().getBoolean("stats-sync.enabled",true);
        statusItem(sender,"Sinkronisasi",enabled?"Aktif":"Nonaktif",
            enabled?NamedTextColor.GREEN:NamedTextColor.YELLOW);
        if(operator){
            statusItem(sender,"Antrean",statsSync==null?"Tidak aktif":
                statsSync.pendingCount()+" akun",NamedTextColor.YELLOW);
            statusItem(sender,"Hasil statistik",statsSync==null?"Tidak ada":
                statsSync.deliveryStatus(),NamedTextColor.GRAY);
            statusItem(sender,"Hasil bukti sesi",identitySync==null?"Tidak ada":
                identitySync.deliveryStatus(),NamedTextColor.GRAY);
            if(syncTelemetry!=null)
                statusItem(sender,"Monitoring",syncTelemetry.status(),NamedTextColor.GRAY);
            statusItem(sender,"Sumber kunci",secretSource,NamedTextColor.GRAY);
            Plugin adapter=fastLoginPlugin();
            if(adapter instanceof JavaPlugin javaAdapter&&!Bukkit.getOnlineMode()){
                statusItem(sender,"FLP autoLogin",
                    javaAdapter.getConfig().getBoolean("autoLogin",true)
                        ?"Aktif":"Nonaktif",NamedTextColor.GRAY);
                statusItem(sender,"FLP autoRegister",
                    javaAdapter.getConfig().getBoolean("autoRegister",true)
                        ?"Aktif":"Nonaktif",NamedTextColor.GRAY);
                statusItem(sender,"FLP premiumUuid",
                    javaAdapter.getConfig().getBoolean("premiumUuid",true)
                        ?"Aktif (jangan ubah tanpa backup)":"Nonaktif",
                    NamedTextColor.GRAY);
                statusItem(sender,"FLP offline retry",
                    javaAdapter.getConfig().getBoolean("secondAttemptCracked",false)
                        ?"Aktif":"Nonaktif",NamedTextColor.GRAY);
            }
        }
        statusSection(sender,"LANGKAH BERIKUT");
        statusHint(sender,"Bila FastLoginPlus menunjukkan OFFLINE, periksa login Premium",
            NamedTextColor.AQUA);
        statusHint(sender,"di FastLoginPlus/ProtocolLib, bukan mengubah label secara paksa.",
            NamedTextColor.AQUA);
        if(operator)
            statusHint(sender,"OP: /sscircle sync lalu /sscircle diagnose jika web gagal.",
                NamedTextColor.AQUA);
        statusHint(sender,"Status tautan akun: lihat Profile SSCircle.",NamedTextColor.GRAY);
    }

    private boolean hasLegacyProtocolLibLoginListener(){
        for(RegisteredListener listener:
                PlayerLoginEvent.getHandlerList().getRegisteredListeners()){
            if("ProtocolLib".equalsIgnoreCase(listener.getPlugin().getName()))
                return true;
        }
        return false;
    }

    static String sessionStatusLabel(FastLoginSessionBridge.Probe probe){
        return switch(probe.reason()){
            case PREMIUM_VERIFIED -> "PREMIUM - sesi terverifikasi";
            case OFFLINE_SESSION -> "OFFLINE - bukan bukti lisensi Non-Premium";
            case SESSION_UNKNOWN -> "BELUM DIKETAHUI - tunggu autentikasi";
            case NO_PLUGIN,PLUGIN_DISABLED -> "PLUGIN TIDAK AKTIF";
            case ADAPTER_INCOMPATIBLE -> "API TIDAK KOMPATIBEL";
            case API_FAILED -> "GAGAL MEMBACA API";
            case NO_PLAYER -> "TIDAK ADA SESI PEMAIN";
        };
    }
    static String sessionHelpText(FastLoginSessionBridge.Probe probe){
        return switch(probe.reason()){
            case PREMIUM_VERIFIED -> "Koneksi ini sudah lolos pemeriksaan Premium.";
            case OFFLINE_SESSION -> "Koneksi ini memakai login offline. Jika akun original, coba relog dari launcher resmi dan cek log FastLoginPlus.";
            case SESSION_UNKNOWN -> "Belum ada hasil sesi. Periksa plugin, login AuthMe, lalu reconnect.";
            case NO_PLUGIN,PLUGIN_DISABLED -> "Pasang satu FastLoginPlus yang cocok pada server Paper ini.";
            case ADAPTER_INCOMPATIBLE -> "Versi/fork FastLoginPlus tidak cocok dengan API getStatus(UUID).";
            case API_FAILED -> "Pemeriksaan FastLoginPlus gagal. Lihat console server.";
            case NO_PLAYER -> "Hanya pemain online yang mempunyai bukti sesi.";
        };
    }

    private boolean isVerifiedBedrock(Player player) {
        Plugin floodgate = getServer().getPluginManager().getPlugin("floodgate");
        if (floodgate == null || !floodgate.isEnabled()) return false;
        try {
            Class<?> type = floodgate.getClass().getClassLoader()
                .loadClass("org.geysermc.floodgate.api.FloodgateApi");
            Object api = type.getMethod("getInstance").invoke(null);
            return Boolean.TRUE.equals(type.getMethod("isFloodgatePlayer",UUID.class)
                .invoke(api,player.getUniqueId()));
        } catch (ReflectiveOperationException | LinkageError | SecurityException exception) {
            return false;
        }
    }

    private Identity identityFor(Player player) {
        if (hasUntrustedLoginPlugin()) return null;
        // Floodgate identity is independently authenticated via its XUID API.
        // Inspect FIRST even on an offline-mode server; never mistake Bedrock for Java.
        Plugin floodgate = getServer().getPluginManager().getPlugin("floodgate");
        if (floodgate != null && floodgate.isEnabled()) {
            try {
                Class<?> apiType = floodgate.getClass().getClassLoader()
                    .loadClass("org.geysermc.floodgate.api.FloodgateApi");
                Object api = apiType.getMethod("getInstance").invoke(null);
                boolean bedrock = (Boolean) apiType
                    .getMethod("isFloodgatePlayer", UUID.class)
                    .invoke(api, player.getUniqueId());
                if (bedrock) {
                    Object details = apiType.getMethod("getPlayer", UUID.class)
                        .invoke(api, player.getUniqueId());
                    if (details == null) return null;
                    String xuid = String.valueOf(details.getClass().getMethod("getXuid").invoke(details));
                    if (!xuid.matches("[0-9]{10,22}")) return null;
                    return new Identity("bedrock", xuid, "floodgate-xuid", "Bedrock (Floodgate)");
                }
            } catch (ReflectiveOperationException | LinkageError | SecurityException ex) {
                getLogger().warning("Floodgate aktif tetapi XUID tidak bisa diverifikasi. Linking ditolak.");
                return null; // Do not silently misclassify Bedrock as Java Premium.
            }
        }
        Plugin authMe = authMePlugin();
        if (!Bukkit.getOnlineMode()) {
            // Offline UUID and nickname NEVER certify Mojang Premium identity.
            // AuthMe API must report a real authenticated (non-unrestricted) account.
            if (!mixedModeReady() || authMe == null
                || !AuthMeSessionBridge.isAuthenticated(player, authMe)) return null;
            String accountId = AuthMeAccountId.fromPlayerName(player.getName());
            if (accountId == null) return null;
            // AuthMe authenticates this local account, but a mid-session name
            // change or two simultaneous same-name sessions is ambiguous.
            // Deny BOTH linking and stats rather than silently moving identity.
            if (identitySessions.check(player.getUniqueId(),player.getName(),accountId)
                    != IdentitySessionGuard.State.OK) return null;
            // Trust only the per-session status returned by the optional FastLogin
            // adapter, not the username/Mojang name availability. Keep the AuthMe
            // identity stable across upgrades, inventory and existing statistics.
            FastLoginSessionBridge.Status loginStatus =
                FastLoginSessionBridge.read(player, fastLoginPlugin());
            String source = switch (loginStatus) {
                case PREMIUM -> "fastlogin-premium";
                case CRACKED -> "fastlogin-cracked";
                default -> "authme-session";
            };
            String type = switch (loginStatus) {
                case PREMIUM -> "Minecraft Java Premium (terverifikasi FastLogin)";
                case CRACKED -> "Minecraft Java (sesi offline, Premium belum terverifikasi)";
                default -> "Minecraft Java (status Premium belum terverifikasi)";
            };
            return new Identity("java_offline", accountId, source, type);
        }
        // For ordinary direct online-mode servers, Paper/Mojang verify the UUID.
        // If AuthMe is installed, it must also confirm the player's login.
        if (authMe != null && !AuthMeSessionBridge.isAuthenticated(player, authMe)) return null;
        String uuid = player.getUniqueId().toString().toLowerCase(Locale.ROOT);
        return new Identity("java_premium", uuid, "mojang-online", "Java Premium (Mojang)");
    }

    private Plugin authMePlugin() {
        Plugin plugin = getServer().getPluginManager().getPlugin("AuthMe");
        if (plugin == null || !plugin.isEnabled())
            plugin = getServer().getPluginManager().getPlugin("AuthMeReloaded");
        return plugin != null && plugin.isEnabled() ? plugin : null;
    }

    private boolean hasConflictingFastLoginPlugins() {
        return getServer().getPluginManager().isPluginEnabled("FastLogin")
            && getServer().getPluginManager().isPluginEnabled("FastLoginPlus");
    }

    private Plugin fastLoginPlugin() {
        // Never choose an arbitrary adapter when both incompatible login
        // providers are installed. AuthMe sessions remain valid, but edition
        // detection must fail closed to UNKNOWN instead of guessing.
        if (hasConflictingFastLoginPlugins()) return null;
        Plugin plugin = getServer().getPluginManager().getPlugin("FastLogin");
        if (plugin == null || !plugin.isEnabled())
            plugin = getServer().getPluginManager().getPlugin("FastLoginPlus");
        return plugin != null && plugin.isEnabled() ? plugin : null;
    }

    private boolean mixedModeReady() {
        if (Bukkit.getOnlineMode()
            || !getConfig().getBoolean("authme-mixed-mode.enabled", false)
            || authMePlugin() == null
            || hasUntrustedLoginPlugin()) return false;
        return getServer().getPluginManager().isPluginEnabled("packetevents")
            || getServer().getPluginManager().isPluginEnabled("PacketEvents");
    }

    private boolean hasUntrustedLoginPlugin() {
        // AuthMe remains the trusted login authority; FastLogin is only an optional,
        // read-only session adapter. Other login replacements fail closed.
        String[] loginPlugins = {"LibreLogin", "nLogin", "JPremium",
            "EasyAuth", "OpeNLogin"};
        for (String name : loginPlugins) {
            if (getServer().getPluginManager().isPluginEnabled(name)) return true;
        }
        return false;
    }

    private boolean hasConnectionSettings() {
        return !endpoint.isEmpty() && SecretFileStore.isValidSecret(signingSecret);
    }

    private static String hmac(String secret, String message) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return Base64.getUrlEncoder().withoutPadding()
            .encodeToString(mac.doFinal(message.getBytes(StandardCharsets.UTF_8)));
    }

    private static String jsonEscape(String value) {
        StringBuilder result = new StringBuilder();
        for (char character : value.toCharArray()) {
            if (character == '"' || character == '\\') result.append('\\').append(character);
            else if (character < 32) result.append(String.format("\\u%04x", (int) character));
            else result.append(character);
        }
        return result.toString();
    }

    // Bind the displayed login identity at the start of the live connection.
    // Never infer ownership from the offline-mode UUID alone.
    @EventHandler(priority=EventPriority.LOWEST)
    public void onJoin(PlayerJoinEvent event) {
        identitySessions.joined(event.getPlayer().getUniqueId(),event.getPlayer().getName());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        identitySessions.left(event.getPlayer().getUniqueId());
        lastRequestAt.remove(event.getPlayer().getUniqueId());
    }

    record Identity(String provider, String verifiedId, String authSource, String displayType) {}
}
