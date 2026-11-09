package id.sscircle.paper;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * In-memory guard for the life of one online Java session.
 *
 * AuthMe authenticates the username; this guard only prevents a session from
 * silently changing account identity and rejects two concurrent sessions
 * claiming the same normalized AuthMe name. It does NOT turn an offline UUID
 * or a username into Mojang proof or replace recovery with administrator review.
 *
 * All methods are called on the Paper main thread.
 */
final class IdentitySessionGuard {
    enum State { OK, NO_SESSION, INVALID_NAME, ACCOUNT_CHANGED, DUPLICATE_SESSION }

    private record Bound(String name, String localAccountId) {}
    private final Map<UUID, Bound> byUuid = new HashMap<>();
    private final Map<String, Set<UUID>> byName = new HashMap<>();

    void joined(UUID sessionUuid, String loginName) {
        left(sessionUuid);
        String name = canonical(loginName);
        if (sessionUuid == null || name == null) return;
        String accountId = AuthMeAccountId.fromPlayerName(name);
        if (accountId == null) return;
        byUuid.put(sessionUuid, new Bound(name, accountId));
        byName.computeIfAbsent(name, ignored -> new HashSet<>()).add(sessionUuid);
    }

    void left(UUID sessionUuid) {
        if (sessionUuid == null) return;
        Bound previous = byUuid.remove(sessionUuid);
        if (previous == null) return;
        Set<UUID> owners = byName.get(previous.name());
        if (owners == null) return;
        owners.remove(sessionUuid);
        if (owners.isEmpty()) byName.remove(previous.name());
    }

    State check(UUID sessionUuid, String currentName, String localAccountId) {
        Bound bound = byUuid.get(sessionUuid);
        if (bound == null) return State.NO_SESSION;
        String name = canonical(currentName);
        if (name == null || localAccountId == null) return State.INVALID_NAME;
        if (!bound.name().equals(name) || !bound.localAccountId().equals(localAccountId))
            return State.ACCOUNT_CHANGED;
        Set<UUID> owners = byName.get(name);
        if (owners == null || owners.size() != 1 || !owners.contains(sessionUuid))
            return State.DUPLICATE_SESSION;
        return State.OK;
    }

    void clear() {
        byUuid.clear();
        byName.clear();
    }

    private static String canonical(String value) {
        if (value == null || !value.matches("[A-Za-z0-9_]{3,16}")) return null;
        return value.toLowerCase(Locale.ROOT);
    }
}
