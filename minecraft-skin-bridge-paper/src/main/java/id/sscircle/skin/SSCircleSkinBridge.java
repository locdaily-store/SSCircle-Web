package id.sscircle.skin;

import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.java.JavaPlugin;

import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Objects;
import java.util.List;
import java.util.ArrayList;
import java.util.Locale;
import java.util.UUID;

/**
 * Non-invasive companion for SSCircle Player Sync 10.49.1.
 * Reuses the exact authenticated identity guard from the existing plugin,
 * rather than guessing a player UUID, authentication state or username.
 */
public final class SSCircleSkinBridge extends JavaPlugin implements Listener, CommandExecutor, TabCompleter {
    private JavaPlugin core;
    private Method coreIdentity;
    private SkinPublisher publisher;
    private String endpoint="",secret="";

    @Override public void onEnable(){
        saveDefaultConfig();
        Plugin candidate=Bukkit.getPluginManager().getPlugin("SSCirclePlayerSync");
        core=candidate instanceof JavaPlugin ? (JavaPlugin)candidate : null;
        if(core==null||!core.isEnabled()){
            getLogger().severe("SSCirclePlayerSync harus aktif lebih dahulu. Skin Bridge dibatalkan.");
            Bukkit.getPluginManager().disablePlugin(this);return;
        }
        try{
            coreIdentity=core.getClass().getDeclaredMethod("identityFor",Player.class);
            coreIdentity.setAccessible(true);
        }catch(ReflectiveOperationException | SecurityException exception){
            getLogger().severe("Versi SSCircle Player Sync tidak cocok; tidak ada bukti identitas aman.");
            Bukkit.getPluginManager().disablePlugin(this);return;
        }
        if(!readCoreSettings()){
            getLogger().warning("Endpoint/secret core belum tersedia. Skin Bridge tetap aktif; perbaiki lalu /ssskin reload.");
        }
        publisher=new SkinPublisher(this,HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(6)).build(),
            this::authenticatedIdentity,()->endpoint,this::activeCoreSecret,this::activeCoreId);
        publisher.start();
        Bukkit.getPluginManager().registerEvents(this,this);
        Objects.requireNonNull(getCommand("ssskin")).setExecutor(this);
        getCommand("ssskin").setTabCompleter(this);
        for(Player player:Bukkit.getOnlinePlayers())publisher.afterJoin(player);
        getLogger().info("SSCircle Skin Bridge siap. /ssskin status (OP) untuk diagnosis.");
    }

    @Override public void onDisable(){if(publisher!=null)publisher.stop();secret="";}

    private boolean readCoreSettings(){
        endpoint="";secret="";
        if(core==null)return false;
        String raw=core.getConfig().getString("endpoint","").trim();
        try{
            URI url=URI.create(raw);
            if(!"https".equalsIgnoreCase(url.getScheme())||url.getHost()==null
                ||url.getUserInfo()!=null||url.getRawQuery()!=null||url.getRawFragment()!=null
                ||(url.getPath()!=null&&!url.getPath().isBlank()&&!"/".equals(url.getPath()))
                ||"example.pages.dev".equalsIgnoreCase(url.getHost()))return false;
            Path directory=core.getDataFolder().toPath();
            Path file=directory.resolve("server-secret.txt");
            String value;
            if(Files.isRegularFile(file,LinkOption.NOFOLLOW_LINKS)&&!Files.isSymbolicLink(file)){
                if(Files.size(file)>1024)return false;
                value=Files.readString(file,StandardCharsets.UTF_8).strip();
            }else value=System.getenv("SSCIRCLE_LINK_SERVER_SECRET");
            if(value==null||value.length()<32||value.length()>256
                ||value.chars().anyMatch(ch->ch<33||ch>126)){
                endpoint=url.toString().replaceAll("/+$","");
                return true; // Await automatic approval from the core plugin.
            }
            endpoint=url.toString().replaceAll("/+$","");secret=value;
            return true;
        }catch(Exception ignored){return false;}
    }

    private String activeCoreSecret(){
        if(core==null)return secret;
        try{return String.valueOf(core.getClass().getMethod("activeSigningSecret").invoke(core));}
        catch(ReflectiveOperationException | SecurityException e){return secret;}
    }
    private String activeCoreId(){
        if(core==null)return "";
        try{return String.valueOf(core.getClass().getMethod("pairingServerId").invoke(core));}
        catch(ReflectiveOperationException | SecurityException e){return "";}
    }
    private SkinPublisher.Identity authenticatedIdentity(Player player){
        if(core==null||!core.isEnabled()||coreIdentity==null)return null;
        try{
            Object identity=coreIdentity.invoke(core,player); // Must run on Paper main thread.
            if(identity==null)return null;
            Class<?> type=identity.getClass();
            Method provider=type.getDeclaredMethod("provider"),id=type.getDeclaredMethod("verifiedId"),source=type.getDeclaredMethod("authSource");
            provider.setAccessible(true);id.setAccessible(true);source.setAccessible(true);
            String a=String.valueOf(provider.invoke(identity));
            String b=String.valueOf(id.invoke(identity));
            String c=String.valueOf(source.invoke(identity));
            if(!a.matches("java_premium|java_offline|bedrock")||b.isBlank()||c.isBlank())return null;
            return new SkinPublisher.Identity(a,b,c);
        }catch(ReflectiveOperationException | SecurityException exception){return null;}
    }

    @EventHandler public void join(PlayerJoinEvent event){if(publisher!=null)publisher.afterJoin(event.getPlayer());}
    @EventHandler public void quit(PlayerQuitEvent event){if(publisher!=null)publisher.afterQuit(event.getPlayer().getUniqueId());}

    private static final String P="§b[SSCircle Skin] §r";
    private static void say(CommandSender sender,String text){sender.sendMessage(P+text);}
    static String explainCode(String raw){
        if(raw==null||raw.isBlank())return "Belum ada aktivitas skin. Tunggu pemain login atau jalankan /ssb sync.";
        String code=raw.split(" \\| ")[0];
        int time=code.indexOf(" (");
        if(time>=0)code=code.substring(0,time);
        return switch(code){
            case "BELUM_DICOBA" -> "Belum diperiksa. Plugin mulai memindai skin setelah pemain login.";
            case "SKIN_GAMBAR_TERSIMPAN_HTTP_200","SKIN_GAMBAR_SUDAH_TERSIMPAN_DI_D1" ->
                "Berhasil. Gambar skin sudah tersimpan di website SSCircle.";
            case "MEMERIKSA_SKIN_SERVER" -> "Memeriksa tekstur skin yang dipakai di server.";
            case "MENGIRIM_PNG_KE_D1" -> "Mengirim gambar skin ke Cloudflare D1. Belum selesai.";
            case "MENGIRIM_HASH_CADANGAN" -> "Mengirim informasi tekstur saja. Gambar penuh belum tersedia.";
            case "ANTREAN_SKIN" -> "Menunggu giliran sinkronisasi. Plugin membatasi beban dan TPS.";
            case "LOGIN_BELUM_TERVERIFIKASI" -> "Pemain belum menyelesaikan autentikasi; login dahulu.";
            case "DISABLED_CONFIG" -> "Sinkronisasi skin dimatikan pada config.yml Skin Bridge.";
            case "ENDPOINT_ATAU_SECRET_BELUM_VALID" ->
                "Koneksi atau izin server belum siap. Periksa /sscircle status dan persetujuan pairing.";
            case "SKINSRESTORER_TIDAK_TERPASANG" ->
                "SkinsRestorer belum terpasang. Plugin mencoba skin dari Paper sebagai fallback.";
            case "SKINSRESTORER_BELUM_MEMILIKI_SKIN" ->
                "SkinsRestorer belum memiliki skin pemain. Coba ganti skin atau login ulang.";
            case "HASH_SAJA_HTTP_200_PNG_GAGAL_DIUNDUH" ->
                "Website menerima tekstur, tetapi gambar skin gagal diunduh. Coba sinkron lagi.";
            case "PENGIRIMAN_TERPUTUS" -> "Koneksi terputus saat mengirim skin. Coba kembali.";
            default -> {
                if(code.startsWith("HTTP_401")||code.startsWith("HTTP_403"))
                    yield "Akses ditolak Cloudflare. Periksa pairing server dan secret Core.";
                if(code.startsWith("HTTP_404"))
                    yield "Endpoint skin tidak ditemukan. Periksa versi website dan URL HTTPS.";
                if(code.startsWith("HTTP_429"))
                    yield "Terlalu banyak permintaan. Tunggu sebelum mencoba lagi.";
                if(code.startsWith("HTTP_5"))
                    yield "Website sementara bermasalah. Coba lagi setelah koneksi pulih.";
                if(code.startsWith("PENGIRIMAN_GAGAL_")||code.startsWith("SKIN_CAPTURE_ERROR_"))
                    yield "Ada masalah jaringan/pembacaan skin. Periksa console untuk diagnosis.";
                if(code.contains("PAPER_TIDAK_MEMILIKI_TEKSTUR"))
                    yield "Skin belum tersedia dari SkinsRestorer maupun Paper. Coba login ulang.";
                yield "Status teknis: "+code+". Jalankan /ssb status untuk rincian.";
            }
        };
    }

    private void showHelp(CommandSender sender){
        say(sender,"Perintah cepat: /ssb atau /ssskin");
        say(sender,"/ssb me - status skin milikmu sendiri");
        if(sender.hasPermission("sscircle.admin")){
            say(sender,"/ssb status - diagnosa koneksi dan antrean");
            say(sender,"/ssb sync [pemain] - kirim ulang skin online (tanpa nama = semua)");
            say(sender,"/ssb check <pemain> - jelaskan hasil sinkronisasi");
            say(sender,"/ssb reload - muat ulang konfigurasi Skin Bridge");
        }
    }

    @Override public List<String> onTabComplete(CommandSender sender,Command command,
                                                 String alias,String[] args){
        if(args.length==1){
            List<String> choices=new ArrayList<>(List.of("help","me"));
            if(sender.hasPermission("sscircle.admin"))
                choices.addAll(List.of("status","sync","check","inspect","reload"));
            String prefix=args[0].toLowerCase(Locale.ROOT);
            return choices.stream().filter(x->x.startsWith(prefix)).toList();
        }
        if(args.length==2 && sender.hasPermission("sscircle.admin")&&
           List.of("sync","check","inspect").contains(args[0].toLowerCase(Locale.ROOT))){
            String prefix=args[1].toLowerCase(Locale.ROOT);
            return Bukkit.getOnlinePlayers().stream().map(Player::getName)
                .filter(name->name.toLowerCase(Locale.ROOT).startsWith(prefix))
                .limit(20).toList();
        }
        return List.of();
    }

    @Override public boolean onCommand(CommandSender sender,Command command,String label,String[] args){
        String sub=args.length==0?"help":args[0].toLowerCase(Locale.ROOT);
        if(sub.equals("help")||sub.equals("bantuan")||sub.equals("?")){
            showHelp(sender);return true;
        }
        if(sub.equals("me")||sub.equals("saya")){
            if(!(sender instanceof Player player)){say(sender,"Perintah ini hanya untuk pemain.");return true;}
            say(sender,"Status skin kamu: "+explainCode(publisher.statusFor(player.getUniqueId())));
            return true;
        }
        if(!sender.hasPermission("sscircle.admin")){
            say(sender,"Perintah ini untuk OP/admin. Gunakan /ssb me untuk memeriksa skin sendiri.");
            return true;
        }
        if(sub.equals("reload")||sub.equals("muatulang")){
            core.reloadConfig();
            reloadConfig();
            boolean configured=readCoreSettings();
            publisher.stop();
            publisher.start();
            for(Player player:Bukkit.getOnlinePlayers())publisher.afterJoin(player);
            say(sender,configured?"Pengaturan dimuat ulang. Gunakan /ssb status untuk mengecek pairing.":
                "Alamat website belum valid. Periksa endpoint Core dan gunakan /ssb status.");
            return true;
        }
        if(sub.equals("sync")){
            if(!getConfig().getBoolean("skin-sync.enabled",true)){
                say(sender,"Skin sync sedang OFF. Aktifkan skin-sync.enabled pada config.yml lalu /ssb reload.");
                return true;
            }
            if(args.length>=2){
                Player target=Bukkit.getPlayerExact(args[1]);
                if(target==null){say(sender,"Pemain tidak online. Gunakan TAB untuk daftar pemain.");return true;}
                publisher.forcePlayer(target);
                say(sender,"Sinkronisasi "+target.getName()+" dijadwalkan. Periksa /ssb check "+target.getName()+".");
            }else{
                publisher.forceAll();
                say(sender,"Pemain online dijadwalkan bertahap. Tidak memproses semuanya sekaligus agar TPS stabil.");
            }
            return true;
        }
        if(sub.equals("check")||sub.equals("inspect")||sub.equals("cek")){
            if(args.length<2){say(sender,"Gunakan /ssb check <nama pemain>.");return true;}
            Player target=Bukkit.getPlayerExact(args[1]);
            if(target==null){say(sender,"Pemain tidak online. Periksa setelah mereka login.");return true;}
            String raw=publisher.statusFor(target.getUniqueId());
            say(sender,target.getName()+": "+explainCode(raw));
            say(sender,"Kode: "+raw+" | Jika belum berhasil, gunakan /ssb sync "+target.getName());
            return true;
        }
        if(sub.equals("status")||sub.equals("diagnose")){
            boolean coreReady=core!=null&&core.isEnabled();
            String signing=activeCoreSecret();
            boolean pairingReady=signing!=null&&signing.length()>=32&&!"null".equals(signing);
            say(sender,"=== Diagnosis Skin Bridge ===");
            say(sender,"Core Player Sync: "+(coreReady?"AKTIF":"TIDAK AKTIF"));
            say(sender,"Website HTTPS: "+(!endpoint.isBlank()?endpoint:"BELUM VALID (periksa config Core)"));
            say(sender,"Otorisasi: "+(pairingReady?"SIAP (secret server terdeteksi)":
                "BELUM SIAP (setujui Auto Pairing / periksa secret Core)"));
            say(sender,"Plugin SkinsRestorer: "+(Bukkit.getPluginManager().isPluginEnabled("SkinsRestorer")?
                "AKTIF":"TIDAK ADA, memakai fallback skin Paper"));
            say(sender,"Sinkronisasi: "+(getConfig().getBoolean("skin-sync.enabled",true)?"AKTIF":"DINONAKTIFKAN"));
            say(sender,"Proses aktif: "+publisher.activeLookups()+" / 2; antrean: "+publisher.pendingScanCount()+
                " pemain; TPS rendah: "+(publisher.pausedForLowTps()?"YA, pemindaian ditunda":"TIDAK"));
            say(sender,"Pengiriman terakhir: "+explainCode(publisher.lastDelivery()));
            say(sender,"Sukses terakhir: "+publisher.lastSuccess());
            if(sender instanceof Player player)
                say(sender,"Skin kamu: "+explainCode(publisher.statusFor(player.getUniqueId())));
            say(sender,"Pakai /ssb sync untuk retry, /ssb check <pemain> untuk cek per pemain.");
            return true;
        }
        showHelp(sender);
        return true;
    }
}
