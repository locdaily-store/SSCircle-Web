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
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Function;
import java.util.function.Supplier;

/**
 * V10.47.2: Bukkit stats are read on the server thread in bounded slices.
 * No blocking HTTP or disk writes run on that tick. The newest snapshot for
 * each identity is coalesced in a durable, bounded, async-flushed queue.
 */
final class PaperStatsSync implements Listener {
    private static final String ROUTE="/api/minecraft/stats/ingest";
    private static final int MAX_PENDING=1024;
    private static final long MAX_FILE_BYTES=2_000_000;
    private static final long HTTP_PERIOD_TICKS=60L;
    private final SSCirclePaperLinkPlugin plugin;
    private final HttpClient http;
    private final Function<Player, SSCirclePaperLinkPlugin.Identity> resolveIdentity;
    private final Supplier<String> endpoint;
    private final Supplier<String> secret;
    private final LinkedHashMap<String,Snapshot> pending=new LinkedHashMap<>();
    private final Map<String,Snapshot> latestSample=new HashMap<>();
    private final ArrayDeque<UUID> playersToSample=new ArrayDeque<>();
    private final Set<UUID> enqueuedPlayers=new HashSet<>();
    private final List<Material> blockMaterials=new ArrayList<>();
    private final Path queueFile;
    private final ExecutorService diskWriter=Executors.newSingleThreadExecutor(task->{
        Thread thread=new Thread(task,"SSCircle-Stats-Queue-IO");
        thread.setDaemon(true);
        return thread;
    });
    private final AtomicBoolean diskError=new AtomicBoolean(false);
    private CaptureJob activeJob;
    private boolean dirty,inFlight;
    private int blockReadsPerTick=24;
    private boolean tpsAware=true;
    private double lowTpsThreshold=18.0;
    private int lowTpsBlockReadsPerTick=6;
    private long lastTpsSampleMs;
    private boolean lowTps;
    private long nextAttemptAtMs,retryDelayMs=3000L;
    private long lastPeriodicCaptureMs;
    private int normalIntervalSeconds=300;
    private String lastDelivery="Belum ada data dikirim";
    private String deliveryCode="IDLE";
    private Instant lastSuccessAt;

    PaperStatsSync(SSCirclePaperLinkPlugin plugin,HttpClient http,
                   Function<Player,SSCirclePaperLinkPlugin.Identity> resolveIdentity,
                   Supplier<String> endpoint,Supplier<String> secret){
        this.plugin=plugin;
        this.http=http;
        this.resolveIdentity=resolveIdentity;
        this.endpoint=endpoint;
        this.secret=secret;
        this.queueFile=plugin.getDataFolder().toPath().resolve("stats-queue.properties");
    }

    void start(){
        loadQueue();
        for(Material material:Material.values()){
            if(material.isBlock())blockMaterials.add(material);
        }
        blockReadsPerTick=Math.max(4,Math.min(96,
            plugin.getConfig().getInt("stats-sync.block-reads-per-tick",24)));
        tpsAware=plugin.getConfig().getBoolean("stats-sync.tps-aware-enabled",true);
        lowTpsThreshold=Math.max(10.0,Math.min(20.0,
            plugin.getConfig().getDouble("stats-sync.low-tps-threshold",18.0)));
        lowTpsBlockReadsPerTick=Math.max(2,Math.min(blockReadsPerTick,
            plugin.getConfig().getInt("stats-sync.low-tps-block-reads-per-tick",6)));
        int interval=Math.max(60,Math.min(3600,
            plugin.getConfig().getInt("stats-sync.interval-seconds",300)));
        normalIntervalSeconds=interval;
        int flush=Math.max(3,Math.min(60,
            plugin.getConfig().getInt("stats-sync.queue-flush-seconds",10)));
        plugin.getServer().getPluginManager().registerEvents(this,plugin);
        plugin.getServer().getScheduler().runTaskTimer(plugin,this::captureOneTick,20L,1L);
        plugin.getServer().getScheduler().runTaskTimer(plugin,this::captureScheduled,100L,20L*interval);
        plugin.getServer().getScheduler().runTaskTimer(plugin,this::sendNext,140L,HTTP_PERIOD_TICKS);
        plugin.getServer().getScheduler().runTaskTimer(plugin,this::flushQueue,20L*flush,20L*flush);
        plugin.getLogger().info("Stats V10.48.5: "+blockReadsPerTick+
            " reads/tick (TPS rendah: "+lowTpsBlockReadsPerTick+
            "), interval "+interval+"s, antrean pulih "+pending.size());
    }

