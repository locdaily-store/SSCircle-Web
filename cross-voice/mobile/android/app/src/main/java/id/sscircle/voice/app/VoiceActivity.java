package id.sscircle.voice.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.text.InputFilter;
import android.text.InputType;
import android.view.Gravity;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.Locale;

/**
 * Matches SSCircle Voice web: dark navy canvas, glassy panels, soft cyan accent.
 * Gateway + website origin are discovered by VoiceService; no manual URL fields.
 */
public final class VoiceActivity extends Activity {
    private static final int PERMISSION_MIC = 2001;
    private static final int BG = Color.rgb(12,24,39), PANEL = Color.rgb(20,38,58);
    private static final int PANEL_ALT = Color.rgb(24,45,67), STROKE = Color.rgb(53,83,110);
    private static final int TEXT = Color.rgb(244,247,255), MUTED = Color.rgb(163,185,204);
    private static final int ACCENT = Color.rgb(189,229,252), BLUE = Color.rgb(124,196,242);
    private EditText pairing, group;
    private TextView status, nearby, account, connected;
    private Button mute, deafen, whisper, connect;
    private String pendingCode = "";
    private final VoiceService.Listener listener = this::render;

    private int dp(int v) { return (int)(getResources().getDisplayMetrics().density*v+.5f); }

