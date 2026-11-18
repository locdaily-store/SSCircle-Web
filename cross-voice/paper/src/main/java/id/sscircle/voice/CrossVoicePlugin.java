package id.sscircle.voice;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import de.maxhenkel.voicechat.api.BukkitVoicechatService;
import de.maxhenkel.voicechat.api.Group;
import de.maxhenkel.voicechat.api.VoicechatConnection;
import de.maxhenkel.voicechat.api.VoicechatPlugin;
import de.maxhenkel.voicechat.api.VoicechatServerApi;
import de.maxhenkel.voicechat.api.audiosender.AudioSender;
import de.maxhenkel.voicechat.api.events.EventRegistration;
import de.maxhenkel.voicechat.api.events.MicrophonePacketEvent;
import de.maxhenkel.voicechat.api.events.VoicechatServerStartedEvent;
import de.maxhenkel.voicechat.api.events.VoicechatServerStoppedEvent;
import de.maxhenkel.voicechat.api.opus.OpusDecoder;
import de.maxhenkel.voicechat.api.opus.OpusEncoder;
import org.bukkit.Bukkit;
import org.bukkit.World;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabExecutor;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.geysermc.floodgate.api.FloodgateApi;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Iterator;
import java.util.Base64;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ConcurrentHashMap;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

public final class CrossVoicePlugin extends JavaPlugin implements Listener, TabExecutor {
    private static final String ALPHABET="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private final SecureRandom random=new SecureRandom();
    private final Map<UUID,Settings> settings=new ConcurrentHashMap<>();
    private final Set<UUID> forcedOff=ConcurrentHashMap.newKeySet();
    private final Set<UUID> webConnected=ConcurrentHashMap.newKeySet();
    // Tracks only the SVC connection overrides installed by SSCircle Cross Voice.
    // Never modify a genuine Java voice chat connection or a Bedrock user that has
    // not paired. The gateway's active /ws session is the source of truth.
    private final Set<UUID> svcConnectedOverrides=ConcurrentHashMap.newKeySet();
    private BedrockMicBadges micBadges;
    private final Map<UUID,Long> lastPairing= new ConcurrentHashMap<>();
    private final Map<String,Group> groups=new HashMap<>();
    private ArrayBlockingQueue<Frame> audioQueue=new ArrayBlockingQueue<>(256);
    private final ArrayBlockingQueue<String> outboundPackets=new ArrayBlockingQueue<>(256);
    private final AtomicBoolean sendInFlight=new AtomicBoolean(false);
    private final Map<UUID,JavaBatch> pendingJavaAudio=new LinkedHashMap<>();
    private final AtomicBoolean running=new AtomicBoolean(false);
    private final Map<UUID,OpusDecoder> decoders=new HashMap<>(); // audio worker only
    private final Map<UUID,OpusEncoder> encoders=new HashMap<>(); // audio worker only
    private final Map<UUID,AudioSender> senders=new HashMap<>();  // audio worker only
    private ExecutorService audioWorker;
    private HttpClient http;
    private volatile WebSocket socket;
    private volatile VoicechatServerApi voice;
    private volatile boolean connecting;
    private volatile long dropped,received,sent,lastGatewayWarning;
    private volatile boolean voiceReady;
    private volatile float distance=32f;
    private volatile boolean groupsAllowed=true;

    private static final class Settings {
        volatile boolean muted, deafened, whisper, adminMuted;
        volatile int volume=100;
        volatile String group="";
    }
    private record Frame(UUID uuid,byte[] audio,boolean javaSource,boolean whisper) {}
    private static final class JavaBatch {
        final JsonArray frames=new JsonArray();
        final long created=System.currentTimeMillis();
    }

