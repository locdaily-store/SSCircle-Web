package id.sscircle.paper;

import org.junit.jupiter.api.Test;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class IdentitySessionGuardTest {
    private static final String NAME = "LocalSteve";
    private static final String ID = AuthMeAccountId.fromPlayerName(NAME);

    @Test void requiresActualJoinBeforeAllowingAnyLocalIdentity() {
        var guard = new IdentitySessionGuard();
        UUID uuid = UUID.randomUUID();
        assertEquals(IdentitySessionGuard.State.NO_SESSION, guard.check(uuid, NAME, ID));
        guard.joined(uuid, NAME);
        assertEquals(IdentitySessionGuard.State.OK, guard.check(uuid, "localsteve", ID));
        guard.left(uuid);
        assertEquals(IdentitySessionGuard.State.NO_SESSION, guard.check(uuid, NAME, ID));
    }

    @Test void rejectsRenamedOrMutatedLocalAccountWithoutRelinking() {
        var guard = new IdentitySessionGuard();
        UUID uuid = UUID.randomUUID();
        guard.joined(uuid, NAME);
        assertEquals(IdentitySessionGuard.State.ACCOUNT_CHANGED,
            guard.check(uuid, "OtherSteve", ID));
        assertEquals(IdentitySessionGuard.State.ACCOUNT_CHANGED,
            guard.check(uuid, NAME, AuthMeAccountId.fromPlayerName("OtherSteve")));
        assertEquals(IdentitySessionGuard.State.INVALID_NAME,
            guard.check(uuid, "Illegal Name!", ID));
        assertEquals(IdentitySessionGuard.State.OK, guard.check(uuid, NAME, ID));
    }

    @Test void deniesConcurrentSameNameUntilConflictHasLeft() {
        var guard = new IdentitySessionGuard();
        UUID first = UUID.randomUUID(), second = UUID.randomUUID();
        guard.joined(first, NAME);
        guard.joined(second, "localsteve");
        assertEquals(IdentitySessionGuard.State.DUPLICATE_SESSION, guard.check(first, NAME, ID));
        assertEquals(IdentitySessionGuard.State.DUPLICATE_SESSION,
            guard.check(second, NAME, ID));
        guard.left(first);
        assertEquals(IdentitySessionGuard.State.OK, guard.check(second, NAME, ID));
    }

    @Test void clearingAndRebindingNeverCarriesOldSessionsAcrossRestarts() {
        var guard = new IdentitySessionGuard();
        UUID uuid = UUID.randomUUID();
        guard.joined(uuid, NAME);
        guard.clear();
        assertEquals(IdentitySessionGuard.State.NO_SESSION, guard.check(uuid, NAME, ID));
        guard.joined(uuid, NAME);
        assertEquals(IdentitySessionGuard.State.OK, guard.check(uuid, NAME, ID));
    }
}
