package com.garmentshop.erp.security;

import com.garmentshop.erp.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Sliding-window login rate limiter keyed by client IP. Complements the per-account
 * lockout in AuthService so an attacker cannot spray many usernames from one host.
 */
@Component
public class LoginRateLimiter {

    private final int maxAttempts;
    private final long windowMillis;
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
    private final AtomicInteger calls = new AtomicInteger();

    public LoginRateLimiter(
            @Value("${app.security.login-rate-limit.max-attempts:30}") int maxAttempts,
            @Value("${app.security.login-rate-limit.window-seconds:300}") long windowSeconds) {
        this.maxAttempts = Math.max(1, maxAttempts);
        this.windowMillis = Math.max(1, windowSeconds) * 1000L;
    }

    public void checkAndRecord(HttpServletRequest request) {
        String key = clientIp(request);
        long now = System.currentTimeMillis();
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
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            String first = forwarded.split(",")[0].trim();
            if (!first.isEmpty()) {
                return first;
            }
        }
        return request.getRemoteAddr();
    }

    private static final class Window {
        private final long startedAt;
        private int count = 1;

        private Window(long startedAt) {
            this.startedAt = startedAt;
        }
    }
}
