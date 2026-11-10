package id.sscircle.skin;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.profile.PlayerTextures;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.URI;
import java.io.InputStream;
import java.io.IOException;
import java.net.URL;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.Set;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads server-applied skins, using an authenticated identity resolved by SSCircle
 * Player Sync. Skins are cosmetic: never derive identities from skin, name, or URL.
 * No blocking network/storage lookup runs on the Paper primary thread.
 */
final class SkinPublisher {
    record Identity(String provider, String providerId, String authSource) {}
    record Skin(String hash, String model, String source) {}
    private record SkinLookup(Skin skin, String failure) {}
    private record State(String code, Instant at) {}
    private record Confirmation(String fingerprint,Instant at) {}

    private static final String PATH="/api/minecraft/skin/sync";
    private static final Pattern HASH=Pattern.compile("^https?://textures\\.minecraft\\.net/texture/([a-fA-F0-9]{32,128})$");
    private static final Pattern RESULT_CODE=Pattern.compile("\\\"code\\\"\\s*:\\s*\\\"([A-Z_]{4,40})\\\"");
    private static final int MAX_ACTIVE=2;
    private static final int MAX_IMAGE_BYTES=131072;
    private static final int MAX_JOIN_RETRIES=20;
    private static final Duration CONFIRM_TTL=Duration.ofMinutes(25);

    private final JavaPlugin plugin;
    private final HttpClient http;
    private final Function<Player, Identity> identity;
    private final Supplier<String> endpoint,secret;
    private final Map<UUID,Confirmation> confirmed=new ConcurrentHashMap<>();
    private final Set<UUID> inFlight=ConcurrentHashMap.newKeySet();
    private final Map<UUID,State> states=new ConcurrentHashMap<>();
    private final AtomicInteger active=new AtomicInteger();
    private volatile String lastDelivery="Belum ada pengiriman";
    private volatile Instant lastSuccess=null;
    private int task=-1;

    SkinPublisher(JavaPlugin plugin,HttpClient http,Function<Player,Identity> identity,
                  Supplier<String> endpoint,Supplier<String> secret){
        this.plugin=plugin;this.http=http;this.identity=identity;
        this.endpoint=endpoint;this.secret=secret;
    }

    void start(){
        if(!plugin.getConfig().getBoolean("skin-sync.enabled",true))return;
        long interval=Math.max(60,plugin.getConfig().getLong("skin-sync.interval-seconds",300));
        task=Bukkit.getScheduler().runTaskTimer(plugin,()->scheduleOnline(false),120L,interval*20L).getTaskId();
    }
    void stop(){
        if(task!=-1)Bukkit.getScheduler().cancelTask(task);
        confirmed.clear();states.clear();inFlight.clear();
    }
    void afterJoin(Player player){
        if(!plugin.getConfig().getBoolean("skin-sync.enabled",true))return;
        UUID uuid=player.getUniqueId();
        // Skin and AuthMe verification can complete in either order. Start after
        // the join settles and retry automatically until *the image* is in D1.
        scheduleRetry(uuid,0,100L);
    }
    void afterQuit(UUID uuid){confirmed.remove(uuid);states.remove(uuid);}
    void forceAll(){scheduleOnline(true);}
    void forcePlayer(Player player){confirmed.remove(player.getUniqueId());capture(player,true,0);}
    private void scheduleRetry(UUID uuid,int next,long ticks){
        if(next>MAX_JOIN_RETRIES||!plugin.isEnabled())return;
        Bukkit.getScheduler().runTaskLater(plugin,()->{
            Player online=Bukkit.getPlayer(uuid);
            if(online!=null&&online.isOnline())capture(online,false,next);
        },ticks);
    }
    private void retry(UUID uuid,int attempt){
        if(attempt>=MAX_JOIN_RETRIES)return;
        // Back off to one retry per minute, without waiting 5 minutes after AuthMe.
        long ticks=Math.min(1200L,100L<<Math.min(attempt,4));
        scheduleRetry(uuid,attempt+1,ticks);
    }
    String statusFor(UUID uuid){
        State state=states.get(uuid);
        return state==null?"BELUM_DICOBA":state.code()+" ("+state.at()+")";
    }
    String lastDelivery(){return lastDelivery;}
    String lastSuccess(){return lastSuccess==null?"BELUM ADA":lastSuccess.toString();}
    int activeLookups(){return active.get();}

