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
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public final class CrossVoicePlugin extends JavaPlugin implements Listener, TabExecutor {
    private static final String ALPHABET="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private final SecureRandom random=new SecureRandom();
    private final Map<UUID,Settings> settings=new HashMap<>();
    private final Map<String,Group> groups=new HashMap<>();
    private final ArrayBlockingQueue<Frame> audioQueue=new ArrayBlockingQueue<>(256);
    private final AtomicBoolean running=new AtomicBoolean(false);
    private final Map<UUID,OpusDecoder> decoders=new HashMap<>(); // audio worker only
    private final Map<UUID,OpusEncoder> encoders=new HashMap<>(); // audio worker only
    private final Map<UUID,AudioSender> senders=new HashMap<>();  // audio worker only
    private ExecutorService audioWorker;
    private HttpClient http;
    private volatile WebSocket socket;
    private volatile VoicechatServerApi voice;
    private volatile boolean connecting;
    private volatile long dropped,received,sent;
    private volatile boolean voiceReady;
    private volatile float distance=32f;
    private volatile boolean groupsAllowed=true;

    private static final class Settings {
        boolean muted, deafened, whisper, adminMuted;
        int volume=100;
        String group="";
    }
    private record Frame(UUID uuid,byte[] audio,boolean javaSource,boolean whisper) {}

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
                    if(error!=null&&running.get())getLogger().warning(
                        "Gateway belum tersambung. Periksa domain WSS, secret, dan firewall.");
                    else if(error==null)socket=ws;
                });
        }catch(Exception e){connecting=false;getLogger().warning("Alamat WSS gateway tidak dapat digunakan.");}
    }
    private void send(JsonObject packet){
        WebSocket ws=socket;
        if(ws==null||!running.get())return;
        if(!ws.isOutputClosed())ws.sendText(packet.toString(),true)
            .exceptionally(e->{dropped++;return null;});
    }
    private void snapshot(){
        if(socket==null)return; // Bukkit main thread: positions only, no audio codec.
        JsonObject packet=new JsonObject();packet.addProperty("t","snapshot");
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
            item.addProperty("bedrock",bedrock(p.getUniqueId()));
            item.addProperty("muted",s.muted||s.adminMuted);
            item.addProperty("deafened",s.deafened);
            item.addProperty("whisper",s.whisper);
            String group=s.group;
            if(api!=null&&!bedrock(p.getUniqueId())){
                try{
                    VoicechatConnection connection=api.getConnectionOf(p.getUniqueId());
                    if(connection!=null&&connection.getGroup()!=null)
                        group=connection.getGroup().getName();
                }catch(RuntimeException ignored){}
            }
            item.addProperty("group",group);
            array.add(item);
        }
        packet.add("players",array);send(packet);
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
        String code=pairingCode();
        JsonObject msg=new JsonObject();msg.addProperty("t","code");
        msg.addProperty("code",code);msg.addProperty("uuid",player.getUniqueId().toString());
        msg.addProperty("expires",System.currentTimeMillis()+120000);
        send(msg);
        tell(sender,"Kode SSCircle Voice: §e"+code+"§f (berlaku 2 menit, sekali pakai).");
        tell(sender,"Buka halaman SSCircle Voice pada browser, masukkan kode, lalu aktifkan mikrofon.");
    }
    @EventHandler public void quit(PlayerQuitEvent e){
        UUID id=e.getPlayer().getUniqueId();
        settings.remove(id);
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
            });
            events.registerEvent(MicrophonePacketEvent.class,event->{
                if(event.getSenderConnection()==null||!running.get())return;
                UUID id=event.getSenderConnection().getPlayer().getUuid();
                if(bedrock(id))return; // Don't echo injected Bedrock audio back into itself.
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
                Frame frame=audioQueue.poll(200,TimeUnit.MILLISECONDS);
                if(frame==null)continue;
                VoicechatServerApi api=voice;
                if(api==null)continue;
                if(frame.javaSource()){
                    // Encoded native Java Opus -> PCM -> Bedrock browser. One decoder
                    // per sender preserves codec history; no blocking work on main tick.
                    OpusDecoder decoder=decoders.computeIfAbsent(frame.uuid(),k->api.createDecoder());
                    short[] samples=decoder.decode(frame.audio());
                    if(samples==null||samples.length!=960)continue;
                    JsonObject packet=new JsonObject();
                    packet.addProperty("t","audio");packet.addProperty("uuid",frame.uuid().toString());
                    packet.addProperty("pcm",Base64.getEncoder().encodeToString(toBytes(samples)));
                    send(packet);sent++;
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
            case "audio" -> {
                try{
                    UUID uuid=UUID.fromString(msg.get("uuid").getAsString());
                    byte[] pcm=Base64.getDecoder().decode(msg.get("pcm").getAsString());
                    if(pcm.length!=1920||!bedrock(uuid))return;
                    Settings pref=settings.get(uuid);
                    if(pref!=null&&(pref.muted||pref.adminMuted))return;
                    boolean whisper=msg.has("whisper")&&msg.get("whisper").getAsBoolean();
                    if(!audioQueue.offer(new Frame(uuid,pcm,false,whisper)))dropped++;
                }catch(Exception ignored){dropped++;}
            }
            case "control" -> Bukkit.getScheduler().runTask(this,()->{
                try{
                    UUID uuid=UUID.fromString(msg.get("uuid").getAsString());
                    Player player=Bukkit.getPlayer(uuid);
                    if(player==null||!bedrock(uuid))return;
                    String action=msg.get("action").getAsString();
                    String value=msg.has("value")?msg.get("value").getAsString():"";
                    apply(player,action,value);
                }catch(Exception ignored){}
            });
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
                    Group group=groups.computeIfAbsent(value,k->api.groupBuilder().setName(k).build());
                    VoicechatConnection connection=api.getConnectionOf(player.getUniqueId());
                    if(connection!=null)connection.setGroup(group);
                    s.group=value;
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
        @Override public void onOpen(WebSocket ws){socket=ws;ws.request(1);snapshot();}
        @Override public CompletionStage<?> onText(WebSocket ws,CharSequence data,boolean last){
            synchronized(buffer){
                if(buffer.length()+data.length()>8192){buffer.setLength(0);ws.request(1);return null;}
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
            if(socket==ws)socket=null;connecting=false;return null;
        }
        @Override public void onError(WebSocket ws,Throwable error){
            if(socket==ws)socket=null;connecting=false;
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
                    ", Java→Web "+sent+", Web→Java "+received+", dropped "+dropped);return true;
            }
            if(action.equals("inspect")&&args.length>=2){
                Player p=Bukkit.getPlayerExact(args[1]);
                if(p==null){tell(sender,"Pemain tidak online.");return true;}
                Settings s=prefs(p.getUniqueId());
                tell(sender,p.getName()+" | Bedrock="+bedrock(p.getUniqueId())+
                    " | muted="+(s.muted||s.adminMuted)+" | deafen="+s.deafened+
                    " | group="+(s.group.isEmpty()?"proximity":s.group));return true;
            }
            if(List.of("mute","unmute","kick").contains(action)&&args.length>=2){
                String perm=action.equals("kick")?"sscircle.voice.admin.disconnect":"sscircle.voice.admin.mute";
                if(!sender.hasPermission(perm)){tell(sender,"Tidak punya izin "+perm);return true;}
                Player target=Bukkit.getPlayerExact(args[1]);
                if(target==null){tell(sender,"Pemain tidak online.");return true;}
                if(action.equals("kick")){
                    JsonObject msg=new JsonObject();msg.addProperty("t","kick");
                    msg.addProperty("uuid",target.getUniqueId().toString());send(msg);
                }else prefs(target.getUniqueId()).adminMuted=action.equals("mute");
                snapshot();tell(sender,"Perintah "+action+" untuk "+target.getName()+" diterapkan.");return true;
            }
            if((action.equals("distance")||action.equals("groups")||action.equals("reload"))&&
                sender.hasPermission(action.equals("reload")?"sscircle.voice.admin.reload":"sscircle.voice.admin.configure")){
                if(action.equals("reload")){reloadConfig();if(loadSettings())tell(sender,"Pengaturan dimuat ulang.");else tell(sender,"Konfigurasi gateway salah. Periksa file.");}
                if(action.equals("distance")&&args.length>=2)try{
                    distance=(float)Math.max(2,Math.min(100,Double.parseDouble(args[1])));
                    tell(sender,"Jarak Cross Voice diatur: "+distance);
                }catch(NumberFormatException e){tell(sender,"Masukkan angka 2 sampai 100.");}
                if(action.equals("groups")&&args.length>=2){
                    groupsAllowed=args[1].equalsIgnoreCase("on");tell(sender,"Group "+(groupsAllowed?"AKTIF":"NONAKTIF"));
                }
                return true;
            }
            tell(sender,"/scvoice status | inspect <pemain> | mute/unmute/kick <pemain> | distance <angka> | groups on/off | reload");
            return true;
        }
        if(!(sender instanceof Player player)){tell(sender,"Gunakan perintah ini dalam Minecraft.");return true;}
        if(action.equals("link")){link(sender);return true;}
        if(action.equals("status")){
            tell(sender,"Gateway "+(socket!=null?"terhubung":"offline")+
                "; Simple Voice Chat "+(voiceReady?"aktif":"tidak tersedia")+
                "; Bedrock "+bedrock(player.getUniqueId()));return true;
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
        WebSocket ws=socket;if(ws!=null)ws.abort();socket=null;
        if(audioWorker!=null){
            audioWorker.shutdownNow();
            try{audioWorker.awaitTermination(2,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}
        }
        for(UUID uuid:new ArrayList<>(senders.keySet()))closeCodec(uuid);
        for(OpusDecoder decoder:decoders.values())decoder.close();
        for(OpusEncoder encoder:encoders.values())encoder.close();
        decoders.clear();encoders.clear();senders.clear();settings.clear();groups.clear();audioQueue.clear();
    }
}
