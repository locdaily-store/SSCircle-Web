package id.sscircle.paper;

import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.Statistic;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.IllegalPluginAccessException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.GeneralSecurityException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Supplier;

/**
 * V10.47: server-authoritative Vanilla statistics, cumulative snapshots,
 * bounded persistent coalescing queue, and signed retry-safe HTTP delivery.
 *
 * All Bukkit reads and mutable queue operations occur on the main server
 * thread. The HTTP worker only schedules completion on the server thread.
 */
final class PaperStatsSync implements Listener {
    private static final String ROUTE = "/api/minecraft/stats/ingest";
    private static final int MAX_PENDING = 1024;
    private static final long MAX_FILE_BYTES = 2_000_000;
    private static final long HTTP_PERIOD_TICKS = 60L;
    private final SSCirclePaperLinkPlugin plugin;
    private final HttpClient http;
    private final Function<Player, SSCirclePaperLinkPlugin.Identity> resolveIdentity;
    private final Supplier<String> endpoint;
    private final Supplier<String> secret;
    private final LinkedHashMap<String, Snapshot> pending = new LinkedHashMap<>();
    private final Path queueFile;
    private boolean inFlight;
    private long nextAttemptAtMs;
    private long retryDelayMs=3000L;
    private String lastDelivery = "Belum ada data dikirim";

    PaperStatsSync(SSCirclePaperLinkPlugin plugin, HttpClient http,
                   Function<Player, SSCirclePaperLinkPlugin.Identity> resolveIdentity,
                   Supplier<String> endpoint, Supplier<String> secret) {
        this.plugin=plugin;
        this.http=http;
        this.resolveIdentity=resolveIdentity;
        this.endpoint=endpoint;
        this.secret=secret;
        this.queueFile=plugin.getDataFolder().toPath().resolve("stats-queue.properties");
    }

    void start() {
        loadQueue();
        plugin.getServer().getPluginManager().registerEvents(this,plugin);
        int interval=Math.max(60,Math.min(3600,
            plugin.getConfig().getInt("stats-sync.interval-seconds",300)));
        plugin.getServer().getScheduler().runTaskTimer(plugin,this::captureOnline,100L,20L*interval);
        plugin.getServer().getScheduler().runTaskTimer(plugin,this::sendNext,140L,HTTP_PERIOD_TICKS);
        plugin.getLogger().info("Player stats V10.47 siap; interval "+interval+
            " detik, antrean tersimpan: "+pending.size());
    }

    void stop() {
        if (enabled()) captureOnline();
        persistQueue();
    }

    int pendingCount() { return pending.size(); }
    String deliveryStatus() { return lastDelivery; }

    private boolean enabled() {
        return plugin.getConfig().getBoolean("stats-sync.enabled",true);
    }

    @EventHandler(priority=EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        if(!enabled())return;
        // Delay until authentication has had an opportunity to finish.
        plugin.getServer().getScheduler().runTaskLater(plugin,()->{
            if(event.getPlayer().isOnline()) capture(event.getPlayer());
        },20L*60);
    }

    @EventHandler(priority=EventPriority.LOWEST)
    public void onQuit(PlayerQuitEvent event) {
        if(enabled())capture(event.getPlayer());
    }

    private void captureOnline() {
        if(!enabled())return;
        for(Player player:Bukkit.getOnlinePlayers())capture(player);
    }

