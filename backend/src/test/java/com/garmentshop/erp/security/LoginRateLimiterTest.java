package com.garmentshop.erp.security;

import com.garmentshop.erp.common.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

class LoginRateLimiterTest {

    @Test
    void blocksAfterMaxAttemptsFromTheSameIp() {
        AtomicLong now = new AtomicLong(1_000);
        LoginRateLimiter limiter = new LoginRateLimiter(3, 60, now::get);
        MockHttpServletRequest request = request("10.0.0.1");

        for (int attempt = 0; attempt < 3; attempt++) {
            assertThatCode(() -> limiter.checkAndRecord(request)).doesNotThrowAnyException();
        }

        ApiException error = catchThrowableOfType(() -> limiter.checkAndRecord(request), ApiException.class);
        assertThat(error.getCode()).isEqualTo("LOGIN_RATE_LIMITED");
        assertThat(error.getStatus().value()).isEqualTo(429);
    }

    @Test
    void tracksEachClientIpIndependently() {
        AtomicLong now = new AtomicLong(1_000);
        LoginRateLimiter limiter = new LoginRateLimiter(2, 60, now::get);
        MockHttpServletRequest first = request("10.0.0.1");
        MockHttpServletRequest second = request("10.0.0.2");

        limiter.checkAndRecord(first);
        limiter.checkAndRecord(first);
        assertThatCode(() -> limiter.checkAndRecord(second)).doesNotThrowAnyException();

        assertThat(catchThrowableOfType(() -> limiter.checkAndRecord(first), ApiException.class).getCode())
                .isEqualTo("LOGIN_RATE_LIMITED");
        assertThatCode(() -> limiter.checkAndRecord(second)).doesNotThrowAnyException();
    }

    @Test
    void usesTheFirstForwardedHopAsTheClientIp() {
        AtomicLong now = new AtomicLong(1_000);
        LoginRateLimiter limiter = new LoginRateLimiter(1, 60, now::get);

        MockHttpServletRequest proxied = request("10.0.0.1");
        proxied.addHeader("X-Forwarded-For", "203.0.113.9, 10.0.0.1");
        limiter.checkAndRecord(proxied);

        assertThat(catchThrowableOfType(() -> limiter.checkAndRecord(proxied), ApiException.class).getCode())
                .isEqualTo("LOGIN_RATE_LIMITED");

        MockHttpServletRequest otherClient = request("10.0.0.1");
        otherClient.addHeader("X-Forwarded-For", "203.0.113.10");
        assertThatCode(() -> limiter.checkAndRecord(otherClient)).doesNotThrowAnyException();
    }

    @Test
    void fallsBackToRemoteAddressWhenForwardedHeaderIsBlank() {
        AtomicLong now = new AtomicLong(1_000);
        LoginRateLimiter limiter = new LoginRateLimiter(1, 60, now::get);
        MockHttpServletRequest request = request("10.0.0.7");
        request.addHeader("X-Forwarded-For", "   ");

        limiter.checkAndRecord(request);

        assertThat(catchThrowableOfType(() -> limiter.checkAndRecord(request), ApiException.class).getCode())
                .isEqualTo("LOGIN_RATE_LIMITED");
    }

    @Test
    void allowsAgainAfterTheWindowExpires() {
        AtomicLong now = new AtomicLong(1_000);
        LoginRateLimiter limiter = new LoginRateLimiter(1, 60, now::get);
        MockHttpServletRequest request = request("10.0.0.1");

        limiter.checkAndRecord(request);
        assertThat(catchThrowableOfType(() -> limiter.checkAndRecord(request), ApiException.class).getCode())
                .isEqualTo("LOGIN_RATE_LIMITED");

        now.addAndGet(60_000);

        assertThatCode(() -> limiter.checkAndRecord(request)).doesNotThrowAnyException();
    }

    private MockHttpServletRequest request(String remoteAddress) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(remoteAddress);
        return request;
    }
}