    /** Invoke only on the primary thread. Spread capture to avoid TPS spikes. */
    private void scheduleOnline(boolean force){
        if(!plugin.getConfig().getBoolean("skin-sync.enabled",true))return;
        int index=0;
        for(Player player:Bukkit.getOnlinePlayers()){
            UUID uuid=player.getUniqueId();
            Bukkit.getScheduler().runTaskLater(plugin,()->{
                Player online=Bukkit.getPlayer(uuid);
                if(online!=null&&online.isOnline())capture(online,force,0);
            },index++*20L);
        }
    }
    private void mark(UUID uuid,String code){states.put(uuid,new State(code,Instant.now()));lastDelivery=code;}

    private void capture(Player player,boolean force,int attempt){
        if(!plugin.getConfig().getBoolean("skin-sync.enabled",true)){
            mark(player.getUniqueId(),"DISABLED_CONFIG");return;
        }
        if(!player.isOnline())return;
        final UUID uuid=player.getUniqueId();
        if(inFlight.contains(uuid))return;
        Identity auth=identity.apply(player); // Paper main thread only.
        if(auth==null){mark(uuid,"LOGIN_BELUM_TERVERIFIKASI");retry(uuid,attempt);return;}
        final String base=endpoint.get(),key=secret.get();
        if(base==null||!base.startsWith("https://")||key==null||key.length()<32){
            mark(uuid,"ENDPOINT_ATAU_SECRET_BELUM_VALID");retry(uuid,attempt);return;
        }
        if(active.get()>=MAX_ACTIVE){mark(uuid,"ANTREAN_SKIN");retry(uuid,attempt);return;}
        String username=player.getName();
        Skin paper=paperSkin(player); // Paper API captured only on main thread.
        Plugin sr=Bukkit.getPluginManager().getPlugin("SkinsRestorer");
        boolean srAvailable=sr!=null&&sr.isEnabled();
        if(!inFlight.add(uuid))return;
        if(active.incrementAndGet()>MAX_ACTIVE){
            active.decrementAndGet();inFlight.remove(uuid);mark(uuid,"ANTREAN_SKIN");retry(uuid,attempt);return;
        }
        mark(uuid,"MEMERIKSA_SKIN_SERVER");
        Bukkit.getScheduler().runTaskAsynchronously(plugin,()->{
            boolean delivered=false;
            try{
                SkinLookup match=srAvailable?skinsRestorerSkin(sr,uuid,username,auth):
                    new SkinLookup(null,"SKINSRESTORER_TIDAK_TERPASANG");
                Skin skin=match.skin()!=null?match.skin():paper;
                if(skin==null){
                    mark(uuid,match.failure()+" | PAPER_TIDAK_MEMILIKI_TEKSTUR");
                }else{
                    String fingerprint=auth.provider()+"|"+auth.providerId()+"|"+skin.hash()+"|"+skin.model();
                    Confirmation known=confirmed.get(uuid);
                    if(!force&&known!=null&&fingerprint.equals(known.fingerprint())
                        &&Duration.between(known.at(),Instant.now()).compareTo(CONFIRM_TTL)<0){
                        mark(uuid,"SKIN_GAMBAR_SUDAH_TERSIMPAN_DI_D1");delivered=true;
                    }else{
                        byte[] png=downloadSkin(skin.hash());
                        mark(uuid,png!=null?"MENGIRIM_PNG_KE_D1":"MENGIRIM_HASH_CADANGAN");
                        delivered=send(base,key,auth,skin,png,uuid,fingerprint);
                    }
                }
            }catch(RuntimeException failure){
                mark(uuid,"SKIN_CAPTURE_ERROR_"+failure.getClass().getSimpleName().toUpperCase());
            }finally{
                active.decrementAndGet();inFlight.remove(uuid);
                if(!delivered)retry(uuid,attempt);
            }
        });
    }