    void stop(){
        // Short synchronous reads only; do not scan all materials on shutdown.
        if(enabled())for(Player player:Bukkit.getOnlinePlayers())captureQuickExit(player);
        flushQueue();
        diskWriter.shutdown();
        try {
            if(!diskWriter.awaitTermination(3,TimeUnit.SECONDS))
                plugin.getLogger().warning("Disk queue belum selesai ditulis; pastikan shutdown selesai bersih.");
        }catch(InterruptedException ex){
            Thread.currentThread().interrupt();
            plugin.getLogger().warning("Shutdown queue statistik terinterupsi.");
        }
    }

    void triggerNow(){
        captureOnline();
        sendNext();
    }

    int pendingCount(){return pending.size();}
    int captureBacklogCount(){return playersToSample.size()+(activeJob==null?0:1);}
    String deliveryCode(){return deliveryCode;}
    String lastSuccessAt(){return lastSuccessAt==null?null:lastSuccessAt.toString();}
    String deliveryStatus(){return lastDelivery;}
    private boolean enabled(){return plugin.getConfig().getBoolean("stats-sync.enabled",true);}

    @EventHandler(priority=EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event){
        if(!enabled())return;
        UUID id=event.getPlayer().getUniqueId();
        plugin.getServer().getScheduler().runTaskLater(plugin,()->{
            Player player=Bukkit.getPlayer(id);
            if(player!=null&&player.isOnline())enqueue(player);
        },20L*60);
    }

    @EventHandler(priority=EventPriority.LOWEST)
    public void onQuit(PlayerQuitEvent event){
        if(!enabled())return;
        UUID id=event.getPlayer().getUniqueId();
        playersToSample.remove(id);
        enqueuedPlayers.remove(id);
        if(activeJob!=null&&activeJob.uuid.equals(id))activeJob=null;
        captureQuickExit(event.getPlayer());
    }

    private void captureScheduled(){
        if(!enabled())return;
        int online=Bukkit.getOnlinePlayers().size();
        int threshold=Math.max(10,Math.min(200,
            plugin.getConfig().getInt("stats-sync.busy-player-threshold",30)));
        int busyInterval=Math.max(normalIntervalSeconds,Math.min(3600,
            plugin.getConfig().getInt("stats-sync.busy-interval-seconds",600)));
        if(plugin.getConfig().getBoolean("stats-sync.adaptive-enabled",true)
            &&online>=threshold
            &&System.currentTimeMillis()-lastPeriodicCaptureMs<busyInterval*1000L)return;
        lastPeriodicCaptureMs=System.currentTimeMillis();
        captureOnline();
    }

    private void captureOnline(){
        if(!enabled())return;
        // Enqueue only. Expensive per-block statistics never run in this loop.
        for(Player player:Bukkit.getOnlinePlayers())enqueue(player);
    }

    private void enqueue(Player player){
        if(!player.isOnline()||enqueuedPlayers.contains(player.getUniqueId()))return;
        enqueuedPlayers.add(player.getUniqueId());
        playersToSample.addLast(player.getUniqueId());
    }

