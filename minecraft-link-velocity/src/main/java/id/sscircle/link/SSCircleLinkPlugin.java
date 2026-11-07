package id.sscircle.link;

import com.google.inject.Inject;
import com.velocitypowered.api.command.CommandMeta;
import com.velocitypowered.api.command.SimpleCommand;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.plugin.Plugin;
import com.velocitypowered.api.plugin.annotation.DataDirectory;
import com.velocitypowered.api.proxy.Player;
import com.velocitypowered.api.proxy.ProxyServer;
import net.kyori.adventure.text.Component;
import org.slf4j.Logger;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * SSCircle V10.45: Velocity command that sends a server-authenticated
 * identity assertion to Cloudflare. Never trusts a nickname as account proof.
 *
 * Premium supported on a plain online-mode proxy. Mixed-auth/proxy-offline
 * configurations are refused until an explicitly trusted auth adapter ships.
 */
@Plugin(id = "sscirclelink", name = "SSCircle Account Linking", version = "10.45.0",
    description = "Verifies Minecraft identities for SSCircle profiles", authors = {"RinxAsoy"})
public final class SSCircleLinkPlugin {
    private final ProxyServer proxy;
    private final Logger logger;
    private final Path dataDir;
    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(7)).build();
    private final Map<UUID, Long> recentlyRequested = new ConcurrentHashMap<>();
    private volatile String endpoint = "";
    private volatile String sharedSecret = "";

    @Inject
    public SSCircleLinkPlugin(ProxyServer proxy, Logger logger, @DataDirectory Path dataDir) {
        this.proxy = proxy;
        this.logger = logger;
        this.dataDir = dataDir;
    }

    @Subscribe
    public void onInit(ProxyInitializeEvent event) {
        loadConfiguration();
        CommandMeta meta = proxy.getCommandManager().metaBuilder("sscircle").plugin(this).build();
        proxy.getCommandManager().register(meta, new LinkCommand());
        logger.info("SSCircle Link: /sscircle link tersedia; izin identitas diperiksa saat perintah.");
    }

    private void loadConfiguration() {
        try {
            Files.createDirectories(dataDir);
            Path file = dataDir.resolve("link.properties");
            if (Files.notExists(file)) {
                Files.writeString(file, "# SSCircle website URL, wajib HTTPS.\n"
                    + "# Password/secret JANGAN ditulis di file ini.\n"
                    + "endpoint=https://example.pages.dev\n", StandardCharsets.UTF_8);
            }
            Properties properties = new Properties();
            try (var input = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
                properties.load(input);
            }
            String input = properties.getProperty("endpoint", "").trim();
            URI uri = URI.create(input);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                || uri.getUserInfo() != null || uri.getRawQuery() != null
                || uri.getRawFragment() != null || (uri.getPath() != null && !uri.getPath().isEmpty()
                && !"/".equals(uri.getPath()))) {
                throw new IllegalArgumentException("Gunakan URL HTTPS domain tanpa path/query.");
            }
            String value = System.getenv("SSCIRCLE_LINK_SERVER_SECRET");
            if (value == null || value.length() < 32) {
                logger.warn("SSCIRCLE_LINK_SERVER_SECRET belum diatur pada proxy. Linking dinonaktifkan.");
                return;
            }
            endpoint = uri.toString().replaceAll("/+$", "");
            sharedSecret = value;
        } catch (Exception ex) {
            logger.warn("Konfigurasi SSCircle belum valid. Perbaiki plugins/sscirclelink/link.properties.");
        }
    }

    private final class LinkCommand implements SimpleCommand {
        @Override
        public void execute(Invocation invocation) {
            if (!(invocation.source() instanceof Player player)) {
                invocation.source().sendMessage(Component.text("Hanya pemain online yang dapat menghubungkan akun."));
                return;
            }
            String[] args = invocation.arguments();
            if (args.length == 1 && args[0].equalsIgnoreCase("status")) {
                player.sendMessage(Component.text("Status tautan Minecraft ada di Profile SSCircle. Pilih Perbarui status."));
                return;
            }
            if (args.length != 2 || !args[0].equalsIgnoreCase("link")
                || !args[1].matches("SC-[A-Za-z0-9_-]{24}")) {
                player.sendMessage(Component.text("Gunakan /sscircle link <kode dari Profile SSCircle>."));
                return;
            }
            if (sharedSecret.length() < 32 || endpoint.isEmpty()) {
                player.sendMessage(Component.text("Penghubung SSCircle belum diaktifkan pengurus."));
                return;
            }
            final Identity identity = verifyIdentity(player);
            if (identity == null) {
                player.sendMessage(Component.text(
                    "Identitas akun belum dapat diverifikasi. Hubungi pengurus untuk konfigurasi proxy/login."));
                return;
            }
            long now = System.currentTimeMillis();
            Long previous = recentlyRequested.putIfAbsent(player.getUniqueId(), now);
            if (previous != null && now - previous < 6000) {
                player.sendMessage(Component.text("Coba lagi setelah beberapa detik."));
                return;
            }
            recentlyRequested.put(player.getUniqueId(), now);
            String code = args[1];
            player.sendMessage(Component.text("Memeriksa kode SSCircle melalui koneksi aman..."));
            try {
                String json = "{\"code\":\"" + jsonEscape(code)
                    + "\",\"provider\":\"" + jsonEscape(identity.provider())
                    + "\",\"providerId\":\"" + jsonEscape(identity.id())
                    + "\",\"username\":\"" + jsonEscape(player.getUsername())
                    + "\",\"authSource\":\"" + jsonEscape(identity.source()) + "\"}";
                long timestamp = System.currentTimeMillis() / 1000;
                String nonce = UUID.randomUUID().toString();
                String canonical = "POST\n/api/minecraft/link/claim\n" + timestamp + "\n" + nonce + "\n" + json;
                String signature = sign(canonical);
                HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint + "/api/minecraft/link/claim"))
                    .timeout(Duration.ofSeconds(12))
                    .header("Content-Type", "application/json")
                    .header("X-SSC-Timestamp", Long.toString(timestamp))
                    .header("X-SSC-Nonce", nonce)
                    .header("X-SSC-Signature", signature)
                    .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8))
                    .build();
                http.sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
                    .whenComplete((response, error) -> {
                        if (error != null) {
                            player.sendMessage(Component.text(
                                "Koneksi SSCircle terganggu. Periksa jaringan, kemudian coba lagi."));
                        } else if (response.statusCode() == 200 && response.body().contains("\"ok\":true")) {
                            player.sendMessage(Component.text(
                                "Identitas berhasil diperiksa. Buka Profile SSCircle dan konfirmasi akunmu."));
                        } else if (response.statusCode() == 409) {
                            player.sendMessage(Component.text(
                                "Kode sudah digunakan atau akun telah tertaut. Periksa Profile SSCircle."));
                        } else if (response.statusCode() == 404) {
                            player.sendMessage(Component.text(
                                "Kode sudah kedaluwarsa atau tidak ditemukan. Buat kode baru dari Profile."));
                        } else {
                            player.sendMessage(Component.text(
                                "Verifikasi SSCircle belum berhasil (status "
                                + response.statusCode() + "). Hubungi pengurus jika berulang."));
                        }
                    });
            } catch (Exception ex) {
                // Never log the one-time link code, HMAC or raw request.
                logger.warn("Gagal mengirim verifikasi SSCircle dari proxy.");
                player.sendMessage(Component.text("Penghubung SSCircle belum tersedia."));
            }
        }

        @Override
        public boolean hasPermission(Invocation invocation) {
            return true; // Members verify in Cloudflare; no bypass via proxy permissions.
        }
    }

    private Identity verifyIdentity(Player player) {
        // A mixed-auth plugin can force an individual connection into offline
        // mode even while the global proxy setting says online-mode=true.
        if (proxy.getPluginManager().getPlugin("librelogin").isPresent()
            || !proxy.getConfiguration().isOnlineMode()) {
            return null; // Fail closed until LibreLogin verification adapter exists.
        }

        boolean floodgatePresent = proxy.getPluginManager().getPlugin("floodgate").isPresent();
        if (floodgatePresent) {
            try {
                Class<?> apiType = Class.forName("org.geysermc.floodgate.api.FloodgateApi");
                Object api = apiType.getMethod("getInstance").invoke(null);
                boolean isBedrock = (Boolean) apiType
                    .getMethod("isFloodgatePlayer", UUID.class)
                    .invoke(api, player.getUniqueId());
                if (isBedrock) {
                    Object details = apiType.getMethod("getPlayer", UUID.class)
                        .invoke(api, player.getUniqueId());
                    if (details == null) return null;
                    String xuid = String.valueOf(details.getClass().getMethod("getXuid").invoke(details));
                    if (!xuid.matches("[0-9]{10,22}")) return null;
                    return new Identity("bedrock", xuid, "floodgate-xuid");
                }
            } catch (ReflectiveOperationException | LinkageError | SecurityException ex) {
                // Do not classify a possible Bedrock player as Java Premium.
                logger.warn("Floodgate terpasang tetapi identitas tidak dapat dibaca; linking diblokir.");
                return null;
            }
        }
        // Only acceptable on an online-mode Velocity proxy with no mixed-auth
        // plugin capable of overriding per-player authentication.
        return new Identity("java_premium",
            player.getUniqueId().toString().toLowerCase(java.util.Locale.ROOT), "mojang-online");
    }

    private String sign(String message) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(sharedSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
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

    private record Identity(String provider, String id, String source) {}
}