    /** Fetch from a fixed allowlisted Mojang endpoint, never a user-controlled URL. */
    private byte[] downloadSkin(String hash){
        try{
            HttpRequest request=HttpRequest.newBuilder(
                URI.create("https://textures.minecraft.net/texture/"+hash))
                .timeout(Duration.ofSeconds(8)).header("Accept","image/png").GET().build();
            HttpResponse<InputStream> result=http.send(request,HttpResponse.BodyHandlers.ofInputStream());
            try(InputStream stream=result.body()){
                if(result.statusCode()!=200)return null;
                byte[] bytes=stream.readNBytes(MAX_IMAGE_BYTES+1);
                if(bytes.length<67||bytes.length>MAX_IMAGE_BYTES||!validPng(bytes))return null;
                return bytes;
            }
        }catch(IOException | InterruptedException | IllegalArgumentException failure){
            if(failure instanceof InterruptedException)Thread.currentThread().interrupt();
            return null;
        }
    }
    static boolean validPng(byte[] bytes){
        if(bytes==null||bytes.length<67||bytes.length>MAX_IMAGE_BYTES)return false;
        int[] signature={137,80,78,71,13,10,26,10};
        for(int i=0;i<signature.length;i++)if((bytes[i]&255)!=signature[i])return false;
        if(bytes[12]!='I'||bytes[13]!='H'||bytes[14]!='D'||bytes[15]!='R')return false;
        int width=((bytes[16]&255)<<24)|((bytes[17]&255)<<16)|((bytes[18]&255)<<8)|(bytes[19]&255);
        int height=((bytes[20]&255)<<24)|((bytes[21]&255)<<16)|((bytes[22]&255)<<8)|(bytes[23]&255);
        if(width!=64||(height!=32&&height!=64))return false;
        int[] end={73,69,78,68,174,66,96,130};
        for(int i=0;i<8;i++)if((bytes[bytes.length-8+i]&255)!=end[i])return false;
        return true;
    }
    private Skin paperSkin(Player player){
        try{
            PlayerTextures textures=player.getPlayerProfile().getTextures();
            URL url=textures.getSkin();
            String hash=hashFor(url==null?null:url.toString());
            if(hash==null)return null;
            String model="slim".equalsIgnoreCase(textures.getSkinModel().name())?"slim":"classic";
            return new Skin(hash,model,"paper-profile");
        }catch(RuntimeException|LinkageError ignored){return null;}
    }

    /** SkinsRestorer 15.x official API: saved selection first, resolved join skin second. */
    private SkinLookup skinsRestorerSkin(Plugin sr,UUID uuid,String username,Identity auth){
        if(sr==null)return new SkinLookup(null,"SKINSRESTORER_TIDAK_TERPASANG");
        try{
            ClassLoader loader=sr.getClass().getClassLoader();
            Class<?> provider=Class.forName("net.skinsrestorer.api.SkinsRestorerProvider",true,loader);
            Object api=provider.getMethod("get").invoke(null);
            Class<?> contract=Class.forName("net.skinsrestorer.api.SkinsRestorer",true,loader);
            Object storage=contract.getMethod("getPlayerStorage").invoke(api);
            Class<?> store=Class.forName("net.skinsrestorer.api.storage.PlayerStorage",true,loader);
            Object property=null;
            try{
                Object selected=store.getMethod("getSkinOfPlayer",UUID.class).invoke(storage,uuid);
                if(selected instanceof Optional<?> opt)property=opt.orElse(null);
            }catch(NoSuchMethodException ignored) { /* older SR 15.x */ }
            if(property==null){
                // Correct per-session premium hint only; never resolve skin from a user-chosen nickname.
                boolean premium="java_premium".equals(auth.provider())
                    ||"fastlogin-premium".equals(auth.authSource());
                Object resolved=store.getMethod("getSkinForPlayer",UUID.class,String.class,boolean.class)
                    .invoke(storage,uuid,username,premium);
                if(resolved instanceof Optional<?> opt)property=opt.orElse(null);
            }
            if(property==null)return new SkinLookup(null,"SKINSRESTORER_BELUM_MEMILIKI_SKIN");
            Class<?> propertyClass=Class.forName("net.skinsrestorer.api.property.SkinProperty",true,loader);
            Class<?> utils=Class.forName("net.skinsrestorer.api.PropertyUtils",true,loader);
            String hash=hashFor(String.valueOf(utils.getMethod("getSkinTextureUrl",propertyClass)
                .invoke(null,property)));
            if(hash==null)return new SkinLookup(null,"SKINSRESTORER_URL_TEKSTUR_TIDAK_VALID");
            Object variant=utils.getMethod("getSkinVariant",propertyClass).invoke(null,property);
            String model="SLIM".equalsIgnoreCase(String.valueOf(variant))?"slim":"classic";
            return new SkinLookup(new Skin(hash,model,"skinsrestorer"),"");
        }catch(InvocationTargetException failure){
            // Storage may be offline or still resolving a skin. The cause is not logged to avoid leaking URLs.
            return new SkinLookup(null,"SKINSRESTORER_GAGAL_MENGAMBIL_DATA");
        }catch(ReflectiveOperationException|IllegalArgumentException|LinkageError failure){
            return new SkinLookup(null,"SKINSRESTORER_API_TIDAK_KOMPATIBEL");
        }
    }

