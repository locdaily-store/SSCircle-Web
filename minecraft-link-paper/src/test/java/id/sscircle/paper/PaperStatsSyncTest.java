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
    @Test void freshFastLoginProofIsSentEvenWhenStatsDoNotChange() {
        var previous=new PaperStatsSync.Snapshot(UUID.randomUUID().toString(),
            "java_offline","76ed0ce1-5ae8-3d31-a1db-1ebce6ff1451",
            "authme-session","2026-11-08T10:00:00Z",0,0,0,0);
        assertTrue(PaperStatsSync.sameSnapshotAndEvidence(
            previous,"authme-session",0,0,0,0));
        assertFalse(PaperStatsSync.sameSnapshotAndEvidence(
            previous,"fastlogin-premium",0,0,0,0));
        assertFalse(PaperStatsSync.sameSnapshotAndEvidence(
            previous,"fastlogin-cracked",0,0,0,0));
        assertFalse(PaperStatsSync.sameSnapshotAndEvidence(
            previous,"authme-session",1,0,0,0));
        var premium=new PaperStatsSync.Snapshot(UUID.randomUUID().toString(),
            previous.provider(),previous.providerId(),"fastlogin-premium",
            "2026-11-08T10:01:00Z",0,0,0,0);
        assertFalse(PaperStatsSync.sameSnapshotAndEvidence(
            premium,"fastlogin-cracked",0,0,0,0));
    }

    @Test void fullQueueKeepsOldSnapshots() {
        var entries=new java.util.HashMap<String,PaperStatsSync.Snapshot>();
        for(int i=0;i<1024;i++)entries.put("id-"+i,null);
        assertTrue(PaperStatsSync.canQueue(entries,"id-1"));
        assertFalse(PaperStatsSync.canQueue(entries,"id-new"));
        assertEquals(1024,entries.size());
    }
    @Test void checksumChangesWhenSavedQueueIsTampered() throws Exception {
        var props=new java.util.Properties();
        var item=new PaperStatsSync.Snapshot(UUID.randomUUID().toString(),"bedrock",
            "12345678901234567","floodgate-xuid","2026-11-12T10:00:00Z",120,1,3,16);
        props.setProperty("item.0",item.toStorage());
        String digest=PaperStatsSync.queueDigest(props,1);
        assertEquals(64,digest.length());
        assertEquals(digest,PaperStatsSync.queueDigest(props,1));
        props.setProperty("item.0",item.toStorage()+"tampered");
        assertNotEquals(digest,PaperStatsSync.queueDigest(props,1));
        assertThrows(java.io.IOException.class,()->PaperStatsSync.queueDigest(props,2));
    }
}
