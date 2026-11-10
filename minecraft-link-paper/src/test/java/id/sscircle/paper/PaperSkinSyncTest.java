package id.sscircle.paper;

import org.bukkit.profile.PlayerTextures;
import org.junit.jupiter.api.Test;
import java.net.URI;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.*;

class PaperSkinSyncTest {
    private static final String TEX="https://textures.minecraft.net/texture/"+"a".repeat(64);
    @Test void urlGuardAcceptsOnlyOfficialMinecraftTextureHost() {
        assertEquals(TEX,PaperSkinSync.validatedTexture(TEX));
        assertEquals(TEX,PaperSkinSync.validatedTexture(TEX.replace("https:","http:")));
        for(String invalid:new String[]{"https://evil.example/texture/"+"a".repeat(64),
            "https://textures.minecraft.net.evil.example/texture/"+"a".repeat(64),
            "https://textures.minecraft.net/texture/../../private",
            "https://textures.minecraft.net/texture/"+"x".repeat(64),
            "https://textures.minecraft.net/texture/"+"a".repeat(64)+"?x=1"}) {
            assertNull(PaperSkinSync.validatedTexture(invalid));
        }
    }
    @Test void snapshotCarriesOfflineProviderIdentityNotAClaimOfPremium()throws Exception {
        var identity=new SSCirclePaperLinkPlugin.Identity("java_offline",
            "70a89d54-c32e-3942-a553-34f71cfde04d","fastlogin-cracked","Minecraft Java");
        var snapshot=PaperSkinSync.capture(identity,URI.create(TEX).toURL(),
            PlayerTextures.SkinModel.SLIM,Instant.parse("2026-11-10T00:00:00Z"));
        assertNotNull(snapshot);
        assertEquals("java_offline",snapshot.provider());
        assertEquals("slim",snapshot.model());
        assertTrue(snapshot.json().contains("\\\"authSource\\\":\\\"fastlogin-cracked\\\""));
        assertFalse(snapshot.json().contains("java_premium"));
    }
}
