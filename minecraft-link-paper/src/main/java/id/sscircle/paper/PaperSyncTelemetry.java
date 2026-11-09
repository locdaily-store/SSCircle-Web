package id.sscircle.paper;

import org.bukkit.Bukkit;
import org.bukkit.plugin.IllegalPluginAccessException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Single signed heartbeat every 120 seconds. Network I/O remains asynchronous.
 * Admin sync commands are short-lived and returned only by the trusted website,
 * not by untrusted chat or a browser connecting to Paper.
 */
final class PaperSyncTelemetry {
    private static final String ROUTE="/api/minecraft/sync/heartbeat";
    private static final Pattern COMMAND=Pattern.compile(
        "\"command\"\\s*:\\s*\\{\\s*\"id\"\\s*:\\s*\"([0-9a-f-]{36})\"\\s*,"
        +"\\s*\"type\"\\s*:\\s*\"sync_now\"\\s*,"
        +"\\s*\"expiresAt\"\\s*:\\s*\"([^\"]{1,40})\"");
    private final SSCirclePaperLinkPlugin plugin;
    private final PaperStatsSync stats;
    private final HttpClient http;
    private final Supplier<String> endpoint;
    private final Supplier<String> secret;
    private boolean inFlight;
    private String lastExecutedId;
    private String heartbeatState="Belum ada laporan";

    PaperSyncTelemetry(SSCirclePaperLinkPlugin plugin,PaperStatsSync stats,HttpClient http,
                       Supplier<String> endpoint,Supplier<String> secret) {
        this.plugin=plugin;
        this.stats=stats;
        this.http=http;
        this.endpoint=endpoint;
        this.secret=secret;
    }

    void start(){
        int seconds=Math.max(60,Math.min(600,
            plugin.getConfig().getInt("sync-monitor.interval-seconds",120)));
        plugin.getServer().getScheduler().runTaskTimer(plugin,this::report,100L,20L*seconds);
    }

    String status(){return heartbeatState;}

    private void report(){
        if(inFlight)return;
        String host=endpoint.get(),token=secret.get();
        if(host==null||host.isBlank()||!SecretFileStore.isValidSecret(token)){
            heartbeatState="Endpoint/secret belum siap";
            return;
        }
        final long stamp=System.currentTimeMillis()/1000;
        final String nonce=UUID.randomUUID().toString();
        Double tps=null;
        try {
            // Paper's sampled 1-minute TPS is an estimate, not a spark profile.
            double sampled=Bukkit.getTPS()[0];
            if(Double.isFinite(sampled))
                tps=Math.max(0,Math.min(20.0,sampled));
        }catch(Exception ignored){ /* Unknown is safer than inventing 20 TPS. */ }
        String lastSuccess=stats.lastSuccessAt();
        String body="{\"pluginVersion\":\""+plugin.getDescription().getVersion()
            +"\",\"onlineCount\":"+Bukkit.getOnlinePlayers().size()
            +",\"pendingCount\":"+stats.pendingCount()
            +",\"captureBacklog\":"+stats.captureBacklogCount()
            +",\"deliveryCode\":\""+stats.deliveryCode()+"\""
            +",\"lastSuccessAt\":"+(lastSuccess==null?"null":"\""+lastSuccess+"\"")
            +",\"tps1m\":"+(tps==null?"null":Double.toString(Math.round(tps*100.0)/100.0))
            +",\"completedCommandId\":"+(lastExecutedId==null?"null":"\""+lastExecutedId+"\"")+"}";
        try {
            String signature=sign(token,"POST\n"+ROUTE+"\n"+stamp+"\n"+nonce+"\n"+body);
            HttpRequest request=HttpRequest.newBuilder(URI.create(host+ROUTE))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type","application/json")
                .header("X-SSC-Timestamp",Long.toString(stamp))
                .header("X-SSC-Nonce",nonce)
                .header("X-SSC-Signature",signature)
                .POST(HttpRequest.BodyPublishers.ofString(body,StandardCharsets.UTF_8))
                .build();
            inFlight=true;
            http.sendAsync(request,HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
                .whenComplete((response,error)->{
                    if(!plugin.isEnabled())return;
                    try{
                        plugin.getServer().getScheduler().runTask(plugin,()->finish(response,error));
                    }catch(IllegalPluginAccessException ignored){}
                });
        }catch(Exception error){
            inFlight=false;
            heartbeatState="Laporan tertunda; periksa koneksi";
        }
    }

    private void finish(HttpResponse<String> response,Throwable error){
        inFlight=false;
        if(error!=null||response==null){
            heartbeatState="Laporan gagal dikirim; jaringan terputus";
            return;
        }
        int code=response.statusCode();
        if(code!=200){
            String responseBody=response.body()==null?"":response.body();
            if(code==400&&responseBody.contains("\"TELEMETRY_INVALID\""))
                heartbeatState="Format monitoring ditolak (HTTP 400); perbarui Worker SSCircle.";
            else if(code==401||code==403)
                heartbeatState="Monitoring ditolak (HTTP "+code+"); periksa secret server dan Worker.";
            else if(code==404)
                heartbeatState="Endpoint monitoring belum ada (HTTP 404); perbarui Worker.";
            else
                heartbeatState="Laporan ditolak (HTTP "+code+")";
            return;
        }
        String raw=response.body()==null?"":response.body();
        if(raw.length()>2048||!raw.contains("\"ok\":true")){
            heartbeatState="Respons layanan tidak sesuai";
            return;
        }
        heartbeatState="Laporan berhasil dikirim";
        Matcher matcher=COMMAND.matcher(raw);
        if(!matcher.find())return;
        String id=matcher.group(1);
        if(id.equals(lastExecutedId))return; // Duplicate delivery is harmless.
        try {
            UUID.fromString(id);
            Instant expire=Instant.parse(matcher.group(2));
            if(expire.isBefore(Instant.now())||expire.isAfter(Instant.now().plusSeconds(610)))return;
        }catch(Exception invalid){return;}
        // This callback runs on Paper's main server thread.
        // No commands are executed by the web server directly.
        lastExecutedId=id;
        stats.triggerNow();
        plugin.getLogger().info("Permintaan sinkronisasi Admin Control diterima.");
    }

    private static String sign(String token,String data)throws GeneralSecurityException{
        Mac mac=Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(token.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
        return Base64.getUrlEncoder().withoutPadding()
            .encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
    }
}