    private void captureOneTick(){
        if(!enabled())return;
        if(activeJob==null){
            while(!playersToSample.isEmpty()){
                UUID uuid=playersToSample.removeFirst();
                enqueuedPlayers.remove(uuid);
                Player player=Bukkit.getPlayer(uuid);
                if(player==null||!player.isOnline())continue;
                SSCirclePaperLinkPlugin.Identity identity=resolveIdentity.apply(player);
                if(identity==null)continue; // Never read stats for an unauthenticated player.
                activeJob=new CaptureJob(uuid,identity,
                    Math.max(0,player.getStatistic(Statistic.PLAY_ONE_MINUTE))/20,
                    Math.max(0,player.getStatistic(Statistic.DEATHS)),
                    Math.max(0,player.getStatistic(Statistic.MOB_KILLS)));
                break;
            }
        }
        if(activeJob==null)return;
        Player player=Bukkit.getPlayer(activeJob.uuid);
        if(player==null||!player.isOnline()){
            activeJob=null;
            return;
        }
        int budget=currentReadBudget();
        while(budget-->0&&activeJob.index<blockMaterials.size()){
            Material material=blockMaterials.get(activeJob.index++);
            try{
                activeJob.blocks+=Math.max(0,player.getStatistic(Statistic.MINE_BLOCK,material));
            }catch(IllegalArgumentException ignored){
                // Material not accepted by this Vanilla statistic.
            }
            if(activeJob.blocks>=Integer.MAX_VALUE){
                activeJob.blocks=Integer.MAX_VALUE;
                activeJob.index=blockMaterials.size();
                break;
            }
        }
        if(activeJob.index>=blockMaterials.size()){
            SSCirclePaperLinkPlugin.Identity id=activeJob.identity;
            captureFinished(id,activeJob.playtime,activeJob.deaths,activeJob.mobs,
                (int)activeJob.blocks);
            activeJob=null;
        }
    }

    // Cache Paper's TPS once per second, never during individual statistic
    // reads. Under pressure slow down the scan rather than stall a server tick.
    private int currentReadBudget(){
        if(!tpsAware)return blockReadsPerTick;
        long now=System.currentTimeMillis();
        if(now-lastTpsSampleMs>=1000L){
            lastTpsSampleMs=now;
            try{
                double[] samples=Bukkit.getTPS();
                lowTps=samples.length>0&&Double.isFinite(samples[0])
                    &&samples[0]<lowTpsThreshold;
            }catch(Exception ignored){
                lowTps=false; // Missing TPS sample is not a fake performance value.
            }
        }
        return lowTps?lowTpsBlockReadsPerTick:blockReadsPerTick;
    }

    private void captureQuickExit(Player player){
        SSCirclePaperLinkPlugin.Identity id=resolveIdentity.apply(player);
        if(id==null)return;
        String key=id.provider()+":"+id.verifiedId();
        Snapshot previous=latestSample.get(key);
        // Without a full material scan, block totals are unknown. Avoid
        // misleading zeros or a reset caused by an incomplete snapshot.
        if(previous==null)return;
        captureFinished(id,Math.max(0,player.getStatistic(Statistic.PLAY_ONE_MINUTE))/20,
            Math.max(0,player.getStatistic(Statistic.DEATHS)),
            Math.max(0,player.getStatistic(Statistic.MOB_KILLS)),
            previous.blocksMined());
    }

    private void captureFinished(SSCirclePaperLinkPlugin.Identity id,int playtime,
                                 int deaths,int mobs,int blocks){
        String key=id.provider()+":"+id.verifiedId();
        Snapshot old=latestSample.get(key);
        // AuthMe may finish before FastLoginPlus publishes its verified
        // session status. Send new evidence even if every stat is unchanged.
        if(sameSnapshotAndEvidence(old,id.authSource(),playtime,deaths,mobs,blocks))return;
        Snapshot snapshot=new Snapshot(UUID.randomUUID().toString(),id.provider(),
            id.verifiedId(),id.authSource(),Instant.now().toString(),
            playtime,deaths,mobs,blocks);
        latestSample.put(key,snapshot);
        pending.remove(key); // Coalesce older unacknowledged snapshots.
        if(pending.size()>=MAX_PENDING){
            pending.remove(pending.keySet().iterator().next());
            plugin.getLogger().warning("Antrean stats penuh; snapshot tertua diganti.");
        }
        pending.put(key,snapshot);
        if(lastSuccessAt==null)deliveryCode="QUEUE_PENDING";
        dirty=true;
    }

