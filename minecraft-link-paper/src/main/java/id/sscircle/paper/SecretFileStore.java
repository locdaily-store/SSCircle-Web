package id.sscircle.paper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Paper-local secret fallback. Keeps credentials out of the public website,
 * plugin.yml, config.yml and Minecraft chat, independent of Windows launchers.
 *
 * Owner-only mode is used on POSIX filesystems when supported; Windows uses
 * the ACL inherited from the private server plugin directory.
 */
final class SecretFileStore {
    static final String FILE_NAME = "server-secret.txt";

    private SecretFileStore() {}

    static boolean isValidSecret(String secret) {
        if (secret == null || secret.length() < 32 || secret.length() > 256) return false;
        for (int i = 0; i < secret.length(); i++) {
            char character = secret.charAt(i);
            if (character < 33 || character > 126) return false;
        }
        return true;
    }

    static String loadOrCreate(Path directory) throws IOException {
        if (Files.isSymbolicLink(directory)) {
            throw new IOException("Secret directory cannot be a symbolic link.");
        }
        Files.createDirectories(directory);
        Path target = directory.resolve(FILE_NAME);
        if (Files.isSymbolicLink(target)) {
            throw new IOException("Secret file cannot be a symbolic link.");
        }
        if (!Files.exists(target, LinkOption.NOFOLLOW_LINKS)) {
            byte[] random = new byte[48];
            new SecureRandom().nextBytes(random);
            String generated = Base64.getUrlEncoder().withoutPadding().encodeToString(random);
            boolean created = false;
            try {
                try {
                    Files.createFile(target,
                        PosixFilePermissions.asFileAttribute(
                            PosixFilePermissions.fromString("rw-------")));
                } catch (UnsupportedOperationException windowsFileSystem) {
                    Files.createFile(target);
                }
                created = true;
            } catch (FileAlreadyExistsException simultaneousStart) {
                // A concurrent Paper process created the file first; only read it.
            }
            if (created) {
                Files.writeString(target, generated + System.lineSeparator(),
                    StandardCharsets.UTF_8, StandardOpenOption.WRITE);
            }
        }
        if (!Files.isRegularFile(target, LinkOption.NOFOLLOW_LINKS)
            || Files.size(target) > 1024) {
            throw new IOException("Secret file must be a small regular file.");
        }
        String value = Files.readString(target, StandardCharsets.UTF_8).strip();
        if (!isValidSecret(value)) {
            throw new IOException("Secret file must contain a single 32-256 character ASCII token.");
        }
        return value;
    }
}
