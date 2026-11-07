package id.sscircle.paper;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class SecretFileStoreTest {
    @TempDir Path root;

    @Test
    void generatesSecureTokenOnceAndReusesItAcrossRestarts() throws Exception {
        Path dir = root.resolve("plugins").resolve("SSCirclePlayerSync");
        String first = SecretFileStore.loadOrCreate(dir);
        assertTrue(SecretFileStore.isValidSecret(first));
        assertTrue(first.length() >= 60);
        assertEquals(first, SecretFileStore.loadOrCreate(dir));
        assertEquals(first, Files.readString(dir.resolve("server-secret.txt")).strip());
    }

    @Test
    void acceptsExistingCloudflareTokenWithoutOverwritingIt() throws Exception {
        Path dir = root.resolve("plugins");
        Files.createDirectories(dir);
        String alreadyDeployed = "example-cloudflare-key-do-not-share-abcdefghijklmnopqrstuvwxyz";
        Files.writeString(dir.resolve("server-secret.txt"), alreadyDeployed + "\n");
        assertEquals(alreadyDeployed, SecretFileStore.loadOrCreate(dir));
        assertEquals(alreadyDeployed + "\n", Files.readString(dir.resolve("server-secret.txt")));
    }

    @Test
    void rejectsShortWhitespaceOrMultilineTokensWithoutReplacingThem() throws Exception {
        Path dir = root.resolve("plugins");
        Files.createDirectories(dir);
        Path path = dir.resolve("server-secret.txt");
        for (String invalid : new String[]{"too-short", "a".repeat(40) + " " + "b".repeat(12),
            "a".repeat(40) + "\n" + "b".repeat(40), "a".repeat(257)}) {
            Files.writeString(path, invalid);
            assertThrows(IOException.class, () -> SecretFileStore.loadOrCreate(dir));
            assertEquals(invalid, Files.readString(path));
        }
    }

    @Test
    void generatedSecretsAreDistinctAndDoNotContainUnsafeWhitespace() throws Exception {
        String first=SecretFileStore.loadOrCreate(root.resolve("first"));
        String second=SecretFileStore.loadOrCreate(root.resolve("second"));
        assertNotEquals(first,second);
        assertFalse(first.contains("\n"));
        assertFalse(first.contains(" "));
    }

    @Test
    void localFileWinsAgainstStaleWindowsEnvironment() throws Exception {
        Path dir = root.resolve("prefer-local");
        Files.createDirectories(dir);
        String expected = "C".repeat(64);
        Files.writeString(dir.resolve("server-secret.txt"), expected + "\n");
        var chosen = SecretFileStore.resolve(dir, "W".repeat(64));
        assertEquals(expected, chosen.value());
        assertEquals("file privat plugin", chosen.source());
        assertFalse(chosen.generated());
    }

    @Test
    void validEnvironmentIsUsedWhenNoLocalFileExists() throws Exception {
        Path dir = root.resolve("environment");
        String expected = "E".repeat(64);
        var chosen = SecretFileStore.resolve(dir, expected);
        assertEquals(expected, chosen.value());
        assertEquals("environment proses Paper", chosen.source());
        assertFalse(Files.exists(dir.resolve("server-secret.txt")));
    }

    @Test
    void invalidLocalFileFailsClosedInsteadOfUsingEnvironment() throws Exception {
        Path dir = root.resolve("invalid-local");
        Files.createDirectories(dir);
        Files.writeString(dir.resolve("server-secret.txt"), "too-short");
        assertThrows(IOException.class, () -> SecretFileStore.resolve(dir, "E".repeat(64)));
    }

}
