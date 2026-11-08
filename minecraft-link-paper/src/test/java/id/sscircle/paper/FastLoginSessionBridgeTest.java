package id.sscircle.paper;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class FastLoginSessionBridgeTest {
    enum Session { PREMIUM, CRACKED, UNKNOWN, OTHER }

    @Test void mapsOnlyRecognizedSessionEvidence() {
        assertEquals(FastLoginSessionBridge.Status.PREMIUM,
            FastLoginSessionBridge.interpretStatus(Session.PREMIUM));
        assertEquals(FastLoginSessionBridge.Status.CRACKED,
            FastLoginSessionBridge.interpretStatus(Session.CRACKED));
        assertEquals(FastLoginSessionBridge.Status.UNKNOWN,
            FastLoginSessionBridge.interpretStatus(Session.UNKNOWN));
        assertEquals(FastLoginSessionBridge.Status.UNKNOWN,
            FastLoginSessionBridge.interpretStatus(Session.OTHER));
        assertEquals(FastLoginSessionBridge.Status.UNKNOWN,
            FastLoginSessionBridge.interpretStatus(null));
        assertEquals(FastLoginSessionBridge.Status.UNKNOWN,
            FastLoginSessionBridge.interpretStatus("PREMIUM"));
    }
}
