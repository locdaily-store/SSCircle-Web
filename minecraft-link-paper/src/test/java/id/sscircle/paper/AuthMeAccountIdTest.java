package id.sscircle.paper;

import org.junit.jupiter.api.Test;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class AuthMeAccountIdTest {
    @Test void stableAcrossNameCaseAndAlwaysOfflineV3() {
        String a=AuthMeAccountId.fromPlayerName("Steve_123");
        String b=AuthMeAccountId.fromPlayerName("STEVE_123");
        assertEquals(a,b);
        assertEquals(3,UUID.fromString(a).version());
        assertNotEquals(a,AuthMeAccountId.fromPlayerName("Alex_123"));
    }
    @Test void refusesInvalidOrUntrustedUsername() {
        assertNull(AuthMeAccountId.fromPlayerName(null));
        assertNull(AuthMeAccountId.fromPlayerName("Steve A"));
        assertNull(AuthMeAccountId.fromPlayerName("a"));
        assertNull(AuthMeAccountId.fromPlayerName("a".repeat(17)));
        assertNull(AuthMeAccountId.fromPlayerName("a/b"));
    }
}
