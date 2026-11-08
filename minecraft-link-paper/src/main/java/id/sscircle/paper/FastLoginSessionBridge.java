package id.sscircle.paper;

import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

import java.lang.reflect.Method;
import java.util.UUID;

/**
 * Read-only optional FastLogin bridge. Only the current authenticated session
 * can prove Premium; a Minecraft name lookup or offline UUID never can.
 */
final class FastLoginSessionBridge {
    enum Status { PREMIUM, CRACKED, UNKNOWN }

    private FastLoginSessionBridge() {}

    // Both upstream FastLogin and FastLoginPlus use this exact Bukkit class
    // and publish a session-only PREMIUM/CRACKED/UNKNOWN enum.
    static Status interpretStatus(Object result) {
        if (!(result instanceof Enum<?> status)) return Status.UNKNOWN;
        return switch (status.name()) {
            case "PREMIUM" -> Status.PREMIUM;
            case "CRACKED" -> Status.CRACKED;
            default -> Status.UNKNOWN;
        };
    }

    static Status read(Player player, Plugin plugin) {
        if (player == null || plugin == null || !plugin.isEnabled()) return Status.UNKNOWN;
        try {
            Class<?> type = plugin.getClass().getClassLoader()
                .loadClass("com.github.games647.fastlogin.bukkit.FastLoginBukkit");
            if (!type.isInstance(plugin)) return Status.UNKNOWN;
            Method method = type.getMethod("getStatus", UUID.class);
            Object result = method.invoke(plugin, player.getUniqueId());
            return interpretStatus(result);
        } catch (ReflectiveOperationException | LinkageError | SecurityException exception) {
            // Unknown forks fail closed. Never infer Premium from a UUID or name.
            return Status.UNKNOWN;
        }
    }
}
