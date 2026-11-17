package id.sscircle.voice.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import java.io.IOException;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Android microphone foreground service, not a WebView.
 * Keep connected while Activity is backgrounded, subject to OS audio policy.
 * Tokens, pairing code and voice audio stay in memory, never SharedPreferences.
 */
public final class VoiceService extends Service {
    static final String START = "id.sscircle.voice.START";
    static final String STOP = "id.sscircle.voice.STOP";
    static final String CONTROL = "id.sscircle.voice.CONTROL";
    private static final String CHANNEL = "sscircle_voice_active";
    private static final int NOTIFICATION = 2401;
    private static final CopyOnWriteArraySet<Listener> listeners = new CopyOnWriteArraySet<>();

    interface Listener { void onStatus(State snapshot); }
    static final class State {
        final boolean active, muted, deafened, whisper;
        final String message, player, nearby;
        State(boolean active, boolean muted, boolean deafened, boolean whisper,
              String message, String player, String nearby) {
            this.active = active; this.muted = muted; this.deafened = deafened;
            this.whisper = whisper; this.message = message;
            this.player = player; this.nearby = nearby;
        }
    }
    static volatile State state = new State(false, false, false, false,
        "Belum terhubung", "", "Pemain terdekat: -");
    static void addListener(Listener listener) { listeners.add(listener); }
    static void removeListener(Listener listener) { listeners.remove(listener); }
    private static void publish(State snapshot) {
        state = snapshot;
        for (Listener listener : listeners) listener.onStatus(snapshot);
    }

