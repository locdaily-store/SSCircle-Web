package id.sscircle.paper;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.UUID;

/** Stable server-local AuthMe account id, not an assertion of Mojang ownership. */
final class AuthMeAccountId {
    private AuthMeAccountId() {}

    static String fromPlayerName(String playerName) {
        if (playerName == null || !playerName.matches("[A-Za-z0-9_]{3,16}")) return null;
        String normalized = playerName.toLowerCase(Locale.ROOT);
        return UUID.nameUUIDFromBytes(
            ("SSCircle/AuthMeAccount/v1:" + normalized).getBytes(StandardCharsets.UTF_8))
            .toString();
    }
}
