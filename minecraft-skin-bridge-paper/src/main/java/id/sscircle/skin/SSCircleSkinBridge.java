package id.sscircle.skin;

import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
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
import java.util.UUID;

/**
 * Non-invasive companion for SSCircle Player Sync 10.49.1.
 * Reuses the exact authenticated identity guard from the existing plugin,
 * rather than guessing a player UUID, authentication state or username.
 */
public final class SSCircleSkinBridge extends JavaPlugin implements Listener, CommandExecutor {
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

    @Override public boolean onCommand(CommandSender sender,Command command,String label,String[] args){
        if(!sender.hasPermission("sscircle.admin")){
            sender.sendMessage("Khusus pengurus SSCircle.");return true;
        }
        if(args.length==1&&args[0].equalsIgnoreCase("reload")){
            core.reloadConfig();reloadConfig();
            sender.sendMessage(readCoreSettings()?"Koneksi dan secret SSCircle terbaca.":"Konfigurasi core belum lengkap.");
            return true;
        }
        if(args.length>=1&&args[0].equalsIgnoreCase("sync")){
            if(args.length>=2){
                Player target=Bukkit.getPlayerExact(args[1]);
                if(target==null){sender.sendMessage("Pemain tidak online. Login dahulu.");return true;}
                publisher.forcePlayer(target);
                sender.sendMessage("Pemeriksaan skin "+target.getName()+" dimulai. Cek /ssskin inspect "+target.getName()+" beberapa detik lagi.");
            }else{
                if(publisher!=null)publisher.forceAll();
                sender.sendMessage("Sinkron skin semua pemain online dimulai. Cek /ssskin inspect <pemain> untuk hasilnya.");
            }
            return true;
        }
        if(args.length>=2&&args[0].equalsIgnoreCase("inspect")){
            Player target=Bukkit.getPlayerExact(args[1]);
            if(target==null){sender.sendMessage("Pemain tidak online. Login dahulu.");return true;}
            sender.sendMessage("SSCircle skin "+target.getName()+": "+publisher.statusFor(target.getUniqueId()));
            sender.sendMessage("Target sukses: SKIN_GAMBAR_TERSIMPAN_HTTP_200. Jika ada error periksa /ssskin status.");
            return true;
        }
        sender.sendMessage("SSCircle Skin Bridge 10.49.1.3");
        sender.sendMessage("Core aktif: "+(core!=null&&core.isEnabled()?"YA":"TIDAK"));
        sender.sendMessage("Endpoint HTTPS: "+(!endpoint.isBlank()?"TERSEDIA":"BELUM DIATUR"));
        if(!endpoint.isBlank())sender.sendMessage("Tujuan upload skin: "+endpoint+"/api/minecraft/skin/sync");
        sender.sendMessage("Secret: "+(secret.length()>=32?"TERSEDIA":"BELUM DIATUR"));
        sender.sendMessage("SkinsRestorer: "+(Bukkit.getPluginManager().isPluginEnabled("SkinsRestorer")?"AKTIF":"FALLBACK PAPER"));
        sender.sendMessage("Terakhir: "+publisher.lastDelivery()+" | sukses terakhir: "+publisher.lastSuccess());
        sender.sendMessage("Lookup aktif: "+publisher.activeLookups()+" / 2");
        if(sender instanceof Player player)
            sender.sendMessage("Skin akunmu: "+publisher.statusFor(player.getUniqueId()));
        sender.sendMessage("/ssskin sync [pemain] | /ssskin inspect <pemain> | /ssskin reload");
        return true;
    }
}
