package id.sscircle.paper;

import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

/**
 * Official AuthMe public API v3. Never calls forceLogin or checks passwords.
 * Failure to resolve the API is treated as unauthenticated (fail closed).
 */
final class AuthMeSessionBridge {
    private AuthMeSessionBridge() {}

    static boolean isAuthenticated(Player player, Plugin authMe) {
        if (player == null || authMe == null || !authMe.isEnabled()) return false;
        try {
            Class<?> type = authMe.getClass().getClassLoader()
                .loadClass("fr.xephi.authme.api.v3.AuthMeApi");
            Object api = type.getMethod("getInstance").invoke(null);
            if (api == null) return false;
            Object authenticated = type.getMethod("isAuthenticated", Player.class)
                .invoke(api, player);
            Object registered = type.getMethod("isRegistered", String.class)
                .invoke(api, player.getName());
            Object unrestricted = type.getMethod("isUnrestricted", Player.class)
                .invoke(api, player);
            return Boolean.TRUE.equals(authenticated)
                && Boolean.TRUE.equals(registered)
                && Boolean.FALSE.equals(unrestricted);
        } catch (ReflectiveOperationException | LinkageError | SecurityException
                 | ClassCastException ex) {
            return false;
        }
    }
}
