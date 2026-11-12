package id.sscircle.paper;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.profile.PlayerTextures;
import org.bukkit.scheduler.BukkitTask;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URL;
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
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.bukkit.plugin.Plugin;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/**
 * Synchronizes the *server-applied* Paper player texture, never a username lookup.
 * All Bukkit/player-profile reads happen on the primary thread. HTTPS and HMAC
 * run asynchronously, with bounded active requests and per-player retry.
 */
final class PaperSkinSync {
    static final String ROUTE = "/api/minecraft/skin/refresh";
    private static final Pattern TEXTURE = Pattern.compile(
        "https://textures\\.minecraft\\.net/texture/[0-9a-fA-F]{32,128}");
    private static final long RETRY_MS = 60_000L;
    private static final long REFRESH_MS = 90_000L;
    private static final int MAX_ACTIVE = 2;
    private final SSCirclePaperLinkPlugin plugin;
    private final HttpClient http;
    private final Function<Player,SSCirclePaperLinkPlugin.Identity> identityFor;
    private final Supplier<String> endpoint, secret;
    private final Map<UUID,State> states = new HashMap<>();
    private BukkitTask timer;
    private int offset, active;
    private boolean stopping;
    private String deliveryStatus="Belum ada pengiriman skin";

    private static final class State {
        String lastDelivered = "";
        boolean inflight;
        long nextAttempt;
    }
    record Snapshot(String provider, String providerId, String authSource,
                    String skinUrl, String model, String observedAt) {
        String json() {
            return "{\"provider\":\""+provider+"\",\"providerId\":\""+providerId+
                "\",\"authSource\":\""+authSource+"\",\"skinUrl\":\""+skinUrl+
                "\",\"model\":\""+model+"\",\"observedAt\":\""+observedAt+"\"}";
        }
    }

    PaperSkinSync(SSCirclePaperLinkPlugin plugin, HttpClient http,
                  Function<Player,SSCirclePaperLinkPlugin.Identity> identityFor,
                  Supplier<String> endpoint, Supplier<String> secret) {
        this.plugin=plugin; this.http=http; this.identityFor=identityFor;
        this.endpoint=endpoint; this.secret=secret;
    }
    void start() {
        if(!plugin.getConfig().getBoolean("skin-sync.enabled", true))return;
        stopping=false;
        // Read at most ONE online profile per scan. No HTTP or image parsing on main thread.
        timer=Bukkit.getScheduler().runTaskTimer(plugin,this::scan,100L,
            Math.max(40L,Math.min(200L,
                plugin.getConfig().getLong("skin-sync.profile-scan-ticks",60L))));
    }
    void stop() {
        stopping=true;
        if(timer!=null)timer.cancel();
        states.clear();
    }
    void onQuit(Player p){states.remove(p.getUniqueId());}
    String deliveryStatus(){return deliveryStatus;}
    void onJoin(Player player) {
        if(stopping || Bukkit.getPluginManager().isPluginEnabled("SSCircleSkinBridge") || !plugin.getConfig().getBoolean("skin-sync.enabled",true))return;
        final UUID uuid=player.getUniqueId();
        // AuthMe and skin plugins may apply the chosen skin after PlayerJoinEvent.
        Bukkit.getScheduler().runTaskLater(plugin,()->{
            Player online=Bukkit.getPlayer(uuid);
            if(online!=null && online.isOnline())trySync(online, false);
        },120L);
    }
    void forceAll(){
        if(stopping || Bukkit.getPluginManager().isPluginEnabled("SSCircleSkinBridge"))return;
        for(Player p:Bukkit.getOnlinePlayers()){
            State state=states.computeIfAbsent(p.getUniqueId(),id->new State());
            state.nextAttempt=0;
        }
        // Upcoming bounded scans pick all players without spiking the main thread.
        scan();
    }
    private void scan(){
        if(stopping || !plugin.isEnabled() || Bukkit.getPluginManager().isPluginEnabled("SSCircleSkinBridge") || !plugin.getConfig().getBoolean("skin-sync.enabled",true) || active>=MAX_ACTIVE)return;
        Player[] players=Bukkit.getOnlinePlayers().toArray(new Player[0]);
        if(players.length==0)return;
        if(offset>=players.length)offset=0;
        trySync(players[offset++],false);
    }
    static String validatedTexture(String value){
        if(value==null)return null;
        String normalized=value.replaceFirst("^http://textures\\.minecraft\\.net/", "https://textures.minecraft.net/");
        return TEXTURE.matcher(normalized).matches()?normalized:null;
    }
    static Snapshot capture(SSCirclePaperLinkPlugin.Identity identity, URL skin,
                            PlayerTextures.SkinModel model, Instant when){
        if(identity==null||skin==null)return null;
        String url=validatedTexture(skin.toString());
        if(url==null)return null;
        String variant=model==PlayerTextures.SkinModel.SLIM?"slim":"classic";
        return new Snapshot(identity.provider(),identity.verifiedId(),identity.authSource(),
            url,variant,when.toString());
    }
    private void trySync(Player player, boolean force){
        if(stopping||!player.isOnline()||active>=MAX_ACTIVE)return;
        String target=endpoint.get(),key=secret.get();
        if(target==null||target.isBlank()||key==null||key.length()<32)return;
        State state=states.computeIfAbsent(player.getUniqueId(),id->new State());
        long now=System.currentTimeMillis();
        if(state.inflight||(!force&&now<state.nextAttempt))return;
        var identity=identityFor.apply(player);
        if(identity==null){state.nextAttempt=now+RETRY_MS;return;}
        // Paper live profile is sampled on the primary thread. Never call
        // update(), use an offline UUID to look up Mojang, or block on skins.
        var textures=player.getPlayerProfile().getTextures();
        Snapshot paper=capture(identity,textures.getSkin(),textures.getSkinModel(),Instant.now());
        Plugin sr=Bukkit.getPluginManager().getPlugin("SkinsRestorer");
        state.inflight=true;
        state.nextAttempt=now+RETRY_MS;
        active++;
        UUID uuid=player.getUniqueId();
        if(sr!=null&&sr.isEnabled()){
            ClassLoader loader=sr.getClass().getClassLoader();
            String playerName=player.getName();
            CompletableFuture.supplyAsync(()->SkinsRestorerSkinBridge.readSelectedSkin(
                loader,uuid,playerName)).orTimeout(8,TimeUnit.SECONDS)
                .whenComplete((selected,error)->{
                    try {Bukkit.getScheduler().runTask(plugin,()->{
                        State current=states.get(uuid);
                        if(stopping||current!=state||!player.isOnline()){
                            active=Math.max(0,active-1);return;
                        }
                        Snapshot effective=paper;
                        if(error==null&&selected!=null)
                            effective=new Snapshot(identity.provider(),identity.verifiedId(),
                                identity.authSource(),selected.url(),selected.model(),Instant.now().toString());
                        sendSkin(uuid,state,effective,target,key,force);
                    });}catch(IllegalStateException ignored){/* Server stopping */}
                });
        }else{
            sendSkin(uuid,state,paper,target,key,force);
        }
    }