    private GradientDrawable background(int fill, int radius, int border) {
        GradientDrawable b = new GradientDrawable();
        b.setColor(fill);
        b.setCornerRadius(dp(radius));
        if (border != 0) b.setStroke(dp(1), border);
        return b;
    }
    private TextView text(String value, int size, int color, boolean bold) {
        TextView t=new TextView(this);
        t.setText(value); t.setTextSize(size); t.setTextColor(color);
        if(bold)t.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
        t.setIncludeFontPadding(true);
        return t;
    }
    private LinearLayout vertical() {
        LinearLayout l=new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }
    private void line(LinearLayout parent, TextView child, int top, int bottom) {
        LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-1,-2);
        params.setMargins(0,dp(top),0,dp(bottom));parent.addView(child,params);
    }
    private LinearLayout card(LinearLayout parent) {
        LinearLayout c=vertical(); c.setPadding(dp(18),dp(18),dp(18),dp(18));
        c.setBackground(background(PANEL,18,STROKE));
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);
        p.bottomMargin=dp(16);parent.addView(c,p);return c;
    }
    private EditText input(String hint) {
        EditText e=new EditText(this);
        e.setHint(hint);e.setSingleLine(true);e.setTextSize(16);
        e.setTextColor(TEXT);e.setHintTextColor(MUTED);
        e.setPadding(dp(14),dp(12),dp(14),dp(12));
        e.setBackground(background(PANEL_ALT,11,STROKE));
        return e;
    }
    private Button button(String label, boolean primary) {
        Button b=new Button(this);
        b.setText(label);b.setAllCaps(false);b.setTextSize(13);
        b.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
        b.setTextColor(primary?BG:TEXT);
        b.setBackground(background(primary?ACCENT:PANEL_ALT,11,primary?0:STROKE));
        b.setPadding(dp(8),dp(11),dp(8),dp(11));
        b.setMinHeight(dp(48));return b;
    }
    private void addButton(LinearLayout parent, Button b, int top) {
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,dp(52));
        p.topMargin=dp(top);parent.addView(b,p);
    }
    private void addColumnButton(LinearLayout row, Button b) {
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(52),1f);
        p.setMargins(dp(3),0,dp(3),0);row.addView(b,p);
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        ScrollView scroller=new ScrollView(this);
        scroller.setFillViewport(true);scroller.setBackgroundColor(BG);
        LinearLayout root=vertical();
        root.setPadding(dp(18),dp(22),dp(18),dp(30));
        scroller.addView(root);setContentView(scroller);

        LinearLayout hero=new LinearLayout(this);
        hero.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams heroParam=new LinearLayout.LayoutParams(-1,-2);
        heroParam.bottomMargin=dp(20);root.addView(hero,heroParam);
        ImageView logo=new ImageView(this);
        logo.setImageResource(R.drawable.sscircle_voice_logo);
        logo.setContentDescription("Logo SSCircle Server");
        hero.addView(logo,new LinearLayout.LayoutParams(dp(64),dp(64)));
        LinearLayout heroTitles=vertical();
        heroTitles.setPadding(dp(13),0,0,0);
        hero.addView(heroTitles,new LinearLayout.LayoutParams(0,-2,1));
        line(heroTitles,text("VOICE / CROSS-PLATFORM",10,BLUE,true),0,3);
        line(heroTitles,text("SSCircle Voice",25,TEXT,true),0,3);
        line(heroTitles,text("Java + Bedrock • Voice Chat",12,MUTED,false),0,0);

        LinearLayout network=card(root);
        network.setBackground(background(PANEL_ALT,14,STROKE));
        line(network,text("●  SSCIRCLE NETWORK",11,BLUE,true),0,5);
        connected=text("Konfigurasi otomatis dari SSCircle",13,TEXT,true);
        network.addView(connected);

        LinearLayout linking=card(root);
        line(linking,text("01 / PAIRING",11,BLUE,true),0,9);
        line(linking,text("Hubungkan akun Minecraft",21,TEXT,true),0,8);
        line(linking,text("Masuk server Bedrock, jalankan /voice link, lalu masukkan kode 8 karakter.",14,MUTED,false),0,15);
        pairing=input("KODE PAIRING");
        pairing.setFilters(new InputFilter[]{new InputFilter.LengthFilter(8),
            (source,start,end,dest,dstart,dend) ->
                source.subSequence(start,end).toString().toUpperCase(Locale.ROOT)
                    .replaceAll("[^A-HJ-NP-Z2-9]","")});
        pairing.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        linking.addView(pairing,new LinearLayout.LayoutParams(-1,dp(54)));
        connect=button("Hubungkan ke Voice",true);
        addButton(linking,connect,11);
        connect.setOnClickListener(v->startPair());
        line(linking,text("Gateway dan Origin terdeteksi otomatis. Kode berlaku 2 menit.",12,MUTED,false),11,0);

        LinearLayout room=card(root);
        line(room,text("02 / VOICE ROOM",11,BLUE,true),0,9);
        line(room,text("Live Voice Control",20,TEXT,true),0,7);
        account=text("Minecraft belum ditautkan",13,MUTED,false);line(room,account,0,5);
        status=text("Voice tidak aktif",14,TEXT,false);line(room,status,0,14);
        LinearLayout row1=new LinearLayout(this);row1.setOrientation(LinearLayout.HORIZONTAL);
        room.addView(row1,new LinearLayout.LayoutParams(-1,dp(52)));
        mute=button("Mute",false);deafen=button("Deafen",false);
        addColumnButton(row1,mute);addColumnButton(row1,deafen);
        LinearLayout row2=new LinearLayout(this);row2.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams second=new LinearLayout.LayoutParams(-1,dp(52));
        second.topMargin=dp(8);room.addView(row2,second);
        whisper=button("Whisper OFF",false);
        addColumnButton(row2,whisper);
        Button disconnect=button("Disconnect",false);addColumnButton(row2,disconnect);
        mute.setOnClickListener(v->control(VoiceService.state.muted?"unmute":"mute",""));
        deafen.setOnClickListener(v->control(VoiceService.state.deafened?"undeafen":"deafen",""));
        whisper.setOnClickListener(v->control(VoiceService.state.whisper?"normal":"whisper",""));
        disconnect.setOnClickListener(v->startService(
            new Intent(this,VoiceService.class).setAction(VoiceService.STOP)));

        LinearLayout groupCard=card(root);
        line(groupCard,text("03 / MODE SUARA",11,BLUE,true),0,10);
        line(groupCard,text("Proximity & Group",19,TEXT,true),0,5);
        line(groupCard,text("Proximity aktif otomatis. Gunakan grup untuk kanal bersama.",13,MUTED,false),0,11);
        group=input("Nama grup (opsional)");
        groupCard.addView(group,new LinearLayout.LayoutParams(-1,dp(50)));
        LinearLayout groupRow=new LinearLayout(this);groupRow.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams gp=new LinearLayout.LayoutParams(-1,dp(52));
        gp.topMargin=dp(10);groupCard.addView(groupRow,gp);
        Button join=button("Gabung grup",true),leave=button("Keluar grup",false);
        addColumnButton(groupRow,join);addColumnButton(groupRow,leave);
        join.setOnClickListener(v->{
            String value=group.getText().toString().trim();
            if(!value.matches("[A-Za-z0-9_-]{1,24}")){
                status.setText("Nama grup: 1–24 huruf, angka, _ atau -");return;
            }
            control("group",value);
        });
        leave.setOnClickListener(v->control("leave-group",""));

        LinearLayout heard=card(root);
        line(heard,text("PEMAIN YANG TERDENGAR",11,BLUE,true),0,8);
        nearby=text("Belum ada pemain dalam jangkauan.",14,TEXT,false);
        line(heard,nearby,0,0);
        line(root,text("BACKGROUND VOICE  •  Saat Minecraft dibuka, tarik panel notifikasi Android dari atas layar untuk Mute, Deafen, atau Disconnect tanpa kembali ke aplikasi. Aktifkan izin notifikasi (Android 13+) agar tombol tampil.",12,MUTED,false),0,14);
    }
    private void startPair() {
        String code=pairing.getText().toString().trim().toUpperCase(Locale.ROOT);
        if(!code.matches("[A-HJ-NP-Z2-9]{8}")) {
            status.setText("Masukkan kode 8 karakter dari /voice link");return;
        }
        pendingCode=code;
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},PERMISSION_MIC);
            return;
        }
        launch();
    }
    private void launch() {
        try {
            Intent intent=new Intent(this,VoiceService.class).setAction(VoiceService.START)
                .putExtra("code",pendingCode);
            if(Build.VERSION.SDK_INT>=26) startForegroundService(intent);
            else startService(intent);
            // Keep the one-time code visible if network discovery fails.
            // Clear only after pairing has returned a Minecraft player account.
            status.setText("Mencari gateway SSCircle Production...");
            if(Build.VERSION.SDK_INT>=33 &&
               checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},2002);
        } catch(RuntimeException error) {
            status.setText("Tidak bisa memulai layanan: "+error.getClass().getSimpleName());
        }
    }
    private void control(String action,String value) {
        if(!VoiceService.state.active) {status.setText("Hubungkan Voice terlebih dahulu.");return;}
        startService(new Intent(this,VoiceService.class).setAction(VoiceService.CONTROL)
            .putExtra("command",action).putExtra("value",value));
    }
    @Override public void onRequestPermissionsResult(int request,String[] perms,int[] grants) {
        super.onRequestPermissionsResult(request,perms,grants);
        if(request==PERMISSION_MIC){
            if(grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED)launch();
            else status.setText("Izin mikrofon diperlukan untuk Voice.");
        }
    }
    @Override protected void onStart() {
        super.onStart();
        VoiceService.addListener(listener);render(VoiceService.state);
    }
    @Override protected void onStop() {
        VoiceService.removeListener(listener);super.onStop();
    }
    private void render(VoiceService.State s) {
        runOnUiThread(()->{
            if(status==null)return;
            status.setText(s.message);
            account.setText(s.player.isEmpty()?"Minecraft belum ditautkan":"@"+s.player);
            if (s.active && !s.player.isEmpty() && pairing.length() > 0) pairing.setText("");
            connected.setText(s.active?"Gateway terdeteksi • koneksi sedang aktif":
                "Gateway terhubung otomatis melalui situs SSCircle");
            nearby.setText(s.nearby);
            mute.setText(s.muted?"Unmute":"Mute");
            deafen.setText(s.deafened?"Undeafen":"Deafen");
            whisper.setText(s.whisper?"Whisper ON":"Whisper OFF");
            connect.setEnabled(!s.active);
            connect.setAlpha(s.active ? 0.6f : 1f);
        });
    }
}
