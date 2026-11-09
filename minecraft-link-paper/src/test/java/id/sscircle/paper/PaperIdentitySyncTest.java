package id.sscircle.paper;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PaperIdentitySyncTest {
    @Test void refreshAfterVerifiedSourceChangesWithoutAwaitingStats() {
        long now=1200000L;
        assertTrue(PaperIdentitySync.shouldSend(now,0,0,"","fastlogin-premium"));
        assertFalse(PaperIdentitySync.shouldSend(now,now-10000,0,"","fastlogin-premium"));
        assertTrue(PaperIdentitySync.shouldSend(now,now-70000,0,"","fastlogin-premium"));
        assertFalse(PaperIdentitySync.shouldSend(now,now-2000,now-2000,
            "fastlogin-premium","fastlogin-cracked"));
        assertTrue(PaperIdentitySync.shouldSend(now,now-16000,now-90000,
            "fastlogin-premium","fastlogin-cracked"));
    }

    @Test void repeatOnlyAfterTenMinutesWhenSourceUnchanged() {
        long now=1200000L;
        assertFalse(PaperIdentitySync.shouldSend(now,now-30000,now-100000,
            "fastlogin-premium","fastlogin-premium"));
        assertTrue(PaperIdentitySync.shouldSend(now,now-70000,now-610000,
            "fastlogin-premium","fastlogin-premium"));
        assertTrue(PaperIdentitySync.shouldSend(now,0,0,"","authme-session"));
    }
}