    @Override public void onEnable(){
        saveDefaultConfig();
        if(!loadSettings()){
            getLogger().severe("Gateway belum dikonfigurasi. Cross Voice dinonaktifkan.");
            Bukkit.getPluginManager().disablePlugin(this);return;
        }
        BukkitVoicechatService service=Bukkit.getServicesManager().load(BukkitVoicechatService.class);
        if(service==null){
            getLogger().severe("Simple Voice Chat BukkitVoicechatService belum tersedia.");
            Bukkit.getPluginManager().disablePlugin(this);return;
        }
        service.registerPlugin(new VoiceHooks());
        micBadges=new BedrockMicBadges(this);
        audioQueue=new ArrayBlockingQueue<>(Math.max(64,Math.min(2048,getConfig().getInt("audio.max-queued-frames",256))));
        http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(6)).build();
        running.set(true);
        audioWorker=Executors.newSingleThreadExecutor(r->{
            Thread t=new Thread(r,"sscircle-cross-voice-audio");
            t.setDaemon(true);return t;
        });
        audioWorker.submit(this::audioLoop);
        Bukkit.getPluginManager().registerEvents(this,this);
        getCommand("voice").setExecutor(this);
        getCommand("voice").setTabCompleter(this);
        getCommand("scvoice").setExecutor(this);
        getCommand("scvoice").setTabCompleter(this);
        int reconnect=Math.max(3,Math.min(30,getConfig().getInt("gateway.reconnect-seconds",5)));
        Bukkit.getScheduler().runTaskTimer(this,this::connect,20,20L*reconnect);
        Bukkit.getScheduler().runTaskTimer(this,this::snapshot,30,5L);
        getLogger().info("Cross Voice aktif. Audio tidak disimpan. /scvoice status.");
    }

    private boolean loadSettings(){
        distance=(float)Math.max(2,Math.min(100,getConfig().getDouble("audio.distance",32)));
        groupsAllowed=getConfig().getBoolean("audio.allow-groups",true);
        String url=getConfig().getString("gateway.websocket-url","");
        String secret=getConfig().getString("gateway.secret","");
        if(secret==null||secret.length()<32||secret.length()>256)return false;
        try{
            URI uri=URI.create(url);
            return ("wss".equals(uri.getScheme())||
                    "ws".equals(uri.getScheme())&&("localhost".equals(uri.getHost())||
                    "127.0.0.1".equals(uri.getHost())))&&
                uri.getUserInfo()==null&&uri.getFragment()==null&&
                "/bridge".equals(uri.getPath());
        }catch(RuntimeException exception){return false;}
    }
    private boolean bedrock(UUID uuid){
        try{return FloodgateApi.getInstance().isFloodgatePlayer(uuid);}
        catch(IllegalStateException|NoClassDefFoundError e){return false;}
    }
    private Settings prefs(UUID uuid){return settings.computeIfAbsent(uuid,k->new Settings());}
    private void tell(CommandSender sender,String text){sender.sendMessage("§b[SSCircle Voice] §f"+text);}

    private void connect(){
        if(!running.get()||connecting||socket!=null)return;
        connecting=true;
        try{
            http.newWebSocketBuilder()
                .connectTimeout(Duration.ofSeconds(8))
                .header("Authorization","Bearer "+getConfig().getString("gateway.secret",""))
                .buildAsync(URI.create(getConfig().getString("gateway.websocket-url")),new SocketListener())
                .whenComplete((ws,error)->{
                    connecting=false;
                    if(error!=null&&running.get()&&
                        System.currentTimeMillis()-lastGatewayWarning>60000L){
                        lastGatewayWarning=System.currentTimeMillis();
                        getLogger().warning("Gateway belum tersambung. Periksa domain WSS, secret, dan firewall.");
                    }
                    else if(error==null)socket=ws;
                });
        }catch(Exception e){connecting=false;getLogger().warning("Alamat WSS gateway tidak dapat digunakan.");}
    }
    private void send(JsonObject packet){
        if(socket==null||!running.get())return;
        String serialized=packet.toString();
        if(serialized.length()>16000||!outboundPackets.offer(serialized)){
            dropped++;return;
        }
        drainPackets();
    }
    private void drainPackets(){
        WebSocket ws=socket;
        if(ws==null||!running.get()||!sendInFlight.compareAndSet(false,true))return;
        String next=outboundPackets.poll();
        if(next==null){sendInFlight.set(false);
            if(!outboundPackets.isEmpty())drainPackets();return;}
        try{
            ws.sendText(next,true).whenComplete((ignored,error)->{
                sendInFlight.set(false);
                if(error!=null){dropped++;outboundPackets.clear();}
                else drainPackets();
            });
        }catch(RuntimeException e){sendInFlight.set(false);dropped++;outboundPackets.clear();}
    }
    private void snapshot(){
        // The native Simple Voice Chat nametag icon follows the active /ws
        // session, not merely a consumed pairing code. Runs on Paper main
        // thread to avoid racing SVC/Bukkit player state.
        syncBedrockVoiceIndicators();
        if(socket==null)return; // Bukkit main thread: positions only, no audio codec.
        JsonObject packet=new JsonObject();packet.addProperty("t","snapshot");
        packet.addProperty("voiceReady",voiceReady);
        JsonArray array=new JsonArray();
        int limit=Math.max(2,Math.min(100,getConfig().getInt("audio.max-player-sessions",50)));
        int count=0;
        VoicechatServerApi api=voice;
        for(Player p:Bukkit.getOnlinePlayers()){
            if(++count>limit)break;
            Settings s=prefs(p.getUniqueId());
            JsonObject item=new JsonObject();
            item.addProperty("uuid",p.getUniqueId().toString());
            item.addProperty("name",p.getName());
            item.addProperty("world",p.getWorld().getUID().toString());
            item.addProperty("x",p.getLocation().getX());
            item.addProperty("y",p.getLocation().getY());
            item.addProperty("z",p.getLocation().getZ());
            item.addProperty("yaw",p.getLocation().getYaw());
            item.addProperty("bedrock",bedrock(p.getUniqueId()));
            item.addProperty("muted",s.muted||s.adminMuted);
            item.addProperty("deafened",s.deafened);
            item.addProperty("whisper",s.whisper);
            item.addProperty("volume",s.volume);
            String group=s.group;
            if(api!=null&&!bedrock(p.getUniqueId())){
                try{
                    VoicechatConnection connection=api.getConnectionOf(p.getUniqueId());
                    if(connection!=null&&connection.getGroup()!=null)
                        group=connection.getGroup().getId().toString();
                }catch(RuntimeException ignored){}
            }
            item.addProperty("group",group);
            array.add(item);
        }
        packet.add("players",array);send(packet);
        JsonObject cfg=new JsonObject();cfg.addProperty("t","config");
        cfg.addProperty("radius",distance);
        cfg.addProperty("whisperRadius",Math.max(2,Math.min(distance,getConfig().getDouble("audio.whisper-distance",8))));
        cfg.addProperty("groupsAllowed",groupsAllowed);
        send(cfg);
    }
    /**
     * Simple Voice Chat 2.6 API explicitly supports marking an unmodded
     * player's connection as connected. This changes its ORIGINAL nametag
     * status icon seen by Java players with Simple Voice Chat installed.
     * Does not edit nickname, scoreboard teams, TAB or client resource packs.
     */
    private void syncBedrockVoiceIndicators(){
        VoicechatServerApi api=voice;
        boolean enabled=getConfig().getBoolean("indicators.bedrock-native-icon",true);
        boolean available=enabled && socket!=null && voiceReady && api!=null;
        boolean showBadge=getConfig().getBoolean("indicators.bedrock-mic-badge",true);
        Set<UUID> badgeOwners=new HashSet<>();
        // The cached SVC connection may reset its flag after reconnect.
        // Re-assert only when it reports disconnected; avoid packet spam.
        for(Player player:Bukkit.getOnlinePlayers()){
            UUID id=player.getUniqueId();
            if(!bedrock(id))continue;
            boolean shouldShow=socket!=null && voiceReady && webConnected.contains(id);
            if(shouldShow && showBadge)badgeOwners.add(id);
            // Native SVC icon is an optional secondary indicator.
            shouldShow=shouldShow && available;
            VoicechatConnection connection=null;
            if(api!=null){
                try{connection=api.getConnectionOf(id);}
                catch(RuntimeException ignored){}
            }
            if(connection==null||connection.isInstalled())continue;
            try{
                if(shouldShow){
                    if(!connection.isConnected())connection.setConnected(true);
                    svcConnectedOverrides.add(id);
                }else if(svcConnectedOverrides.remove(id)){
                    connection.setConnected(false);
                }
            }catch(RuntimeException ignored){
                // SVC is reloading. The next 5-tick sync retries safely.
            }
        }
        // If the player left or Floodgate no longer recognizes them, do not
        // keep stale entries. Quit cleanup attempts to restore the SVC state.
        svcConnectedOverrides.removeIf(id->{
            Player p=Bukkit.getPlayer(id);
            return p==null||!bedrock(id);
        });
        if(micBadges!=null)micBadges.sync(badgeOwners);
    }
    private void resetBedrockVoiceIndicator(UUID id){
        if(!svcConnectedOverrides.remove(id))return;
        VoicechatServerApi api=voice;
        if(api==null)return;
        try{
            VoicechatConnection connection=api.getConnectionOf(id);
            if(connection!=null&&!connection.isInstalled())connection.setConnected(false);
        }catch(RuntimeException ignored){}
    }

    private String pairingCode(){
        StringBuilder b=new StringBuilder(8);
        for(int i=0;i<8;i++)b.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        return b.toString();
    }
    private void link(CommandSender sender){
        if(!(sender instanceof Player player)){tell(sender,"Gunakan perintah ini di Minecraft.");return;}
        if(!bedrock(player.getUniqueId())){tell(sender,"Java cukup memakai mod Simple Voice Chat.");return;}
        if(socket==null||!voiceReady){tell(sender,"Gateway atau Simple Voice Chat belum siap. Coba lagi.");return;}
        long clock=System.currentTimeMillis();
        Long previous=lastPairing.get(player.getUniqueId());
        if(previous!=null&&clock-previous<10000L){
            tell(sender,"Tunggu 10 detik sebelum meminta kode pairing baru.");return;
        }
        lastPairing.put(player.getUniqueId(),clock);
        String code=pairingCode();
        JsonObject msg=new JsonObject();msg.addProperty("t","code");
        msg.addProperty("code",code);msg.addProperty("uuid",player.getUniqueId().toString());
        int ttl=Math.max(30,Math.min(180,getConfig().getInt("security.pairing-expiry-seconds",120)));
        msg.addProperty("expires",clock+ttl*1000L);
        send(msg);
        tell(sender,"Kode SSCircle Voice: §e"+code+"§f (berlaku "+ttl+" detik, sekali pakai).");
        tell(sender,"Buka halaman SSCircle Voice pada browser, masukkan kode, lalu aktifkan mikrofon.");
    }
    @EventHandler public void quit(PlayerQuitEvent e){
        UUID id=e.getPlayer().getUniqueId();
        settings.remove(id);forcedOff.remove(id);webConnected.remove(id);lastPairing.remove(id);
        resetBedrockVoiceIndicator(id);
        if(micBadges!=null)micBadges.remove(id);
        JsonObject m=new JsonObject();m.addProperty("t","kick");m.addProperty("uuid",id.toString());send(m);
        // The audio worker owns all codec instances.
        audioWorker.submit(()->closeCodec(id));
    }
    private void closeCodec(UUID id){
        OpusDecoder decoder=decoders.remove(id);if(decoder!=null)decoder.close();
        OpusEncoder encoder=encoders.remove(id);if(encoder!=null)encoder.close();
        AudioSender sender=senders.remove(id);
        if(sender!=null&&voice!=null){sender.reset();voice.unregisterAudioSender(sender);}
    }

    private final class VoiceHooks implements VoicechatPlugin {
        @Override public String getPluginId(){return "sscircle_cross_voice";}
        @Override public void registerEvents(EventRegistration events){
            events.registerEvent(VoicechatServerStartedEvent.class,event->{
                voice=event.getVoicechat();voiceReady=true;
            });
            events.registerEvent(VoicechatServerStoppedEvent.class,event->{
                voiceReady=false;voice=null;
                svcConnectedOverrides.clear(); // SVC restart discards override state.
                // A restarted SVC server invalidates codec history and senders.
                if(audioWorker!=null)audioWorker.submit(()->{
                    for(UUID uuid:new ArrayList<>(senders.keySet()))closeCodec(uuid);
                    for(OpusDecoder d:decoders.values())d.close();
                    for(OpusEncoder e:encoders.values())e.close();
                    decoders.clear();encoders.clear();senders.clear();
                });
            });
            events.registerEvent(MicrophonePacketEvent.class,event->{
                if(event.getSenderConnection()==null||!running.get())return;
                UUID id=event.getSenderConnection().getPlayer().getUuid();
                if(bedrock(id))return; // Don't echo injected Bedrock audio back into itself.
                if(forcedOff.contains(id)||prefs(id).adminMuted){
                    if(event.isCancellable())event.cancel();
                    return;
                }
                byte[] encoded=event.getPacket().getOpusEncodedData();
                if(encoded==null||encoded.length==0||encoded.length>2048)return;
                if(!audioQueue.offer(new Frame(id,encoded.clone(),true,event.getPacket().isWhispering())))
                    dropped++;
            });
        }
    }
    private void audioLoop(){
        while(running.get()){
            try{
                Frame frame=audioQueue.poll(20,TimeUnit.MILLISECONDS);
                flushStaleJavaBatches();
                if(frame==null)continue;
                VoicechatServerApi api=voice;
                if(api==null)continue;
                if(frame.javaSource()){
                    // Encoded native Java Opus -> PCM -> Bedrock browser. One decoder
                    // per sender preserves codec history; no blocking work on main tick.
                    OpusDecoder decoder=decoders.computeIfAbsent(frame.uuid(),k->api.createDecoder());
                    short[] samples=decoder.decode(frame.audio());
                    if(samples==null||samples.length<960)continue;
                    for(int start=0;start+960<=samples.length;start+=960){
                        short[] chunk=java.util.Arrays.copyOfRange(samples,start,start+960);
                        JavaBatch batch=pendingJavaAudio.computeIfAbsent(frame.uuid(),k->new JavaBatch());
                        JsonObject item=new JsonObject();
                        item.addProperty("pcm",Base64.getEncoder().encodeToString(toBytes(chunk)));
                        item.addProperty("whisper",frame.whisper());
                        batch.frames.add(item);
                        if(batch.frames.size()>=3){sendJavaBatch(frame.uuid(),batch);pendingJavaAudio.remove(frame.uuid());}
                        sent++;
                    }
                }else{
                    // Bedrock browser PCM -> Opus -> official AudioSender.
                    VoicechatConnection connection=api.getConnectionOf(frame.uuid());
                    if(connection==null||connection.isInstalled())continue;
                    AudioSender sender=senders.get(frame.uuid());
                    if(sender==null){
                        sender=api.createAudioSender(connection);
                        if(!api.registerAudioSender(sender))continue;
                        senders.put(frame.uuid(),sender);
                    }
                    if(!sender.canSend())continue;
                    OpusEncoder encoder=encoders.computeIfAbsent(frame.uuid(),k->api.createEncoder());
                    sender.whispering(frame.whisper());
                    sender.send(encoder.encode(toShorts(frame.audio())));
                    received++;
                }
            }catch(InterruptedException e){Thread.currentThread().interrupt();break;}
            catch(Exception e){dropped++;}
        }
    }
    private void sendJavaBatch(UUID uuid,JavaBatch batch){
        if(batch.frames.isEmpty())return;
        JsonObject out=new JsonObject();out.addProperty("t","audioBatch");
        out.addProperty("uuid",uuid.toString());out.add("frames",batch.frames);
        send(out);
    }
    private void flushStaleJavaBatches(){
        long current=System.currentTimeMillis();
        Iterator<Map.Entry<UUID,JavaBatch>> iterator=pendingJavaAudio.entrySet().iterator();
        while(iterator.hasNext()){
            Map.Entry<UUID,JavaBatch> entry=iterator.next();
            if(current-entry.getValue().created>=60){
                sendJavaBatch(entry.getKey(),entry.getValue());iterator.remove();
            }
        }
    }
    private static byte[] toBytes(short[] data){
        ByteBuffer b=ByteBuffer.allocate(data.length*2).order(ByteOrder.LITTLE_ENDIAN);
        for(short s:data)b.putShort(s);return b.array();
    }
    private static short[] toShorts(byte[] data){
        ByteBuffer b=ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN);
        short[] out=new short[data.length/2];for(int i=0;i<out.length;i++)out[i]=b.getShort();return out;
    }
    private void inbound(JsonObject msg){
        if(!msg.has("t"))return;
        switch(msg.get("t").getAsString()){
            case "audio", "audioBatch" -> {
                try{
                    UUID uuid=UUID.fromString(msg.get("uuid").getAsString());
                    if(!bedrock(uuid))return;
                    Settings pref=settings.get(uuid);
                    if(pref!=null&&(pref.muted||pref.adminMuted))return;
                    JsonArray frames=msg.get("t").getAsString().equals("audio")
                        ?new JsonArray():msg.getAsJsonArray("frames");
                    if(msg.get("t").getAsString().equals("audio"))frames.add(msg);
                    if(frames==null||frames.isEmpty()||frames.size()>4)return;
                    for(var element:frames){
                        JsonObject item=element.getAsJsonObject();
                        String b64=item.get("pcm").getAsString();
                        if(b64.length()!=2560)return;
                        byte[] pcm=Base64.getDecoder().decode(b64);
                        if(pcm.length!=1920)return;
                        boolean whisper=item.has("whisper")&&item.get("whisper").getAsBoolean();
                        if(!audioQueue.offer(new Frame(uuid,pcm,false,whisper)))dropped++;
                    }
                }catch(Exception ignored){dropped++;}
            }
            case "session" -> {
                try{
                    UUID uuid=UUID.fromString(msg.get("uuid").getAsString());
                    if(msg.has("connected")&&msg.get("connected").getAsBoolean())webConnected.add(uuid);
                    else webConnected.remove(uuid);
                }catch(RuntimeException ignored){}
            }
            case "control" -> {
                if(!isEnabled())return;
                Bukkit.getScheduler().runTask(this,()->{
                try{
                    UUID uuid=UUID.fromString(msg.get("uuid").getAsString());
                    Player player=Bukkit.getPlayer(uuid);
                    if(player==null||!bedrock(uuid))return;
                    String action=msg.get("action").getAsString();
                    String value=msg.has("value")?msg.get("value").getAsString():"";
                    apply(player,action,value);
                }catch(Exception ignored){}
                });
            }
            default -> {}
        }
    }
    private void apply(Player player,String action,String value){
        Settings s=prefs(player.getUniqueId());
        switch(action){
            case "mute" -> s.muted=true;
            case "unmute" -> s.muted=false;
            case "deafen" -> s.deafened=true;
            case "undeafen" -> s.deafened=false;
            case "whisper" -> s.whisper=true;
            case "normal" -> s.whisper=false;
            case "volume" -> {
                try{s.volume=Math.max(0,Math.min(200,Integer.parseInt(value)));}catch(NumberFormatException ignored){}
            }
            case "group" -> {
                if(!groupsAllowed||!player.hasPermission("sscircle.voice.group"))return;
                if(value.matches("[A-Za-z0-9_-]{1,24}")){
                    // One named SVC group shared with Java users using voicechat group selection.
                    VoicechatServerApi api=voice;
                    if(api==null)return;
                    Group group=groups.get(value);
                    if(group==null){
                        group=api.getGroups().stream().filter(g->g.getName().equals(value)
                            &&!g.hasPassword()).findFirst().orElse(null);
                        if(group==null){
                            if(groups.size()>=32)return; // Prevent unbounded server group creation.
                            group=api.groupBuilder().setName(value).build();
                        }
                        groups.put(value,group);
                    }
                    if(group.hasPassword())return; // Private groups require SVC authentication.
                    VoicechatConnection connection=api.getConnectionOf(player.getUniqueId());
                    if(connection!=null)connection.setGroup(group);
                    s.group=group.getId().toString();
                }
            }
            case "leave-group" -> {
                VoicechatServerApi api=voice;
                if(api!=null){
                    VoicechatConnection conn=api.getConnectionOf(player.getUniqueId());
                    if(conn!=null)conn.setGroup(null);
                }
                s.group="";
            }
            default -> {}
        }
        snapshot();
    }
    private final class SocketListener implements WebSocket.Listener {
        private final StringBuilder buffer=new StringBuilder();
        @Override public void onOpen(WebSocket ws){
            outboundPackets.clear();sendInFlight.set(false);
            socket=ws;ws.request(1);
            if(isEnabled())Bukkit.getScheduler().runTask(CrossVoicePlugin.this,()->snapshot());
        }
        @Override public CompletionStage<?> onText(WebSocket ws,CharSequence data,boolean last){
            synchronized(buffer){
                if(buffer.length()+data.length()>16384){buffer.setLength(0);ws.request(1);return null;}
                buffer.append(data);
                if(last){
                    try{inbound(JsonParser.parseString(buffer.toString()).getAsJsonObject());}
                    catch(Exception ignored){}
                    buffer.setLength(0);
                }
            }
            ws.request(1);return null;
        }
        @Override public CompletionStage<?> onClose(WebSocket ws,int code,String reason){
            if(socket==ws){socket=null;webConnected.clear();}connecting=false;return null;
        }
        @Override public void onError(WebSocket ws,Throwable error){
            if(socket==ws){socket=null;webConnected.clear();}connecting=false;
        }
    }
    @Override public boolean onCommand(CommandSender sender,Command cmd,String label,String[] args){
        boolean admin=cmd.getName().equalsIgnoreCase("scvoice");
        String action=args.length==0?"help":args[0].toLowerCase(Locale.ROOT);
        if(admin){
            if(!sender.hasPermission("sscircle.voice.admin")){tell(sender,"Khusus admin.");return true;}
            if(action.equals("status")){
                tell(sender,"Gateway "+(socket==null?"OFFLINE":"TERHUBUNG")+
                    ", Simple Voice Chat "+(voiceReady?"READY":"BELUM SIAP")+
                    ", antrean audio "+audioQueue.size()+
                    ", Java→Web "+sent+", Web→Java "+received+", dropped "+dropped+
                    ", mic badges "+(micBadges==null?0:micBadges.count()));return true;
            }
            if(action.equals("inspect")&&args.length>=2){
                Player p=Bukkit.getPlayerExact(args[1]);
                if(p==null){tell(sender,"Pemain tidak online.");return true;}
                Settings s=prefs(p.getUniqueId());
                tell(sender,p.getName()+" | Web voice="+(webConnected.contains(p.getUniqueId())?"ONLINE":"OFFLINE")+
                    " | Bedrock="+bedrock(p.getUniqueId())+
                    " | muted="+(s.muted||s.adminMuted)+" | deafen="+s.deafened+
                    " | group="+(s.group.isEmpty()?"proximity":s.group));return true;
            }
            if(List.of("mute","unmute","kick").contains(action)&&args.length>=2){
                String perm=action.equals("kick")?"sscircle.voice.admin.disconnect":"sscircle.voice.admin.mute";
                if(!sender.hasPermission(perm)){tell(sender,"Tidak punya izin "+perm);return true;}
                Player target=Bukkit.getPlayerExact(args[1]);
                if(target==null){tell(sender,"Pemain tidak online.");return true;}
                if(action.equals("kick")){
                    forcedOff.add(target.getUniqueId());
                    JsonObject msg=new JsonObject();msg.addProperty("t","kick");
                    msg.addProperty("uuid",target.getUniqueId().toString());send(msg);
                }else {
                    if(action.equals("unmute"))forcedOff.remove(target.getUniqueId());
                    prefs(target.getUniqueId()).adminMuted=action.equals("mute");
                }
                snapshot();tell(sender,"Perintah "+action+" untuk "+target.getName()+" diterapkan.");return true;
            }
            if((action.equals("distance")||action.equals("groups")||action.equals("reload"))&&
                sender.hasPermission(action.equals("reload")?"sscircle.voice.admin.reload":"sscircle.voice.admin.configure")){
                if(action.equals("reload")){
                    reloadConfig();
                    if(loadSettings()){
                        WebSocket old=socket;socket=null;connecting=false;
                        if(old!=null)old.abort();
                        connect();
                        tell(sender,"Konfigurasi dimuat ulang; gateway sedang dihubungkan kembali.");
                    }else tell(sender,"Konfigurasi gateway salah. Periksa file.");
                }
                if(action.equals("distance")&&args.length>=2)try{
                    distance=(float)Math.max(2,Math.min(100,Double.parseDouble(args[1])));
                    tell(sender,"Jarak Cross Voice diatur: "+distance);
                }catch(NumberFormatException e){tell(sender,"Masukkan angka 2 sampai 100.");}
                if(action.equals("groups")&&args.length>=2){
                    groupsAllowed=args[1].equalsIgnoreCase("on");tell(sender,"Group "+(groupsAllowed?"AKTIF":"NONAKTIF"));
                    if(!groupsAllowed)for(Player p:Bukkit.getOnlinePlayers())
                        if(bedrock(p.getUniqueId()))apply(p,"leave-group","");
                }
                return true;
            }
            tell(sender,"/scvoice status | inspect <pemain> | mute/unmute/kick <pemain> | distance <angka> | groups on/off | reload");
            return true;
        }
        if(!(sender instanceof Player player)){tell(sender,"Gunakan perintah ini dalam Minecraft.");return true;}
        if(action.equals("link")){link(sender);return true;}
        if(!bedrock(player.getUniqueId())){
            tell(sender,"Untuk Java gunakan menu mod Simple Voice Chat. Perintah ini mengatur web Bedrock.");
            return true;
        }
        if(action.equals("status")){
            tell(sender,"Gateway "+(socket!=null?"terhubung":"offline")+
                "; Simple Voice Chat "+(voiceReady?"aktif":"tidak tersedia")+
                "; Bedrock "+bedrock(player.getUniqueId())+
                "; Web Voice "+(webConnected.contains(player.getUniqueId())?"CONNECTED":"NOT CONNECTED"));return true;
        }
        if(List.of("mute","unmute","deafen","undeafen","whisper","normal").contains(action)){
            apply(player,action,"");tell(sender,"Pengaturan "+action+" disimpan.");return true;
        }
        if(action.equals("volume")&&args.length>=2){
            apply(player,action,args[1]);tell(sender,"Volume penerimaan "+prefs(player.getUniqueId()).volume+"%.");return true;
        }
        if(action.equals("group")){
            if(args.length>1){apply(player,args[1].equalsIgnoreCase("leave")?"leave-group":"group",args[1]);}
            tell(sender,"Group: "+(prefs(player.getUniqueId()).group.isBlank()?"proximity":prefs(player.getUniqueId()).group));return true;
        }
        if(action.equals("disconnect")){
            JsonObject msg=new JsonObject();msg.addProperty("t","kick");
            msg.addProperty("uuid",player.getUniqueId().toString());send(msg);
            tell(sender,"Sesi web diputuskan.");return true;
        }
        tell(sender,"/voice link | status | mute | unmute | deafen | undeafen | whisper | normal | volume <0..200> | group <nama|leave> | disconnect");
        return true;
    }
    @Override public List<String> onTabComplete(CommandSender sender,Command command,String alias,String[] args){
        if(args.length==1){
            List<String> words=command.getName().equalsIgnoreCase("scvoice")
                ?List.of("status","inspect","mute","unmute","kick","distance","groups","reload")
                :List.of("link","status","mute","unmute","deafen","undeafen","whisper",
                    "normal","volume","group","disconnect");
            return words.stream().filter(x->x.startsWith(args[0].toLowerCase(Locale.ROOT))).toList();
        }
        if(args.length==2&&command.getName().equalsIgnoreCase("scvoice")&&
            List.of("inspect","mute","unmute","kick").contains(args[0].toLowerCase(Locale.ROOT))){
            return Bukkit.getOnlinePlayers().stream().map(Player::getName)
                .filter(x->x.toLowerCase(Locale.ROOT).startsWith(args[1].toLowerCase(Locale.ROOT)))
                .limit(20).toList();
        }
        return List.of();
    }
    @Override public void onDisable(){
        running.set(false);
        Bukkit.getScheduler().cancelTasks(this);
        for(UUID uuid:new ArrayList<>(svcConnectedOverrides))resetBedrockVoiceIndicator(uuid);
        if(micBadges!=null){micBadges.clear();micBadges=null;}
        WebSocket ws=socket;if(ws!=null)ws.abort();socket=null;
        if(audioWorker!=null){
            audioWorker.shutdownNow();
            try{audioWorker.awaitTermination(2,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}
        }
        for(UUID uuid:new ArrayList<>(senders.keySet()))closeCodec(uuid);
        for(OpusDecoder decoder:decoders.values())decoder.close();
        for(OpusEncoder encoder:encoders.values())encoder.close();
        decoders.clear();encoders.clear();senders.clear();settings.clear();forcedOff.clear();webConnected.clear();svcConnectedOverrides.clear();lastPairing.clear();groups.clear();audioQueue.clear();outboundPackets.clear();pendingJavaAudio.clear();
    }
}