    private void sendSkin(UUID uuid, State state, Snapshot snapshot,
                          String target,String key,boolean force){
        if(snapshot==null){
            state.inflight=false;
            state.nextAttempt=System.currentTimeMillis()+RETRY_MS;
            deliveryStatus="SKIN_MISSING: belum ada tekstur skin yang diterapkan server";
            active=Math.max(0,active-1);
            return;
        }
        String fingerprint=snapshot.provider()+"|"+snapshot.providerId()+"|"+snapshot.authSource()
            +"|"+snapshot.skinUrl()+"|"+snapshot.model();
        if(fingerprint.equals(state.lastDelivered)&&!force){
            state.inflight=false;
            state.nextAttempt=System.currentTimeMillis()+REFRESH_MS;
            active=Math.max(0,active-1);return;
        }
        try{
            long timestamp=Instant.now().getEpochSecond();
            String nonce=UUID.randomUUID().toString();
            String body=snapshot.json();
            String signature=hmac(key,"POST\n"+ROUTE+"\n"+timestamp+"\n"+nonce+"\n"+body);
            HttpRequest request=HttpRequest.newBuilder(URI.create(target+ROUTE))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type","application/json")
                .header("X-SSC-Timestamp",Long.toString(timestamp))
                .header("X-SSC-Nonce",nonce)
                .header("X-SSC-Signature",signature)
                .header("X-SSC-Server-Id",plugin.pairingServerId())
                .POST(HttpRequest.BodyPublishers.ofString(body,StandardCharsets.UTF_8)).build();
            http.sendAsync(request,HttpResponse.BodyHandlers.discarding())
                .whenComplete((res,err)->{
                    try {Bukkit.getScheduler().runTask(plugin,()->{
                        active=Math.max(0,active-1);
                        State current=states.get(uuid);
                        if(current!=state||stopping)return;
                        current.inflight=false;
                        if(err==null&&res!=null&&res.statusCode()==200){
                            current.lastDelivered=fingerprint;
                            current.nextAttempt=System.currentTimeMillis()+REFRESH_MS;
                            deliveryStatus="SKIN_SYNCED: URL skin server tersimpan di website";
                        }else{
                            int code=res==null?0:res.statusCode();
                            deliveryStatus=code==404?"SKIN_NOT_LINKED: konfirmasi linking akun dari Profile":
                                code==401?"SKIN_AUTH_ERROR: cek secret & jam":
                                code==0?"SKIN_NETWORK_ERROR: Cloudflare belum terhubung":
                                "SKIN_HTTP_"+code+": coba /sscircle sync setelah cek Worker";
                            current.nextAttempt=System.currentTimeMillis()+RETRY_MS;
                        }
                    });}catch(IllegalStateException ignored){/* Paper shutting down */}
                });
        }catch(Exception error){
            state.inflight=false;
            active=Math.max(0,active-1);
            state.nextAttempt=System.currentTimeMillis()+RETRY_MS;
            deliveryStatus="SKIN_NETWORK_ERROR: gagal membuat permintaan";
        }
    }
    private static String hmac(String key,String message)throws Exception{
        Mac mac=Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(
            mac.doFinal(message.getBytes(StandardCharsets.UTF_8)));
    }
}
