package id.sscircle.voice.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.text.InputFilter;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.net.URI;
import java.util.Locale;

/**
 * Native control screen. Audio belongs exclusively to VoiceService,
 * so navigating to Minecraft does not destroy the microphone.
 */
public final class VoiceActivity extends Activity {
    private static final int MIC_REQUEST = 2001;
    private EditText gateway, origin, pairing, group;
    private TextView status, nearby;
    private Button mute, deafen, whisper;
    private String pendingGateway, pendingOrigin, pendingCode;
    private final VoiceService.Listener statusListener = this::renderState;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        int margin = dp(18);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(margin, margin, margin, margin);
        root.setBackgroundColor(Color.rgb(243, 247, 250));
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(root);
        setContentView(scroll);

        TextView title = label("SSCircle Voice", 27);
        title.setTextColor(Color.rgb(26, 57, 84));
        root.addView(title);
        root.addView(label("Aplikasi pendamping Minecraft Bedrock • Java ↔ Bedrock", 14));
        root.addView(label("1. Konfigurasi gateway (hanya sekali)", 17));

        gateway = input("Gateway Cloudflare: https://...workers.dev");
        gateway.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        gateway.setText(getPreferences(MODE_PRIVATE).getString("gateway", ""));
        root.addView(gateway);

        origin = input("Origin website: https://domain-website");
        origin.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        origin.setText(getPreferences(MODE_PRIVATE).getString("origin", ""));
        root.addView(origin);
        root.addView(label("Alamat Origin harus sama persis dengan VOICE_ORIGIN di Worker Cloudflare.", 12));

        root.addView(label("2. Masuk ke Minecraft Bedrock dan jalankan /voice link", 17));
        pairing = input("Kode pairing 8 karakter");
        pairing.setFilters(new InputFilter[]{new InputFilter.LengthFilter(8)});
        pairing.setAllCaps(true);
        pairing.setSingleLine(true);
        root.addView(pairing);

        Button connect = button("Hubungkan & mulai Voice", root);
        connect.setOnClickListener(v -> connect());

        Button disconnect = button("Putuskan Voice", root);
        disconnect.setOnClickListener(v -> startService(new Intent(this, VoiceService.class)
            .setAction(VoiceService.STOP)));

        status = label("Belum terhubung", 17);
        status.setPadding(0, dp(14), 0, dp(12));
        status.setTextColor(Color.rgb(16, 91, 74));
        root.addView(status);
        root.addView(label("3. Mainkan Minecraft. Voice Activation terus berjalan selama layanan Android aktif.", 14));

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        root.addView(row);
        mute = button("Mute", row);
        deafen = button("Deafen", row);
        whisper = button("Whisper", row);
        mute.setOnClickListener(v -> control(VoiceService.state.muted ? "unmute" : "mute", ""));
        deafen.setOnClickListener(v -> control(VoiceService.state.deafened ? "undeafen" : "deafen", ""));
        whisper.setOnClickListener(v -> control(VoiceService.state.whisper ? "normal" : "whisper", ""));

        group = input("Nama grup (opsional, a-z 0-9 _ -)");
        group.setSingleLine(true);
        root.addView(group);
        Button join = button("Gabung grup", root);
        join.setOnClickListener(v -> {
            String value = group.getText().toString().trim();
            if (!value.matches("[A-Za-z0-9_-]{1,24}")) {
                showError("Nama grup hanya 1–24 huruf/angka, _ atau -.");
                return;
            }
            control("group", value);
        });
        Button leave = button("Keluar grup", root);
        leave.setOnClickListener(v -> control("leave-group", ""));

