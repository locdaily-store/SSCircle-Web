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
    @Test void neverTreatOfflineSessionAsOwnershipProof(){
        var premium=FastLoginSessionBridge.interpretProbe(Session.PREMIUM);
        assertEquals(FastLoginSessionBridge.Reason.PREMIUM_VERIFIED,premium.reason());
        assertEquals(FastLoginSessionBridge.Status.PREMIUM,premium.status());
        var offline=FastLoginSessionBridge.interpretProbe(Session.CRACKED);
        assertEquals(FastLoginSessionBridge.Reason.OFFLINE_SESSION,offline.reason());
        assertEquals(FastLoginSessionBridge.Status.CRACKED,offline.status());
        assertEquals(FastLoginSessionBridge.Reason.SESSION_UNKNOWN,
            FastLoginSessionBridge.interpretProbe(Session.UNKNOWN).reason());
        assertEquals(FastLoginSessionBridge.Reason.ADAPTER_INCOMPATIBLE,
            FastLoginSessionBridge.interpretProbe("PREMIUM").reason());
    }

    @Test void guidanceUsesPlayerFriendlyExplanationNotRawPluginInternals(){
        var offline=FastLoginSessionBridge.interpretProbe(Session.CRACKED);
        assertTrue(SSCirclePaperLinkPlugin.sessionStatusLabel(offline).contains("OFFLINE"));
        assertTrue(SSCirclePaperLinkPlugin.sessionHelpText(offline).contains("launcher resmi"));
        var premium=FastLoginSessionBridge.interpretProbe(Session.PREMIUM);
        assertTrue(SSCirclePaperLinkPlugin.sessionStatusLabel(premium).contains("PREMIUM"));
        assertFalse(SSCirclePaperLinkPlugin.sessionHelpText(premium).contains("Non-Premium"));
    }
}

