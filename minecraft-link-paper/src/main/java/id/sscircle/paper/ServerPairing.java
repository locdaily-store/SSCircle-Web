package id.sscircle.paper;

import org.bukkit.Bukkit;
import org.bukkit.scheduler.BukkitTask;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * V10.49.1.7 one-time administrative pairing. No unauthenticated game data is
 * sent. Bootstrap token and the approved HMAC key stay on the Paper host.
 * All I/O and network calls are performed asynchronously off the tick thread.
 */
final class ServerPairing {
    private static final String REGISTER="/api/minecraft/server-pair/register";
    private static final String POLL="/api/minecraft/server-pair/poll";
    private static final Pattern JSON_STRING=Pattern.compile(
        "\"([a-zA-Z]+)\"\\s*:\\s*\"([^\"\\\\]{0,256})\"");
    private final SSCirclePaperLinkPlugin plugin;
    private final HttpClient http;
    private final Supplier<String> endpoint;
    private final Path stateFile;
    private final AtomicBoolean busy=new AtomicBoolean();
    private volatile boolean running;
    private volatile String boundEndpoint="",instanceId="",bootstrapToken="",
        pairingCode="",serverSecret="",state="belum dimulai";
    private BukkitTask task;

    ServerPairing(SSCirclePaperLinkPlugin plugin,HttpClient http,Supplier<String> endpoint) {
        this.plugin=plugin;this.http=http;this.endpoint=endpoint;
        this.stateFile=plugin.getDataFolder().toPath().resolve("server-pairing.properties");
    }

