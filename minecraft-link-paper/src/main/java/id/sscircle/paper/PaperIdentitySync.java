package id.sscircle.paper;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.IllegalPluginAccessException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Function;
import java.util.function.Supplier;

/**
 * V10.48.4.1: periodically refresh verified, live-session Minecraft edition
 * without sampling or changing Vanilla stats and without blocking Paper TPS.
 * At most a few HMAC requests are attempted in one scheduling round.
 * Server-side proof is only accepted for an already-confirmed account.
 */
final class PaperIdentitySync implements Listener {
    private static final String ROUTE="/api/minecraft/identity/refresh";
    private static final long RETRY_MS=60000L;
    private static final long MIN_RETRY_MS=15000L;
    private static final long SUCCESS_REFRESH_MS=10*60000L;
    private static final int MAX_PER_ROUND=4;
    private static final int MAX_ACTIVE=3;

    private final SSCirclePaperLinkPlugin plugin;
    private final HttpClient http;
    private final Function<Player,SSCirclePaperLinkPlugin.Identity> identityFor;
    private final Supplier<String> endpoint,secret;
    private final Map<UUID,State> sessions=new HashMap<>();
    private int active;
    private String lastDelivery="Belum ada pembaruan sesi";
    private String lastCode="IDLE";

    private static final class State {
        boolean inflight;
        long lastAttemptMs,lastSuccessMs;
        long retryNotBeforeMs,retryDelayMs=RETRY_MS;
        String acceptedSource="";
        String lastStatus="Belum dikirim";
    }

    PaperIdentitySync(SSCirclePaperLinkPlugin plugin,HttpClient http,
        Function<Player,SSCirclePaperLinkPlugin.Identity> identityFor,
        Supplier<String> endpoint,Supplier<String> secret) {
        this.plugin=plugin;
        this.http=http;
        this.identityFor=identityFor;
        this.endpoint=endpoint;
        this.secret=secret;
    }

    void start(){
        Bukkit.getPluginManager().registerEvents(this,plugin);
        for(Player p:Bukkit.getOnlinePlayers())
            sessions.putIfAbsent(p.getUniqueId(),new State());
        // No plugin callbacks or HTTP block the main thread. Small, bounded
        // scans every 20 seconds; first attempt after join/auth settle.
        Bukkit.getScheduler().runTaskTimer(plugin,this::tick,100L,400L);
    }

    void stop(){
        sessions.clear();
    }

    void forceAll(){
        for(Player player:Bukkit.getOnlinePlayers()){
            State state=sessions.computeIfAbsent(player.getUniqueId(),ignored->new State());
            state.lastAttemptMs=0;
            state.lastSuccessMs=0;
        }
        tick();
    }

    String statusFor(Player player){
        State state=sessions.get(player.getUniqueId());
        return state==null?"Belum ada sesi":state.lastStatus;
    }
    String deliveryStatus(){return lastCode+": "+lastDelivery;}

    @EventHandler(priority=EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        UUID uuid=event.getPlayer().getUniqueId();
        sessions.put(uuid,new State());
        // FastLoginPlus may send the verified session result after join.
        Bukkit.getScheduler().runTaskLater(plugin,()->{
            Player online=Bukkit.getPlayer(uuid);
            if(online!=null&&online.isOnline())tick();
        },160L);
    }

    @EventHandler(priority=EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        sessions.remove(event.getPlayer().getUniqueId());
    }

    private void tick(){
        if(!plugin.isEnabled()||active>=MAX_ACTIVE)return;
        String host=endpoint.get(),token=secret.get();
        if(host==null||host.isBlank()||!SecretFileStore.isValidSecret(token))return;
        int sent=0;
        long now=System.currentTimeMillis();
        for(Player player:Bukkit.getOnlinePlayers()){
            if(active>=MAX_ACTIVE||sent>=MAX_PER_ROUND)break;
            State state=sessions.computeIfAbsent(player.getUniqueId(),ignored->new State());
            if(state.inflight||now<state.retryNotBeforeMs)continue;
            SSCirclePaperLinkPlugin.Identity identity=identityFor.apply(player);
            if(identity==null)continue; // AuthMe/Floodgate did not verify session.
            String source=identity.authSource();
            if(!shouldSend(now,state.lastAttemptMs,state.lastSuccessMs,
                state.acceptedSource,source))continue;
            state.inflight=true;
            state.lastAttemptMs=now;
            active++;
            sent++;
            send(player.getUniqueId(),state,identity,host,token);
        }
    }

    // Pure scheduler decision; tested without Paper or any Cloudflare API.
    static boolean shouldSend(long now,long lastAttempt,long lastSuccess,
                              String acceptedSource,String currentSource){
        long retryWindow=lastSuccess>0?MIN_RETRY_MS:RETRY_MS;
        if(lastAttempt>0&&now-lastAttempt<retryWindow)return false;
        return !acceptedSource.equals(currentSource)
            ||now-lastSuccess>=SUCCESS_REFRESH_MS;
    }

