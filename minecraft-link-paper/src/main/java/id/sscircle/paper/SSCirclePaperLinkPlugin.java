package id.sscircle.paper;

import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
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
 * Direct Paper linking. The code is only a one-use challenge; the real Java
 * identity must come from the online-mode authenticated server session.
 *
 * Never claim an offline UUID or a display name proves account ownership.
 */
public final class SSCirclePaperLinkPlugin extends JavaPlugin implements CommandExecutor, TabCompleter, Listener {
    private static final int REQUEST_TIMEOUT_SECONDS = 12;
    private static final long COMMAND_COOLDOWN_MS = 6000L;
    private static final String SECRET_ENV = "SSCIRCLE_LINK_SERVER_SECRET";
    private static final String CLAIM_PATH = "/api/minecraft/link/claim";
    private static final String DIAGNOSE_PATH = "/api/minecraft/link/diagnose";
    private static final Pattern RESPONSE_CODE = Pattern.compile("\\\"code\\\"\\s*:\\s*\\\"([A-Z_]{4,40})\\\"");

    private final Map<UUID, Long> lastRequestAt = new ConcurrentHashMap<>();
    private HttpClient http;
    private String endpoint = "";
    private String signingSecret = "";
    private String secretSource = "tidak tersedia";

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
        readSettings();
        if (!Bukkit.getOnlineMode()) {
            getLogger().warning("Server Paper berada dalam offline-mode. Linking diblokir demi keamanan akun.");
            getLogger().warning("Untuk tes Java Premium tanpa proxy, ubah server.properties online-mode=true.");
        }
        getLogger().info("SSCircle Player Sync Paper siap. Gunakan /sscircle status untuk memeriksa konfigurasi.");
    }

    @Override
    public void onDisable() {
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
            sender.sendMessage("SSCircle Player Sync Paper " + getDescription().getVersion());
            sender.sendMessage("Alamat website HTTPS: " +
                (endpoint.isBlank() ? "belum valid - periksa plugins/SSCirclePlayerSync/config.yml" : "terkonfigurasi"));
            sender.sendMessage("Kunci komunikasi website: " +
                (SecretFileStore.isValidSecret(signingSecret) ? "terbaca" :
                "belum terbaca - periksa plugins/SSCirclePlayerSync/server-secret.txt"));
            if (sender.hasPermission("sscircle.admin")) {
                sender.sendMessage("Sumber kunci aktif: " + secretSource);
                sender.sendMessage("File server-secret.txt mengalahkan environment variable Windows bila tersedia.");
            }
            sender.sendMessage("Konfigurasi website: " +
                (hasConnectionSettings() ? "siap (belum menguji koneksi internet)" : "belum lengkap"));
            if (!Bukkit.getOnlineMode()) {
                sender.sendMessage("Autentikasi server: offline-mode, linking ditolak.");
                sender.sendMessage("Jika memakai Java Premium tanpa proxy: set online-mode=true di server.properties, lalu restart Paper.");
            } else if (sender instanceof Player player) {
                Identity identity = identityFor(player);
                sender.sendMessage("Identitas dalam game: " +
                    (identity == null ? "belum dapat diverifikasi" : identity.displayType()));
                if (identity == null) sender.sendMessage("Periksa plugin autentikasi campuran dan Floodgate.");
            } else {
                sender.sendMessage("Autentikasi: online-mode aktif (periksa tiap pemain dalam game).");
            }
            sender.sendMessage("Status akun tertaut tersedia di Profile website SSCircle.");
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
            player.sendMessage("Akun Minecraft tidak bisa diverifikasi. Gunakan Java Premium online-mode atau Floodgate terpercaya.");
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

    private Identity identityFor(Player player) {
        if (!Bukkit.getOnlineMode() || hasUntrustedLoginPlugin()) {
            return null;
        }
        Plugin floodgate = getServer().getPluginManager().getPlugin("floodgate");
        if (floodgate != null && floodgate.isEnabled()) {
            try {
                // Reflection is deliberate: no hard dependency on Floodgate JAR.
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
                getLogger().warning("Floodgate tersedia tetapi bukti XUID tidak terbaca. Linking diblokir.");
                return null; // Do not silently misclassify Bedrock as Java Premium.
            }
        }
        // In a direct online-mode Paper server, Paper authenticates Java
        // usernames/UUIDs through Mojang before a Player enters the world.
        String uuid = player.getUniqueId().toString().toLowerCase(Locale.ROOT);
        return new Identity("java_premium", uuid, "mojang-online", "Java Premium");
    }

    private boolean hasUntrustedLoginPlugin() {
        // No proof that these mixed/offline login plugins authenticated THIS player.
        String[] loginPlugins = {"LibreLogin", "AuthMe", "AuthMeReloaded", "nLogin",
            "FastLogin", "JPremium", "EasyAuth", "OpeNLogin"};
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

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        lastRequestAt.remove(event.getPlayer().getUniqueId());
    }

    private record Identity(String provider, String verifiedId, String authSource, String displayType) {}
}