    private final ScheduledExecutorService io = Executors.newSingleThreadScheduledExecutor();
    private final OkHttpClient client = new OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .build();
    private volatile String gateway = "", origin = "", token = "", uuid = "", player = "";
    private volatile boolean active, connected, muted, deafened, whisper;
    private volatile long expiresAt, generation;
    private volatile WebSocket socket;
    private volatile VoiceAudioEngine audio;
    private ScheduledFuture<?> retry, renewal;
    private int reconnectAttempt;
    private PowerManager.WakeLock wakeLock;

    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onCreate() {
        super.onCreate();
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL,
            "SSCircle Voice sedang berjalan", NotificationManager.IMPORTANCE_LOW));
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? "" : intent.getAction();
        if (STOP.equals(action)) {
            endSession(true);
            return START_NOT_STICKY;
        }
        if (CONTROL.equals(action)) {
            control(intent.getStringExtra("command"), intent.getStringExtra("value"));
            return START_NOT_STICKY;
        }
        if (!START.equals(action)) {
            if (!active) stopSelf();
            return START_NOT_STICKY;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            message("Izin mikrofon belum diberikan.");
            stopSelf();
            return START_NOT_STICKY;
        }
        String code = intent.getStringExtra("code");
        if (code == null || !code.matches("[A-HJ-NP-Z2-9]{8}")) {
            message("Kode pairing 8 karakter tidak valid.");
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIFICATION, notification("Memulai Voice"),
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            } else {
                startForeground(NOTIFICATION, notification("Memulai Voice"));
            }
        } catch (RuntimeException exception) {
            message("Gagal memulai layanan mikrofon: " + exception.getClass().getSimpleName());
            stopSelf();
            return START_NOT_STICKY;
        }
        // A new consented pairing replaces the former session on this device.
        endSession(false);
        gateway = "";
        origin = "";
        token = ""; uuid = ""; player = ""; expiresAt = 0;
        muted = false; deafened = false; whisper = false;
        connected = false; reconnectAttempt = 0;
        active = true;
        long now = ++generation;
        acquireWakeLock();
        message("Mengambil konfigurasi Voice dari SSCircle...");
        io.execute(() -> discoverAndPair(now, code));
        return START_NOT_STICKY; // Never restart microphone without a visible, user-approved action.
    }
    private PendingIntent notificationControl(String action, String command, int requestCode) {
        Intent intent = new Intent(this, VoiceService.class).setAction(action);
        if (CONTROL.equals(action)) {
            intent.putExtra("command", command);
            intent.putExtra("value", "");
        }
        // Separate request codes keep Mute/Deafen/Disconnect independent; immutable
        // explicit intents prevent other apps from injecting a different command.
        return PendingIntent.getService(this, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private Notification notification(String content) {
        Intent open = new Intent(this, VoiceActivity.class);
        PendingIntent launch = PendingIntent.getActivity(this, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = new Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("SSCircle Voice" + (active && !player.isEmpty() ? " • " + player : ""))
            .setContentText(content)
            .setContentIntent(launch)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setCategory(Notification.CATEGORY_SERVICE);
        if (active) {
            builder.addAction(android.R.drawable.ic_lock_silent_mode,
                muted ? "Unmute" : "Mute",
                notificationControl(CONTROL, muted ? "unmute" : "mute", 2402));
            builder.addAction(android.R.drawable.ic_lock_silent_mode_off,
                deafened ? "Undeafen" : "Deafen",
                notificationControl(CONTROL, deafened ? "undeafen" : "deafen", 2403));
        }
        builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Disconnect",
            notificationControl(STOP, "", 2404));
        return builder.build();
    }
    private void updateNotification(String content) {
        if (!active) return;
        try {
            getSystemService(NotificationManager.class).notify(NOTIFICATION, notification(content));
        } catch (SecurityException ignored) {
            // Android 13+ notification permission was denied. The microphone service
            // may still run, but user must allow notifications for shade controls.
        }
    }
    private void acquireWakeLock() {
        try {
            PowerManager power = getSystemService(PowerManager.class);
            wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SSCircleVoice:Audio");
            // Maximum lifetime; renewed only with a new user-initiated session.
            wakeLock.acquire(4 * 60 * 60 * 1000L);
        } catch (RuntimeException ignored) { }
    }
    private void releaseWakeLock() {
        if (wakeLock != null) {
            try { if (wakeLock.isHeld()) wakeLock.release(); } catch (RuntimeException ignored) {}
            wakeLock = null;
        }
    }
    private JSONObject post(String endpoint, String bearer, JSONObject body) throws Exception {
        Request.Builder builder = new Request.Builder()
            .url(gateway + endpoint).header("Origin", origin)
            .header("Accept", "application/json");
        if (bearer != null && !bearer.isEmpty())
            builder.header("Authorization", "Bearer " + bearer);
        Request request = builder.post(RequestBody.create(body.toString(),
            MediaType.get("application/json; charset=utf-8"))).build();
        try (Response response = client.newCall(request).execute()) {
            if (response.body() == null) throw new IOException("EMPTY_GATEWAY_RESPONSE");
            JSONObject json = new JSONObject(response.body().string());
            if (!response.isSuccessful())
                throw new IOException(json.optString("error", "HTTP_" + response.code()));
            return json;
        }
    }
    /** Native bootstrap is a fixed HTTPS website origin, not an arbitrary untrusted URL. */
    private static String normalizeHttpsOrigin(String input) {
        try {
            java.net.URI uri = new java.net.URI(input);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null ||
                uri.getUserInfo() != null || uri.getRawQuery() != null ||
                uri.getRawFragment() != null ||
                (uri.getRawPath() != null && !uri.getRawPath().isEmpty() &&
                 !"/".equals(uri.getRawPath()))) return null;
            String host = uri.getHost().toLowerCase(java.util.Locale.ROOT);
            return "https://" + host + (uri.getPort() == -1 ? "" : ":" + uri.getPort());
        } catch (java.net.URISyntaxException | IllegalArgumentException failure) {
            return null;
        }
    }

    // This Preview fallback is a known public SSCircle endpoint, NOT a hidden secret.
    // Never use this fallback for a custom production domain.
    private static final String PREVIEW_SITE = "https://voice-test.sscircle.pages.dev";
    private static final String PREVIEW_GATEWAY =
        "https://sscircle-cross-voice.locdailymar.workers.dev";

    private void discoverAndPair(long gen, String code) {
        String trusted = normalizeHttpsOrigin(getString(R.string.voice_site_origin));
        if (trusted == null) {
            if (valid(gen)) failAndStop("Domain SSCircle pada aplikasi tidak valid.");
            return;
        }
        // Prevent redirect to an unrelated website from returning attacker-controlled
        // gateway URLs. Same-origin redirects can be diagnosed, but not followed blindly.
        OkHttpClient configClient = client.newBuilder()
            .followRedirects(false).followSslRedirects(false).build();
        Request request = new Request.Builder()
            .url(trusted + "/api/voice/mobile-config")
            .header("Cache-Control", "no-store")
            .header("Accept", "application/json")
            .build();
        String issue = "Konfigurasi tidak tersedia.";
        try (Response response = configClient.newCall(request).execute()) {
            if (!valid(gen)) return;
            int status = response.code();
            if (status >= 300 && status < 400) {
                issue = "Website mengalihkan URL konfigurasi (HTTP " + status + ").";
            } else if (response.body() == null) {
                issue = "Respons konfigurasi SSCircle kosong.";
            } else if (!response.isSuccessful()) {
                issue = "Endpoint konfigurasi HTTP " + status + ".";
            } else {
                JSONObject data = new JSONObject(response.body().string());
                String website = normalizeHttpsOrigin(data.optString("origin", ""));
                String worker = normalizeHttpsOrigin(data.optString("gateway", ""));
                // Always use the Origin actually reported by the trusted website.
                if (data.optBoolean("ready", false) && trusted.equals(website) &&
                    worker != null) {
                    gateway = worker;
                    origin = website;
                    message("Gateway SSCircle ditemukan. Memeriksa pairing...");
                    pair(gen, code);
                    return;
                }
                issue = "Gateway belum diatur atau Origin website tidak cocok.";
            }
        } catch (Exception error) {
            issue = "Konfigurasi SSCircle tidak dapat dibaca: " + error.getMessage();
        }
        if (!valid(gen)) return;
        if (PREVIEW_SITE.equals(trusted)) {
            // The existing SSCircle Preview webpage is already configured to use
            // this exact worker. No dependency on a Pages redirect for pairing.
            gateway = PREVIEW_GATEWAY;
            origin = PREVIEW_SITE;
            message("Menghubungkan gateway SSCircle Preview...");
            pair(gen, code);
            return;
        }
        failAndStop(issue + " Periksa /api/voice/mobile-config di domain SSCircle.");
    }

    private void pair(long gen, String code) {
        try {
            JSONObject result = post("/api/pair", null, new JSONObject().put("code", code));
            if (!valid(gen)) return;
            token = result.getString("token");
            expiresAt = System.currentTimeMillis() +
                result.optLong("expiresIn", 900) * 1000L;
            JSONObject account = result.getJSONObject("player");
            uuid = account.getString("uuid");
            player = account.optString("name", "Minecraft");
            reconnectAttempt = 0;
            renewal = io.scheduleWithFixedDelay(() -> renew(gen),
                1, 1, TimeUnit.MINUTES);
            openSocket(gen);
        } catch (Exception error) {
            if (valid(gen)) failAndStop("Pairing gagal: " + error.getMessage());
        }
    }
    private boolean valid(long gen) { return active && generation == gen; }

    private void openSocket(long gen) {
        if (!valid(gen)) return;
        try {
            if (System.currentTimeMillis() >= expiresAt) {
                failAndStop("Sesi habis. Gunakan /voice link lagi."); return;
            }
            message("Menghubungkan WebSocket...");
            JSONObject ticket = post("/api/ticket", token, new JSONObject());
            if (!valid(gen)) return;
            String wsAddress = gateway.replaceFirst("^https:", "wss:") +
                "/ws?ticket=" + ticket.getString("ticket");
            Request request = new Request.Builder().url(wsAddress)
                .header("Origin", origin).build();
            socket = client.newWebSocket(request, new WebSocketListener() {
                @Override public void onOpen(WebSocket ws, Response response) {
                    if (!valid(gen) || socket != ws) { ws.close(1000, "stale"); return; }
                    connected = true;
                    reconnectAttempt = 0;
                    VoiceAudioEngine engine = new VoiceAudioEngine(VoiceService.this,
                        VoiceService.this::sendAudio, error -> {
                            if (valid(gen)) failAndStop("Perangkat audio gagal: " + error);
                        });
                    engine.mute(muted);
                    engine.deafen(deafened);
                    audio = engine;
                    engine.start();
                    message("Terhubung • voice aktif di background");
                    updateNotification("Terhubung sebagai " + player + " • mikrofon aktif");
                }
                @Override public void onMessage(WebSocket ws, String text) {
                    if (!valid(gen) || socket != ws) return;
                    try {
                        JSONObject json = new JSONObject(text);
                        String type = json.optString("t");
                        if ("state".equals(type)) onState(json);
                        else if ("audio".equals(type) || "audioBatch".equals(type)) {
                            VoiceAudioEngine engine = audio;
                            if (engine != null) engine.receive(json);
                        } else if ("error".equals(type)) {
                            message("Gateway: " + json.optString("code", "error"));
                        }
                    } catch (Exception ignored) { }
                }
                @Override public void onClosing(WebSocket ws, int code, String reason) {
                    ws.close(1000, "ack");
                }
                @Override public void onClosed(WebSocket ws, int code, String reason) {
                    retryAfterClose(ws, gen);
                }
                @Override public void onFailure(WebSocket ws, Throwable error, Response response) {
                    retryAfterClose(ws, gen);
                }
            });
        } catch (Exception error) {
            if (!valid(gen)) return;
            if (String.valueOf(error.getMessage()).contains("SESSION_EXPIRED")) {
                failAndStop("Sesi habis. Gunakan /voice link lagi.");
            } else scheduleRetry(gen);
        }
    }
    private void retryAfterClose(WebSocket ws, long gen) {
        if (!valid(gen) || socket != ws) return;
        socket = null;
        connected = false;
        VoiceAudioEngine engine = audio; audio = null;
        if (engine != null) engine.stop();
        scheduleRetry(gen);
    }
    private void scheduleRetry(long gen) {
        if (!valid(gen)) return;
        if (System.currentTimeMillis() >= expiresAt) {
            failAndStop("Sesi habis. Gunakan /voice link lagi."); return;
        }
        long delay = Math.min(30, Math.min(5L << Math.min(reconnectAttempt++, 4), 30));
        message("Koneksi putus. Menyambung ulang dalam " + delay + " dtk...");
        if (retry != null) retry.cancel(false);
        retry = io.schedule(() -> openSocket(gen), delay, TimeUnit.SECONDS);
    }
    private void renew(long gen) {
        if (!valid(gen) || token.isEmpty() ||
            expiresAt - System.currentTimeMillis() > 5 * 60_000L) return;
        try {
            JSONObject value = post("/api/renew", token, new JSONObject());
            if (!valid(gen)) return;
            token = value.getString("token");
            expiresAt = System.currentTimeMillis() +
                value.optLong("expiresIn", 900) * 1000L;
        } catch (Exception error) {
            if (valid(gen) && String.valueOf(error.getMessage()).contains("SESSION_EXPIRED"))
                failAndStop("Sesi habis. Gunakan /voice link lagi.");
            // Transient failures retry at the next minute; no secret is logged.
        }
    }
    private void sendAudio(String data) {
        WebSocket ws = socket;
        if (!active || !connected || muted || ws == null || ws.queueSize() > 32 * 1024) return;
        ws.send(data);
    }
    private void onState(JSONObject event) {
        JSONObject self = event.optJSONObject("self");
        if (self != null) {
            muted = self.optBoolean("muted", muted);
            deafened = self.optBoolean("deafened", deafened);
            whisper = self.optBoolean("whisper", whisper);
            VoiceAudioEngine engine = audio;
            if (engine != null) {
                engine.mute(muted);
                engine.deafen(deafened);
            }
        }
        JSONArray list = event.optJSONArray("nearby");
        StringBuilder summary = new StringBuilder("Pemain terdekat: ");
        if (list == null || list.length() == 0) summary.append("-");
        else {
            for (int i = 0; i < list.length(); i++) {
                JSONObject p = list.optJSONObject(i);
                if (p == null) continue;
                if (i > 0) summary.append(", ");
                summary.append(p.optString("name", "Pemain"));
                summary.append(" (").append(p.optInt("distance", 0)).append(" blok)");
            }
        }
        State previous = state;
        publish(new State(true, muted, deafened, whisper,
            "Terhubung • latar belakang aktif", player, summary.toString()));
        updateNotification("Terhubung sebagai " + player +
            (muted ? " • mikrofon mute" : " • mikrofon aktif") +
            (deafened ? " • deafen" : ""));
    }
    private void control(String command, String value) {
        if (!active || command == null) return;
        if (value == null) value = "";
        switch (command) {
            case "mute": muted = true; break;
            case "unmute": muted = false; break;
            case "deafen": deafened = true; break;
            case "undeafen": deafened = false; break;
            case "whisper": whisper = true; break;
            case "normal": whisper = false; break;
            case "group":
                if (!value.matches("[A-Za-z0-9_-]{1,24}")) return;
                break;
            case "leave-group": break;
            default: return;
        }
        VoiceAudioEngine engine = audio;
        if (engine != null) { engine.mute(muted); engine.deafen(deafened); }
        WebSocket ws = socket;
        if (ws != null && connected) {
            try { ws.send(new JSONObject().put("t", "control").put("action", command)
                .put("value", value).toString()); } catch (Exception ignored) {}
        }
        message("Perintah " + command + " dikirim");
    }
    private void message(String message) {
        publish(new State(active, muted, deafened, whisper,
            message, player, state.nearby));
        if (active) updateNotification(message);
    }
    private void failAndStop(String error) {
        message(error);
        endSession(true);
        publish(new State(false, false, false, false, error, "", "Pemain terdekat: -"));
    }
    private void endSession(boolean finish) {
        active = false; connected = false;
        ++generation;
        if (retry != null) { retry.cancel(false); retry = null; }
        if (renewal != null) { renewal.cancel(false); renewal = null; }
        VoiceAudioEngine engine = audio; audio = null;
        if (engine != null) engine.stop();
        WebSocket ws = socket; socket = null;
        if (ws != null) ws.close(1000, "user disconnect");
        String oldToken = token;
        token = ""; expiresAt = 0;
        releaseWakeLock();
        publish(new State(false, false, false, false,
            finish ? "Voice terputus" : "Memulai koneksi baru...", "",
            "Pemain terdekat: -"));
        if (finish) {
            if (!oldToken.isEmpty()) io.execute(() -> {
                try { post("/api/disconnect", oldToken, new JSONObject()); }
                catch (Exception ignored) { }
                finally { stopSelf(); }
            });
            else stopSelf();
        }
    }
    @Override public void onDestroy() {
        if (active) {
            endSession(false);
            publish(new State(false, false, false, false,
                "Layanan dihentikan oleh sistem.", "", "Pemain terdekat: -"));
        }
        io.shutdownNow();
        client.dispatcher().executorService().shutdown();
        super.onDestroy();
    }
}
