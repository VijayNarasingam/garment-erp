package com.garmentshop.erp.security;

import com.garmentshop.erp.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.LongSupplier;

/**
 * Sliding-window login rate limiter keyed by client IP. Complements the per-account
 * lockout in AuthService so an attacker cannot spray many usernames from one host.
 */
@Component
public class LoginRateLimiter {

    private static final String DEFAULT_REMOTE_IP_HEADER = "X-Forwarded-For";

    private final int maxAttempts;
    private final long windowMillis;
    private final LongSupplier clock;
    private final String forwardHeadersStrategy;
    private final String remoteIpHeader;
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
    private final AtomicInteger calls = new AtomicInteger();

    @Autowired
    public LoginRateLimiter(
            @Value("${app.security.login-rate-limit.max-attempts:30}") int maxAttempts,
            @Value("${app.security.login-rate-limit.window-seconds:300}") long windowSeconds,
            @Value("${server.forward-headers-strategy:none}") String forwardHeadersStrategy,
            @Value("${server.tomcat.remoteip.remote-ip-header:X-Forwarded-For}") String remoteIpHeader) {
        this(maxAttempts, windowSeconds, System::currentTimeMillis, forwardHeadersStrategy, remoteIpHeader);
    }

    LoginRateLimiter(int maxAttempts, long windowSeconds, LongSupplier clock,
                     String forwardHeadersStrategy, String remoteIpHeader) {
        this.maxAttempts = Math.max(1, maxAttempts);
        this.windowMillis = Math.max(1, windowSeconds) * 1000L;
        this.clock = clock;
        this.forwardHeadersStrategy = forwardHeadersStrategy == null ? "none" : forwardHeadersStrategy.trim();
        this.remoteIpHeader = remoteIpHeader == null || remoteIpHeader.isBlank()
                ? DEFAULT_REMOTE_IP_HEADER
                : remoteIpHeader.trim();
    }

    /**
     * Convenience constructor for unit tests: forwarded headers are treated as trusted.
     */
    LoginRateLimiter(int maxAttempts, long windowSeconds, LongSupplier clock) {
        this(maxAttempts, windowSeconds, clock, "native", DEFAULT_REMOTE_IP_HEADER);
    }

    public void checkAndRecord(HttpServletRequest request) {
        String key = clientIp(request);
        long now = clock.getAsLong();
        Window window = windows.compute(key, (ignored, current) -> {
            if (current == null || now - current.startedAt >= windowMillis) {
                return new Window(now);
            }
            current.count++;
            return current;
        });
        if ((calls.incrementAndGet() & 255) == 0) {
            windows.entrySet().removeIf(entry -> now - entry.getValue().startedAt >= windowMillis);
        }
        if (window.count > maxAttempts) {
            long retryAfterSeconds = Math.max(1, (window.startedAt + windowMillis - now + 999) / 1000);
            throw ApiException.tooManyRequests("LOGIN_RATE_LIMITED",
                    "Too many login attempts from this device. Try again in " + retryAfterSeconds + " seconds.");
        }
    }

    private String clientIp(HttpServletRequest request) {
        if (trustsForwardedHeaders()) {
            String forwarded = request.getHeader(remoteIpHeader);
            if (forwarded != null && !forwarded.isBlank()) {
                String first = forwarded.split(",")[0].trim();
                if (!first.isEmpty()) {
                    return first;
                }
            }
        }
        return request.getRemoteAddr();
    }

    /**
     * A forwarded header is attacker controlled unless the deployment declares that the app
     * runs behind a reverse proxy ({@code server.forward-headers-strategy} other than
     * {@code none}). When it is trusted, the peer address has already been rewritten by the
     * container, so the remote address stays the fallback.
     */
    private boolean trustsForwardedHeaders() {
        return forwardHeadersStrategy != null
                && !forwardHeadersStrategy.isBlank()
                && !"none".equalsIgnoreCase(forwardHeadersStrategy);
    }

    private static final class Window {
        private final long startedAt;
        private int count = 1;

        private Window(long startedAt) {
            this.startedAt = startedAt;
        }
    }
}
