package id.sscircle.paper;

import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

import java.lang.reflect.Method;
import java.util.UUID;

/**
 * FastLogin / FastLoginPlus's official per-session API (getStatus(UUID)).
 * CRACKED describes the *connection*, NOT ownership of a Mojang licence.
 * No public player-name lookup, offline UUID or local DB can prove Premium.
 */
final class FastLoginSessionBridge {
    enum Status { PREMIUM, CRACKED, UNKNOWN }
    enum Reason {
        PREMIUM_VERIFIED, OFFLINE_SESSION, SESSION_UNKNOWN,
        NO_PLAYER, NO_PLUGIN, PLUGIN_DISABLED,
        ADAPTER_INCOMPATIBLE, API_FAILED
    }
    record Probe(Status status,Reason reason) {}

    private FastLoginSessionBridge() {}

    static Probe interpretProbe(Object response) {
        if (!(response instanceof Enum<?> status))
            return new Probe(Status.UNKNOWN,Reason.ADAPTER_INCOMPATIBLE);
        return switch (status.name()) {
            case "PREMIUM" -> new Probe(Status.PREMIUM,Reason.PREMIUM_VERIFIED);
            case "CRACKED" -> new Probe(Status.CRACKED,Reason.OFFLINE_SESSION);
            case "UNKNOWN" -> new Probe(Status.UNKNOWN,Reason.SESSION_UNKNOWN);
            default -> new Probe(Status.UNKNOWN,Reason.ADAPTER_INCOMPATIBLE);
        };
    }

    static Status interpretStatus(Object response) {
        return interpretProbe(response).status();
    }

    static Probe inspect(Player player,Plugin plugin) {
        if (player == null) return new Probe(Status.UNKNOWN,Reason.NO_PLAYER);
        if (plugin == null) return new Probe(Status.UNKNOWN,Reason.NO_PLUGIN);
        if (!plugin.isEnabled()) return new Probe(Status.UNKNOWN,Reason.PLUGIN_DISABLED);
        try {
            Class<?> type = plugin.getClass().getClassLoader()
                .loadClass("com.github.games647.fastlogin.bukkit.FastLoginBukkit");
            if (!type.isInstance(plugin))
                return new Probe(Status.UNKNOWN,Reason.ADAPTER_INCOMPATIBLE);
            Method method = type.getMethod("getStatus",UUID.class);
            return interpretProbe(method.invoke(plugin,player.getUniqueId()));
        } catch (NoSuchMethodException | ClassNotFoundException exception) {
            return new Probe(Status.UNKNOWN,Reason.ADAPTER_INCOMPATIBLE);
        } catch (ReflectiveOperationException | LinkageError | SecurityException exception) {
            // Fail closed; do not expose plugin internals or stacktraces in chat.
            return new Probe(Status.UNKNOWN,Reason.API_FAILED);
        }
    }

    static Status read(Player player,Plugin plugin) {
        return inspect(player,plugin).status();
    }
}
