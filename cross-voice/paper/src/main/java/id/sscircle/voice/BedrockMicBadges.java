package id.sscircle.voice;

import net.kyori.adventure.key.Key;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.entity.Display;
import org.bukkit.entity.Player;
import org.bukkit.entity.TextDisplay;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.util.Transformation;
import org.joml.Quaternionf;
import org.joml.Vector3f;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Additional floating microphone badge for paired Floodgate players.
 * Renders on vanilla Java clients with the SSCircle Mic Glyph resource pack.
 *
 * Does not touch player displayName, scoreboard teams, packets, tab list or
 * native SVC state. Badges are short-lived non-persistent display entities.
 * Everything in this class runs on the Bukkit server thread.
 */
final class BedrockMicBadges {
    private static final String MIC_GLYPH = "\uE401";
    private static final Key MIC_FONT = Key.key("sscircle", "voice");
    private final JavaPlugin plugin;
    private final Map<UUID, Badge> badges = new HashMap<>();

    private static final class Badge {
        final TextDisplay display;
        final Set<UUID> viewers = new HashSet<>();
        Badge(TextDisplay display) { this.display = display; }
    }

    BedrockMicBadges(JavaPlugin plugin) {
        this.plugin = plugin;
    }

    private Location anchor(Player owner) {
        double height = Math.max(1.3, Math.min(3.3,
            plugin.getConfig().getDouble("indicators.badge-height", 2.42)));
        return owner.getLocation().add(0, owner.isSneaking() ? height - 0.25 : height, 0);
    }

    private TextDisplay create(Player owner) {
        Location location = anchor(owner);
        float scale = (float)Math.max(0.3, Math.min(1.5,
            plugin.getConfig().getDouble("indicators.badge-scale", 0.70)));
        // Approximate the right edge of the natural Java nameplate.
        // This is a separate visual entity, not a replacement nametag.
        float x = 0.23f + Math.min(22, owner.getName().length()) * 0.046f;
        TextDisplay entity = owner.getWorld().spawn(location, TextDisplay.class, display -> {
            display.setVisibleByDefault(false);
            display.setPersistent(false);
            display.setSilent(true);
            display.setInvulnerable(true);
            display.setGravity(false);
            display.setBillboard(Display.Billboard.CENTER);
            display.setSeeThrough(false);
            display.setShadowed(true);
            display.setDefaultBackground(false);
            display.setLineWidth(16);
            display.setViewRange(0.9f);
            display.setTeleportDuration(5);
            display.setTransformation(new Transformation(
                new Vector3f(x, 0f, 0f), new Quaternionf(),
                new Vector3f(scale, scale, scale), new Quaternionf()));
            display.text(Component.text(MIC_GLYPH)
                .font(MIC_FONT).color(NamedTextColor.GREEN));
        });
        return entity;
    }

    void sync(Set<UUID> activeBedrock) {
        // Session must be active on the SAME Minecraft server; no stored
        // pairing codes or offline users are considered connected.
        for (UUID uuid : new ArrayList<>(badges.keySet())) {
            Player owner = Bukkit.getPlayer(uuid);
            Badge badge = badges.get(uuid);
            if (owner == null || !owner.isOnline() || !activeBedrock.contains(uuid) ||
                badge == null || !badge.display.isValid() ||
                !badge.display.getWorld().equals(owner.getWorld())) {
                remove(uuid);
            }
        }
        for (UUID uuid : activeBedrock) {
            Player owner = Bukkit.getPlayer(uuid);
            if (owner == null || !owner.isOnline()) continue;
            Badge badge = badges.get(uuid);
            if (badge == null) {
                try {
                    badge = new Badge(create(owner));
                    badges.put(uuid, badge);
                } catch (RuntimeException ex) {
                    // Some server builds temporarily reject display spawning
                    // during a world transition. Retry on the next 5-tick sync.
                    continue;
                }
            }
            Location desired = anchor(owner);
            if (badge.display.getLocation().distanceSquared(desired) > 0.0001) {
                badge.display.teleport(desired);
            }
            updateViewers(owner, badge);
        }
    }

    private void updateViewers(Player owner, Badge badge) {
        final double radius = Math.max(8, Math.min(96,
            plugin.getConfig().getDouble("indicators.badge-view-distance", 48)));
        final double radiusSquared = radius * radius;
        for (Player viewer : Bukkit.getOnlinePlayers()) {
            // The Java font resource pack is not available to Bedrock clients.
            boolean javaViewer = !isBedrock(viewer.getUniqueId());
            boolean shouldSee = javaViewer && viewer != owner &&
                viewer.getWorld().equals(owner.getWorld()) &&
                viewer.getLocation().distanceSquared(owner.getLocation()) <= radiusSquared;
            if (shouldSee && badge.viewers.add(viewer.getUniqueId())) {
                viewer.showEntity(plugin, badge.display);
            } else if (!shouldSee && badge.viewers.remove(viewer.getUniqueId())) {
                viewer.hideEntity(plugin, badge.display);
            }
        }
        badge.viewers.removeIf(id -> Bukkit.getPlayer(id) == null);
    }

    private static boolean isBedrock(UUID uuid) {
        try { return org.geysermc.floodgate.api.FloodgateApi.getInstance().isFloodgatePlayer(uuid); }
        catch (IllegalStateException | NoClassDefFoundError ex) { return false; }
    }

    void remove(UUID uuid) {
        Badge badge = badges.remove(uuid);
        if (badge == null) return;
        for (UUID id : badge.viewers) {
            Player viewer = Bukkit.getPlayer(id);
            if (viewer != null) viewer.hideEntity(plugin, badge.display);
        }
        badge.viewers.clear();
        if (badge.display.isValid()) badge.display.remove();
    }

    int count() { return badges.size(); }

    void clear() {
        for (UUID id : new ArrayList<>(badges.keySet())) remove(id);
    }
}
