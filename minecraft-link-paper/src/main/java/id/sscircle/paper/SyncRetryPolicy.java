package id.sscircle.paper;

import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

/**
 * Bounded, shared network backoff for statistics and identity refresh.
 * HTTP Retry-After is honored for 429/503 without ever blocking Paper.
 */
final class SyncRetryPolicy {
    static final long MAX_DELAY_MS = 300_000L;
    private static final long MIN_DELAY_MS = 3_000L;

    private SyncRetryPolicy() {}

    static long nextBaseDelayMs(long currentMs) {
        long bounded = Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, currentMs));
        return Math.min(MAX_DELAY_MS, bounded * 2L);
    }

    static long delayMs(long currentMs, int httpStatus, String retryAfter,
                        long nowEpochMs, long jitterMs) {
        long base = Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, currentMs));
        long serverDelay = (httpStatus == 429 || httpStatus == 503)
            ? retryAfterMs(retryAfter, nowEpochMs) : 0L;
        long boundedJitter = Math.max(0L, Math.min(15_000L, jitterMs));
        return Math.min(MAX_DELAY_MS, Math.max(base, serverDelay) + boundedJitter);
    }

    static long retryAfterMs(String value, long nowEpochMs) {
        if (value == null || value.isBlank() || value.length() > 96) return 0L;
        String trimmed = value.trim();
        try {
            long seconds = Long.parseLong(trimmed);
            if (seconds < 0L) return 0L;
            return Math.min(MAX_DELAY_MS, seconds >= MAX_DELAY_MS / 1000L
                ? MAX_DELAY_MS : seconds * 1000L);
        } catch (NumberFormatException ignored) {
            // Retry-After also allows an RFC 1123 HTTP date.
        }
        try {
            long millis = ZonedDateTime.parse(trimmed, DateTimeFormatter.RFC_1123_DATE_TIME)
                .toInstant().toEpochMilli() - nowEpochMs;
            return Math.min(MAX_DELAY_MS, Math.max(0L, millis));
        } catch (DateTimeParseException ignored) {
            return 0L;
        }
    }
}