    static String field(String json,String name) {
        Matcher m=JSON_STRING.matcher(json);
        while(m.find())if(name.equals(m.group(1)))return m.group(2);
        return "";
    }
    static String newBootstrapToken(){
        byte[] bytes=new byte[48];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    static boolean validCredential(String value){
        return SecretFileStore.isValidSecret(value);
    }
    String activeSecret(String target){
        return target!=null&&target.equals(boundEndpoint)?serverSecret:"";
    }
    String activeServerId(String target){
        return validCredential(activeSecret(target))?instanceId:"";
    }
    String status(){return state;}
    String code(){return pairingCode;}
    String serverId(){return instanceId;}
    boolean isPaired(String target){return validCredential(activeSecret(target));}

    void start(){
        if(running)return;
        running=true;
        try{load();}catch(Exception ex){
            running=false;
            state="ERROR: file pairing tidak dapat dibaca";
            plugin.getLogger().severe("File pairing SSCircle tidak valid; perbaiki permission/file privat.");
            return;
        }
        task=Bukkit.getScheduler().runTaskTimerAsynchronously(plugin,this::tick,40L,600L);
    }
    void stop(){
        running=false;
        if(task!=null)task.cancel();
    }
    void reset(){
        if(!running)return;
        if(busy.get())throw new IllegalStateException("Sinkronisasi pairing sedang berjalan.");
        // Explicit OP command. Old approved server must be revoked in Admin Control.
        try{
            if(Files.isSymbolicLink(stateFile))throw new IllegalStateException("Symlink pairing ditolak.");
            Files.deleteIfExists(stateFile);
            instanceId="";bootstrapToken="";pairingCode="";serverSecret="";
            boundEndpoint="";state="menunggu pendaftaran baru";
        }catch(Exception ex){throw new IllegalStateException("Gagal reset pairing; cek permission.",ex);}
    }
    private void load() throws Exception {
        if(!Files.exists(stateFile,LinkOption.NOFOLLOW_LINKS))return;
        if(!Files.isRegularFile(stateFile,LinkOption.NOFOLLOW_LINKS)||Files.size(stateFile)>4096)
            throw new IllegalStateException("Invalid private pairing state");
        Properties p=new Properties();
        try(var in=Files.newInputStream(stateFile)){p.load(in);}
        String id=p.getProperty("instanceId",""),token=p.getProperty("bootstrapToken","");
        String target=p.getProperty("endpoint","");
        if(!id.matches("[0-9a-f-]{36}")||!token.matches("[A-Za-z0-9_-]{43,86}")
            ||!target.startsWith("https://"))throw new IllegalStateException("Invalid pairing identity");
        instanceId=id;bootstrapToken=token;boundEndpoint=target;
        pairingCode=p.getProperty("pairingCode","");
        serverSecret=p.getProperty("serverSecret","");
        if(!serverSecret.isEmpty()&&!validCredential(serverSecret))
            throw new IllegalStateException("Invalid pairing credential");
        state=validCredential(serverSecret)?"aktif":"menunggu persetujuan";
    }
    private void save() throws Exception {
        Path dir=stateFile.getParent();
        if(Files.isSymbolicLink(dir)||Files.isSymbolicLink(stateFile))
            throw new IllegalStateException("Private pairing path cannot be symlink");
        Files.createDirectories(dir);
        Path tmp=Files.createTempFile(dir,"pairing-", ".tmp");
        try{
            try{Files.setPosixFilePermissions(tmp,PosixFilePermissions.fromString("rw-------"));}
            catch(UnsupportedOperationException ignored){}
            Properties p=new Properties();
            p.setProperty("endpoint",boundEndpoint);
            p.setProperty("instanceId",instanceId);
            p.setProperty("bootstrapToken",bootstrapToken);
            p.setProperty("pairingCode",pairingCode);
            p.setProperty("serverSecret",serverSecret);
            try(var out=Files.newOutputStream(tmp,StandardOpenOption.TRUNCATE_EXISTING)){
                p.store(out,"Private SSCircle pairing; do not upload or share");
            }
            Files.move(tmp,stateFile,StandardCopyOption.REPLACE_EXISTING);
        }finally{Files.deleteIfExists(tmp);}
    }
    private void tick(){
        if(!running||!busy.compareAndSet(false,true))return;
        try{
            String target=endpoint.get();
            if(target==null||target.isBlank()){state="atur endpoint HTTPS terlebih dahulu";return;}
            if(instanceId.isEmpty()){
                boundEndpoint=target;
                instanceId=UUID.randomUUID().toString();
                bootstrapToken=newBootstrapToken();
                save();
            }
            if(!target.equals(boundEndpoint)){
                state="endpoint berubah; pairing ditahan demi keamanan";
                return;
            }
            if(validCredential(serverSecret)){
                state="aktif";
                return;
            }
            boolean register=pairingCode.isEmpty();
            String path=register?REGISTER:POLL;
            String body="{\"serverId\":\""+instanceId+"\",\"token\":\""+bootstrapToken+"\""
                +(register?",\"label\":\""+serverLabel()+"\"":"")+"}";
            HttpRequest request=HttpRequest.newBuilder(URI.create(target+path))
                .timeout(Duration.ofSeconds(12))
                .header("Content-Type","application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body,StandardCharsets.UTF_8))
                .build();
            HttpResponse<String> response=http.send(request,HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if(response.statusCode()==410){state="kedaluwarsa; /sscircle pair reset CONFIRM";return;}
            if(response.statusCode()==403){state="ditolak atau dicabut; hubungi admin SSCircle";return;}
            if(response.statusCode()!=200){
                state="website HTTP "+response.statusCode()+"; mencoba ulang";
                return;
            }
            String result=response.body();
            if(result.length()>1024){state="respons pairing tidak valid";return;}
            String serverState=field(result,"status");
            if(register&&"pending".equals(serverState)){
                String newCode=field(result,"pairCode");
                if(!newCode.matches("[A-Za-z0-9_-]{12}")){
                    state="kode pairing tidak valid";return;
                }
                pairingCode=newCode;
                save();
                state="menunggu persetujuan Admin Control";
                plugin.getLogger().info("Pairing SSCircle menunggu persetujuan. Gunakan /sscircle pair sebagai OP untuk melihat kode.");
            }else if("active".equals(serverState)){
                String newSecret=field(result,"serverSecret");
                if(!validCredential(newSecret)){state="kredensial belum diterima";return;}
                serverSecret=newSecret;
                save();
                state="aktif";
                plugin.getLogger().info("Auto Server Pairing disetujui. Statistik dan identitas kini dapat tersinkron.");
            }else if("pending".equals(serverState))state="menunggu persetujuan Admin Control";
            else state="status pairing belum dikenal";
        }catch(Exception ex){
            state="gagal menghubungi website; mencoba ulang";
        }finally{busy.set(false);}
    }
    private String serverLabel(){
        String label=plugin.getConfig().getString("auto-pairing.server-name","SSCircle Paper");
        return label!=null&&label.matches("[-a-zA-Z0-9 _.]{3,48}")?label:"SSCircle Paper";
    }
}