    private void send(UUID sessionId,State state,SSCirclePaperLinkPlugin.Identity id,
                      String host,String token){
        long timestamp=System.currentTimeMillis()/1000L;
        String nonce=UUID.randomUUID().toString();
        String body="{\"provider\":\""+id.provider()+"\",\"providerId\":\""
            +id.verifiedId()+"\",\"authSource\":\""+id.authSource()
            +"\",\"observedAt\":\""+Instant.now()+"\"}";
        try {
            String signature=hmac(token,"POST\n"+ROUTE+"\n"
                +timestamp+"\n"+nonce+"\n"+body);
            HttpRequest request=HttpRequest.newBuilder(URI.create(host+ROUTE))
                .timeout(Duration.ofSeconds(12))
                .header("Content-Type","application/json")
                .header("X-SSC-Timestamp",Long.toString(timestamp))
                .header("X-SSC-Nonce",nonce)
                .header("X-SSC-Signature",signature)
                .POST(HttpRequest.BodyPublishers.ofString(body,StandardCharsets.UTF_8))
                .build();
            http.sendAsync(request,HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
                .whenComplete((response,failure)->{
                    if(!plugin.isEnabled())return;
                    try{
                        Bukkit.getScheduler().runTask(plugin,()->finish(sessionId,state,
                            id.authSource(),response,failure));
                    }catch(IllegalPluginAccessException ignored){}
                });
        }catch(Exception ignored){
            finish(sessionId,state,id.authSource(),null,ignored);
        }
    }

    private void finish(UUID sessionId,State state,String source,
        HttpResponse<String> response,Throwable failure){
        active=Math.max(0,active-1);
        state.inflight=false;
        // The old session may have left and a new login reused the UUID.
        if(sessions.get(sessionId)!=state)return;
        if(failure!=null||response==null){
            lastCode="NETWORK_ERROR";
            state.lastStatus="Jaringan belum terhubung";
            lastDelivery="Bukti sesi akan dikirim ulang";
            postpone(state,-1,null);
            return;
        }
        int status=response.statusCode();
        if(status==200&&response.body()!=null
            &&response.body().contains("\"ok\":true")){
            state.acceptedSource=source;
            state.lastSuccessMs=System.currentTimeMillis();
            state.retryDelayMs=RETRY_MS;
            state.retryNotBeforeMs=0L;
            lastCode="IDENTITY_SYNC_OK";
            state.lastStatus="Bukti "+source+" diterima website";
            lastDelivery="Bukti sesi terbaru diterima";
        }else if(status==404){
            // A missing Worker endpoint and an unlinked player both return
            // HTTP 404. Never report "not linked" unless the signed backend
            // explicitly returned that error code.
            String body=response.body()==null?"":response.body();
            if(body.contains("\"IDENTITY_NOT_LINKED\"")){
                lastCode="IDENTITY_NOT_LINKED";
                state.lastStatus="Akun Minecraft belum dikonfirmasi di Profile";
                lastDelivery="Menunggu konfirmasi tautan";
            }else{
                lastCode="WEB_VERSION_MISMATCH";
                state.lastStatus="Endpoint sinkron belum tersedia di Cloudflare";
                lastDelivery="Deploy ZIP Worker SSCircle yang sesuai dengan JAR";
            }
        }else if(status==401||status==403){
            lastCode="IDENTITY_AUTH_ERROR";
            state.lastStatus="Pengiriman ditolak (HTTP "+status+")";
            lastDelivery="Periksa secret Paper dan Cloudflare; jalankan /sscircle diagnose";
        }else if(status==410){
            lastCode="IDENTITY_PRELINK";
            state.lastStatus="Bukti sebelum tautan akun tidak digunakan";
            lastDelivery="Hubungkan akun baru secara aman melalui Profile";
        }else if(status==503){
            lastCode="WEB_UNAVAILABLE";
            state.lastStatus="Layanan Cloudflare belum siap";
            lastDelivery="Periksa deployment dan binding D1 pada Worker";
        }else{
            lastCode="IDENTITY_HTTP_"+status;
            state.lastStatus="Pembaruan tertunda (HTTP "+status+")";
            lastDelivery="Periksa status deployment Cloudflare";
        }
        if(!(status==200&&response.body()!=null
            &&response.body().contains("\\"ok\\":true"))){
            postpone(state,status,response.headers().firstValue("Retry-After").orElse(null));
        }
    }

    // Never busy-loop on Cloudflare rate limiting or temporary outages.
    // This state stays with the validated Paper session, not its nickname.
    private void postpone(State state,int httpStatus,String retryAfter){
        long now=System.currentTimeMillis();
        long jitter=ThreadLocalRandom.current().nextLong(2_001L);
        state.retryNotBeforeMs=now+SyncRetryPolicy.delayMs(
            state.retryDelayMs,httpStatus,retryAfter,now,jitter);
        state.retryDelayMs=SyncRetryPolicy.nextBaseDelayMs(state.retryDelayMs);
    }

    private static String hmac(String secret,String value)throws Exception{
        Mac mac=Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(
            mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    }
}