        nearby = label("Pemain terdekat: -", 14);
        root.addView(nearby);
        root.addView(label("Layanan microphone Android aktif di background dan menampilkan notifikasi. "
            + "Tombol Putuskan Voice menghentikan mikrofon sepenuhnya. "
            + "Audio bisa terganggu oleh panggilan, Bluetooth, atau kebijakan baterai HP.", 12));
    }

    private int dp(int value) {
        return (int)(getResources().getDisplayMetrics().density * value + 0.5f);
    }
    private TextView label(String value, int size) {
        TextView text = new TextView(this);
        text.setText(value);
        text.setTextSize(size);
        text.setTextColor(Color.rgb(59, 68, 78));
        text.setPadding(0, dp(8), 0, dp(8));
        return text;
    }
    private EditText input(String hint) {
        EditText field = new EditText(this);
        field.setHint(hint);
        field.setTextSize(15);
        field.setSingleLine(true);
        field.setPadding(dp(8), dp(8), dp(8), dp(8));
        return field;
    }
    private Button button(String title, LinearLayout parent) {
        Button button = new Button(this);
        button.setText(title);
        button.setTextSize(12);
        parent.addView(button, parent.getOrientation() == LinearLayout.HORIZONTAL
            ? new LinearLayout.LayoutParams(0, dp(55), 1) :
            new LinearLayout.LayoutParams(-1, -2));
        return button;
    }

    private static String httpsOrigin(String raw) {
        try {
            URI uri = URI.create(raw.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null ||
                uri.getRawUserInfo() != null || uri.getRawQuery() != null ||
                uri.getRawFragment() != null ||
                (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath())))
                return null;
            String hostname = uri.getHost().toLowerCase(Locale.ROOT);
            // URI.toString is not used: it may preserve a deceptive path or user-info.
            return "https://" + (hostname.contains(":") ? "[" + hostname + "]" : hostname) +
                (uri.getPort() == -1 ? "" : ":" + uri.getPort());
        } catch (IllegalArgumentException error) {
            return null;
        }
    }
    private void connect() {
        String url = httpsOrigin(gateway.getText().toString());
        String site = httpsOrigin(origin.getText().toString());
        String code = pairing.getText().toString().toUpperCase(Locale.ROOT).trim();
        if (url == null || site == null) {
            showError("Gateway dan website harus memakai URL HTTPS yang valid tanpa path.");
            return;
        }
        if (!code.matches("[A-HJ-NP-Z2-9]{8}")) {
            showError("Masukkan kode /voice link yang valid (8 karakter).");
            return;
        }
        pendingGateway = url;
        pendingOrigin = site;
        pendingCode = code;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIC_REQUEST);
            return;
        }
        startVoice();
    }
    private void startVoice() {
        getPreferences(MODE_PRIVATE).edit()
            .putString("gateway", pendingGateway).putString("origin", pendingOrigin).apply();
        Intent intent = new Intent(this, VoiceService.class)
            .setAction(VoiceService.START)
            .putExtra("gateway", pendingGateway)
            .putExtra("origin", pendingOrigin)
            .putExtra("code", pendingCode);
        try {
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent);
            else startService(intent);
            pairing.setText("");
            showError("Menghubungkan ke SSCircle Voice...");
            if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 2002);
            }
        } catch (RuntimeException error) {
            showError("Tidak bisa mengaktifkan Voice: " + error.getClass().getSimpleName());
        }
    }
    private void showError(String message) { status.setText(message); }
    private void control(String action, String value) {
        if (!VoiceService.state.active) { showError("Hubungkan Voice terlebih dahulu."); return; }
        startService(new Intent(this, VoiceService.class)
            .setAction(VoiceService.CONTROL).putExtra("command", action).putExtra("value", value));
    }
    @Override public void onRequestPermissionsResult(int req, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(req, permissions, grants);
        if (req == MIC_REQUEST) {
            if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) startVoice();
            else showError("Izin mikrofon wajib untuk panggilan Voice. Tidak ada layanan yang dimulai.");
        }
    }
    @Override protected void onStart() {
        super.onStart();
        VoiceService.addListener(statusListener);
        renderState(VoiceService.state);
    }
    @Override protected void onStop() {
        VoiceService.removeListener(statusListener);
        super.onStop();
    }
    private void renderState(VoiceService.State s) {
        runOnUiThread(() -> {
            status.setText(s.message + (s.player.isEmpty() ? "" : " • " + s.player));
            mute.setText(s.muted ? "Unmute" : "Mute");
            deafen.setText(s.deafened ? "Undeafen" : "Deafen");
            whisper.setText(s.whisper ? "Whisper ON" : "Whisper OFF");
            nearby.setText(s.nearby);
        });
    }
}