    private void capture(Player player) {
        if(!enabled())return;
        SSCirclePaperLinkPlugin.Identity id=resolveIdentity.apply(player);
        if(id==null)return; // Never capture pre-login/untrusted identities.
        int ticks=Math.max(0,player.getStatistic(Statistic.PLAY_ONE_MINUTE));
        int playtime=ticks/20; // This Bukkit stat is ticks, despite its historic name.
        int deaths=Math.max(0,player.getStatistic(Statistic.DEATHS));
        int mobs=Math.max(0,player.getStatistic(Statistic.MOB_KILLS));
        long blocks=0;
        // Vanilla stores mined blocks per material. Aggregate without resetting.
        for(Material material:Material.values()){
            if(!material.isBlock())continue;
            try{
                blocks+=Math.max(0,player.getStatistic(Statistic.MINE_BLOCK,material));
            }catch(IllegalArgumentException ignored){
                // Some block materials cannot be used by this statistic.
            }
            if(blocks>=Integer.MAX_VALUE){blocks=Integer.MAX_VALUE;break;}
        }
        Snapshot snap=new Snapshot(UUID.randomUUID().toString(),id.provider(),
            id.verifiedId(),id.authSource(),Instant.now().toString(),playtime,
            deaths,mobs,(int)blocks);
        String key=snap.provider()+":"+snap.providerId();
        pending.remove(key); // Coalesce older unacknowledged snapshots per identity.
        if(pending.size()>=MAX_PENDING){
            String oldest=pending.keySet().iterator().next();
            pending.remove(oldest);
            plugin.getLogger().warning("Antrean statistik penuh, snapshot paling lama diganti.");
        }
        pending.put(key,snap);
        persistQueue();
    }

