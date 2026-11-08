package id.sscircle.paper;

import org.junit.jupiter.api.Test;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class PaperStatsSyncTest {
    @Test void snapshotStorageRoundTripAndNoDerivedTotals() {
        var snap = new PaperStatsSync.Snapshot(UUID.randomUUID().toString(),
            "java_offline","76ed0ce1-5ae8-3d31-a1db-1ebce6ff1451",
            "authme-session","2026-11-08T10:00:00Z",9501,2,17,302);
        var restored = PaperStatsSync.Snapshot.fromStorage(snap.toStorage());
        assertEquals(snap,restored);
        assertTrue(snap.toJson().contains("\"playtimeSeconds\":9501"));
        assertTrue(snap.toJson().contains("\"blocksMined\":302"));
        assertTrue(snap.toJson().contains("\"authSource\":\"authme-session\""));
    }

    @Test void rejectsInvalidOrNegativeQueuedStatistics() {
        assertNull(PaperStatsSync.Snapshot.fromStorage(""));
        assertNull(PaperStatsSync.Snapshot.fromStorage("invalid"));
        String id=UUID.randomUUID().toString();
        String body=id+"|bedrock|12345678901234567|floodgate-xuid|2026-11-08T10:00:00Z|8|-1|1|1";
        assertNull(PaperStatsSync.Snapshot.fromStorage(body));
    }
}