    static String hashFor(String url){
        Matcher matcher=HASH.matcher(url==null?"":url);
        return matcher.matches()?matcher.group(1).toLowerCase(java.util.Locale.ROOT):null;
    }

    /** Runs exclusively inside the Bukkit async task. A 200 must prove PNG stored. */
    private boolean send(String base,String key,Identity auth,Skin skin,byte[] png,UUID uuid,String fingerprint){
        try{
            String captured=Instant.now().toString();
            String body="{\"provider\":\""+auth.provider()+"\",\"providerId\":\""+auth.providerId()
                +"\",\"authSource\":\""+auth.authSource()+"\",\"textureHash\":\""+skin.hash()
                +"\",\"model\":\""+skin.model()+"\",\"source\":\""+skin.source()
                +"\",\"capturedAt\":\""+captured+"\"";
            if(png!=null)body+=",\"skinPngBase64\":\""+Base64.getEncoder().encodeToString(png)+"\"";
            body+="}";
            long timestamp=Instant.now().getEpochSecond();
            String nonce=UUID.randomUUID().toString();
            Mac mac=Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
            String signature=Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(
                ("POST\n"+PATH+"\n"+timestamp+"\n"+nonce+"\n"+body).getBytes(StandardCharsets.UTF_8)));
            HttpRequest request=HttpRequest.newBuilder(URI.create(base+PATH))
                .timeout(Duration.ofSeconds(12)).header("Content-Type","application/json")
                .header("X-SSC-Timestamp",Long.toString(timestamp))
                .header("X-SSC-Nonce",nonce).header("X-SSC-Signature",signature)
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
            HttpResponse<String> response=http.send(request,HttpResponse.BodyHandlers.ofString());
            int statusCode=response.statusCode();
            if(statusCode==200&&png!=null&&response.body().matches("(?s).*\"imageStored\"\\s*:\\s*true.*")){
                confirmed.put(uuid,new Confirmation(fingerprint,Instant.now()));
                lastSuccess=Instant.now();mark(uuid,"SKIN_GAMBAR_TERSIMPAN_HTTP_200");return true;
            }
            if(statusCode==200){
                mark(uuid,png==null?"HASH_SAJA_HTTP_200_PNG_GAGAL_DIUNDUH":
                    "WORKER_BELUM_SUPPORT_SIMPAN_PNG");
                return false;
            }
            String status="HTTP_"+statusCode;
            Matcher code=RESULT_CODE.matcher(response.body().length()>1500
                ?response.body().substring(0,1500):response.body());
            if(code.find())status+="_"+code.group(1);
            mark(uuid,status);return false;
        }catch(InterruptedException failure){
            Thread.currentThread().interrupt();mark(uuid,"PENGIRIMAN_TERPUTUS");return false;
        }catch(Exception exception){
            mark(uuid,"PENGIRIMAN_GAGAL_"+exception.getClass().getSimpleName().toUpperCase());
            return false;
        }
    }
}
