package id.sscircle.paper;

import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import static org.junit.jupiter.api.Assertions.*;

class SyncRetryPolicyTest {
    @Test void exponentialBackoffIsBounded() {
        assertEquals(6_000L, SyncRetryPolicy.nextBaseDelayMs(3_000L));
        assertEquals(300_000L, SyncRetryPolicy.nextBaseDelayMs(200_000L));
        assertEquals(300_000L, SyncRetryPolicy.nextBaseDelayMs(Long.MAX_VALUE));
    }

    @Test void rateLimitsHonorRetryAfterWithoutUnboundedWait() {
        assertEquals(15_000L, SyncRetryPolicy.delayMs(3_000L, 429, "15", 0L, 0L));
        assertEquals(300_000L, SyncRetryPolicy.delayMs(3_000L, 503, "999999", 0L, 2_000L));
        assertEquals(3_000L, SyncRetryPolicy.delayMs(3_000L, 403, "120", 0L, 0L));
        assertEquals(5_000L, SyncRetryPolicy.delayMs(3_000L, -1, null, 0L, 2_000L));
    }

    @Test void parsesDateAndRejectsMalformedHeader() {
        long now=Instant.parse("2026-11-10T00:00:00Z").toEpochMilli();
        String later=DateTimeFormatter.RFC_1123_DATE_TIME.format(
            Instant.ofEpochMilli(now+30_000L).atZone(ZoneOffset.UTC));
        assertEquals(30_000L, SyncRetryPolicy.retryAfterMs(later, now));
        assertEquals(0L, SyncRetryPolicy.retryAfterMs("-1", now));
        assertEquals(0L, SyncRetryPolicy.retryAfterMs("not-a-date", now));
        assertEquals(0L, SyncRetryPolicy.retryAfterMs(null, now));
    }
}