    static boolean sameSnapshotAndEvidence(Snapshot old,String authSource,
                                           int playtime,int deaths,int mobs,int blocks){
        return old!=null&&old.authSource().equals(authSource)
            &&old.playtimeSeconds()==playtime&&old.deaths()==deaths
            &&old.mobKills()==mobs&&old.blocksMined()==blocks;
    }

    private void sendNext(){
        if(!enabled()||inFlight||pending.isEmpty()||
            System.currentTimeMillis()<nextAttemptAtMs)return;
        String host=endpoint.get(),token=secret.get();
        if(host==null||host.isBlank()||!SecretFileStore.isValidSecret(token))return;
        Map.Entry<String,Snapshot> entry=pending.entrySet().iterator().next();
        String key=entry.getKey();
        Snapshot snapshot=entry.getValue();
        String json=snapshot.toJson();
        long timestamp=System.currentTimeMillis()/1000;
        String nonce=UUID.randomUUID().toString();
        try {
            String signature=hmac(token,"POST\n"+ROUTE+"\n"+timestamp+"\n"+nonce+"\n"+json);
            HttpRequest request=HttpRequest.newBuilder()
                .uri(URI.create(host+ROUTE))
                .timeout(Duration.ofSeconds(12))
                .header("Content-Type","application/json")
                .header("X-SSC-Timestamp",Long.toString(timestamp))
                .header("X-SSC-Nonce",nonce)
                .header("X-SSC-Signature",signature)
                .header("X-SSC-Server-Id",plugin.pairingServerId())
                .POST(HttpRequest.BodyPublishers.ofString(json,StandardCharsets.UTF_8))
                .build();
            inFlight=true;
            http.sendAsync(request,HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
                .whenComplete((response,error)->{
                    if(!plugin.isEnabled())return;
                    try{
                        plugin.getServer().getScheduler().runTask(plugin,
                            ()->finishRequest(key,snapshot.eventId(),response,error));
                    }catch(IllegalPluginAccessException ignored){}
                });
        }catch(Exception ex){
            inFlight=false;
            deliveryCode="NETWORK_ERROR";
            scheduleRetry(-1,null);
            lastDelivery="Pengiriman tertunda; periksa domain atau kunci.";
        }
    }

    private void finishRequest(String key,String eventId,
                               HttpResponse<String> response,Throwable failure){
        inFlight=false;
        if(failure!=null||response==null){
            deliveryCode="NETWORK_ERROR";
            scheduleRetry(-1,null);
            lastDelivery="Jaringan terputus; antrean aman di disk.";
            return;
        }
        int code=response.statusCode();
        String body=response.body()==null?"":response.body();
        boolean acknowledged=code==200&&body.contains("\"ok\":true");
        boolean discard=(code==404&&body.contains("STATS_NOT_LINKED"))
            ||(code==410&&body.contains("STATS_PRELINK"))
            ||(code==400&&body.contains("STATS_INVALID"));
        if(acknowledged||discard){
            if(acknowledged){
                deliveryCode="SYNC_OK";
                lastSuccessAt=Instant.now();
            }else{
                deliveryCode="HTTP_ERROR";
            }
            retryDelayMs=3000L;
            nextAttemptAtMs=0L;
            Snapshot current=pending.get(key);
            // A response to an old in-flight event cannot delete newer samples.
            if(current!=null&&current.eventId().equals(eventId)){
                pending.remove(key);
                dirty=true;
            }
            lastDelivery=acknowledged?"Statistik berhasil tersinkron":
                "Akun belum tertaut; menunggu statistik berikutnya.";
        }else{
            deliveryCode=(code==401||code==403)?"AUTH_ERROR":"HTTP_ERROR";
            scheduleRetry(code,response.headers().firstValue("Retry-After").orElse(null));
            lastDelivery="HTTP "+code+"; statistik disimpan dan akan dicoba ulang.";
        }
    }

    private void scheduleRetry(int httpStatus,String retryAfter){
        long now=System.currentTimeMillis();
        long jitter=ThreadLocalRandom.current().nextLong(2_001L);
        long delay=SyncRetryPolicy.delayMs(retryDelayMs,httpStatus,retryAfter,now,jitter);
        nextAttemptAtMs=now+delay;
        retryDelayMs=SyncRetryPolicy.nextBaseDelayMs(retryDelayMs);
    }

    private static String hmac(String secret,String value)throws GeneralSecurityException{
        Mac mac=Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(
            mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    }

    private void loadQueue(){
        if(!Files.exists(queueFile,LinkOption.NOFOLLOW_LINKS))return;
        try{
            if(!Files.isRegularFile(queueFile,LinkOption.NOFOLLOW_LINKS)
                ||Files.size(queueFile)>MAX_FILE_BYTES)throw new IOException("Invalid queue file");
            Properties props=new Properties();
            try(InputStream in=Files.newInputStream(queueFile)){props.load(in);}
            int count=Math.min(MAX_PENDING,Integer.parseInt(props.getProperty("count","0")));
            for(int i=0;i<count;i++){
                Snapshot snap=Snapshot.fromStorage(props.getProperty("item."+i,""));
                if(snap!=null){
                    String key=snap.provider()+":"+snap.providerId();
                    pending.put(key,snap);
                    // Preserve last sampled values after restart: a quick
                    // exit must never accidentally replace recovered blocks
                    // with an incomplete or zero-valued sample.
                    latestSample.put(key,snap);
                }
            }
            if(!pending.isEmpty()){
                deliveryCode="QUEUE_PENDING";
                lastDelivery="Memulihkan "+pending.size()+" snapshot dari disk.";
            }
        }catch(Exception ex){
            plugin.getLogger().warning("Antrean statistik tidak bisa dibaca; data tidak valid tidak dikirim.");
            pending.clear();
        }
    }

    private void flushQueue(){
        if(diskError.getAndSet(false))dirty=true;
        if(!dirty)return;
        dirty=false;
        List<Snapshot> copy=new ArrayList<>(pending.values());
        try{
            diskWriter.submit(()->writeQueue(copy));
        }catch(RuntimeException ignored){
            plugin.getLogger().warning("Antrean statistik belum bisa disimpan.");
            dirty=true;
        }
    }

    private void writeQueue(List<Snapshot> copy){
        Path temporary=null;
        try{
            Files.createDirectories(queueFile.getParent());
            if(Files.isSymbolicLink(queueFile))throw new IOException("Queue symlink forbidden");
            Properties props=new Properties();
            props.setProperty("count",Integer.toString(copy.size()));
            int index=0;
            for(Snapshot s:copy)props.setProperty("item."+(index++),s.toStorage());
            temporary=Files.createTempFile(queueFile.getParent(),"stats-queue-",".tmp");
            try(OutputStream out=Files.newOutputStream(temporary)){
                props.store(out,"SSCircle private stats queue");
            }
            try{
                Files.move(temporary,queueFile,
                    StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);
            }catch(AtomicMoveNotSupportedException unsupported){
                Files.move(temporary,queueFile,StandardCopyOption.REPLACE_EXISTING);
            }
        }catch(IOException ex){
            diskError.set(true);
            plugin.getLogger().warning("Antrean statistik gagal ditulis; periksa penyimpanan host.");
        }finally{
            if(temporary!=null)try{Files.deleteIfExists(temporary);}catch(IOException ignored){}
        }
    }

    private static final class CaptureJob{
        final UUID uuid;
        final SSCirclePaperLinkPlugin.Identity identity;
        final int playtime,deaths,mobs;
        int index;
        long blocks;
        CaptureJob(UUID uuid,SSCirclePaperLinkPlugin.Identity identity,int playtime,int deaths,int mobs){
            this.uuid=uuid;this.identity=identity;
            this.playtime=playtime;this.deaths=deaths;this.mobs=mobs;
        }
    }

    record Snapshot(String eventId,String provider,String providerId,String authSource,
                    String capturedAt,int playtimeSeconds,int deaths,int mobKills,int blocksMined){
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
        static Snapshot fromStorage(String text){
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