    private void sendNext() {
        if(!enabled()||inFlight||pending.isEmpty()
            ||System.currentTimeMillis()<nextAttemptAtMs)return;
        String host=endpoint.get(),token=secret.get();
        if(host==null||host.isBlank()||!SecretFileStore.isValidSecret(token))return;
        Map.Entry<String,Snapshot> entry=pending.entrySet().iterator().next();
        String key=entry.getKey();
        Snapshot snapshot=entry.getValue();
        String json=snapshot.toJson();
        long timestamp=System.currentTimeMillis()/1000;
        String nonce=UUID.randomUUID().toString();
        try {
            String signed="POST\n"+ROUTE+"\n"+timestamp+"\n"+nonce+"\n"+json;
            String signature=hmac(token,signed);
            HttpRequest request=HttpRequest.newBuilder()
                .uri(URI.create(host+ROUTE))
                .timeout(Duration.ofSeconds(12))
                .header("Content-Type","application/json")
                .header("X-SSC-Timestamp",Long.toString(timestamp))
                .header("X-SSC-Nonce",nonce)
                .header("X-SSC-Signature",signature)
                .POST(HttpRequest.BodyPublishers.ofString(json,StandardCharsets.UTF_8))
                .build();
            inFlight=true;
            http.sendAsync(request,HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
                .whenComplete((response,error)->{
                    if(!plugin.isEnabled())return;
                    try {
                        plugin.getServer().getScheduler().runTask(plugin,
                            ()->finishRequest(key,snapshot.eventId(),response,error));
                    }catch(IllegalPluginAccessException ignored){}
                });
        } catch(Exception error){
            lastDelivery="Pengiriman tertunda; periksa domain atau kunci";
        }
    }

    private void finishRequest(String key,String eventId,
                               HttpResponse<String> response,Throwable failure) {
        inFlight=false;
        if(failure!=null||response==null){
            scheduleRetry();
            lastDelivery="Jaringan tidak tersedia, antrean disimpan";
            return;
        }
        int code=response.statusCode();
        String body=response.body()==null?"":response.body();
        boolean acknowledged=code==200 && body.contains("\"ok\":true");
        boolean discard=code==404 && body.contains("STATS_NOT_LINKED")
            ||code==410 && body.contains("STATS_PRELINK")
            ||code==400 && body.contains("STATS_INVALID");
        if(acknowledged||discard){
            retryDelayMs=3000L;
            nextAttemptAtMs=0L;
            // An in-flight older snapshot must NOT delete a newer coalesced one.
            Snapshot current=pending.get(key);
            if(current!=null&&current.eventId().equals(eventId)){
                pending.remove(key);
                persistQueue();
            }
            lastDelivery=acknowledged?"Statistik berhasil tersinkron":
                "Akun belum tertaut atau snapshot tidak berlaku; menunggu sampel berikutnya";
        }else{
            scheduleRetry();
            lastDelivery="HTTP "+code+"; data aman di antrean untuk dicoba lagi";
        }
    }

    private void scheduleRetry() {
        nextAttemptAtMs=System.currentTimeMillis()+retryDelayMs;
        retryDelayMs=Math.min(300000L,retryDelayMs*2L);
    }

    private static String hmac(String secret,String value) throws GeneralSecurityException {
        Mac mac=Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(
            mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    }

    private void loadQueue() {
        if(!Files.exists(queueFile,LinkOption.NOFOLLOW_LINKS))return;
        try {
            if(!Files.isRegularFile(queueFile,LinkOption.NOFOLLOW_LINKS)
                ||Files.size(queueFile)>MAX_FILE_BYTES)throw new IOException("Queue file invalid");
            Properties props=new Properties();
            try(InputStream in=Files.newInputStream(queueFile)){props.load(in);}
            int count=Math.min(MAX_PENDING,Integer.parseInt(props.getProperty("count","0")));
            for(int i=0;i<count;i++){
                Snapshot s=Snapshot.fromStorage(props.getProperty("item."+i,""));
                if(s!=null)pending.put(s.provider()+":"+s.providerId(),s);
            }
        }catch(Exception ex){
            plugin.getLogger().warning("Antrean statistik tidak bisa dibaca; tidak mengirim data yang rusak.");
            pending.clear();
        }
    }

    private void persistQueue() {
        Path temp=null;
        try {
            Files.createDirectories(queueFile.getParent());
            if(Files.isSymbolicLink(queueFile))throw new IOException("Queue cannot be symlink");
            Properties p=new Properties();
            p.setProperty("count",Integer.toString(pending.size()));
            int i=0;
            for(Snapshot s:pending.values())p.setProperty("item."+(i++),s.toStorage());
            temp=Files.createTempFile(queueFile.getParent(),"stats-queue-",".tmp");
            try(OutputStream out=Files.newOutputStream(temp)){p.store(out,"SSCircle private stats queue");}
            try{
                Files.move(temp,queueFile,StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);
            }catch(AtomicMoveNotSupportedException unsupported){
                Files.move(temp,queueFile,StandardCopyOption.REPLACE_EXISTING);
            }
        }catch(IOException error){
            plugin.getLogger().warning("Gagal menyimpan antrean statistik; cek izin folder server.");
        }finally{
            if(temp!=null)try{Files.deleteIfExists(temp);}catch(IOException ignored){}
        }
    }

    record Snapshot(String eventId,String provider,String providerId,String authSource,
                    String capturedAt,int playtimeSeconds,int deaths,int mobKills,int blocksMined) {
        String toJson(){
            return "{\"eventId\":\""+eventId+"\",\"provider\":\""+provider
                +"\",\"providerId\":\""+providerId+"\",\"authSource\":\""+authSource
                +"\",\"capturedAt\":\""+capturedAt+"\",\"stats\":{"
                +"\"playtimeSeconds\":"+playtimeSeconds+",\"deaths\":"+deaths
                +",\"mobKills\":"+mobKills+",\"blocksMined\":"+blocksMined+"}}";
        }
        String toStorage(){
            return String.join("|",eventId,provider,providerId,authSource,capturedAt,
                Integer.toString(playtimeSeconds),Integer.toString(deaths),
                Integer.toString(mobKills),Integer.toString(blocksMined));
        }
        static Snapshot fromStorage(String text) {
            try{
                String[] p=text.split("\\|",-1);
                if(p.length!=9||p[2].length()>64||p[3].length()>32)return null;
                UUID.fromString(p[0]);
                if(!List.of("java_premium","java_offline","bedrock").contains(p[1]))return null;
                Instant.parse(p[4]);
                int play=Integer.parseInt(p[5]),death=Integer.parseInt(p[6]),
                    mobs=Integer.parseInt(p[7]),blocks=Integer.parseInt(p[8]);
                if(play<0||death<0||mobs<0||blocks<0)return null;
                return new Snapshot(p[0],p[1],p[2],p[3],p[4],play,death,mobs,blocks);
            }catch(Exception ignored){return null;}
        }
    }
}
