package com.garmentshop.erp.security;

import com.garmentshop.erp.config.AppProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;

@Service
public class JwtService {

    private static final String DEV_SECRET_PREFIX = "dev-only-secret-change-me";

    private final SecretKey key;
    private final long expirationMinutes;
    private final String issuer;

    public JwtService(AppProperties properties, Environment environment) {
        String secret = properties.jwt().secret();
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("JWT_SECRET must be at least 32 bytes. Configure a strong secret.");
        }
        if (environment.matchesProfiles("prod") && secret.startsWith(DEV_SECRET_PREFIX)) {
            throw new IllegalStateException(
                    "JWT_SECRET must be a unique production secret. Refusing to start with the development default.");
        }
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMinutes = properties.jwt().expirationMinutes();
        this.issuer = properties.jwt().issuer();
    }

    public String generate(UserPrincipal principal) {
        Instant now = Instant.now();
        return Jwts.builder()
                .issuer(issuer)
                .subject(String.valueOf(principal.getId()))
                .claim("username", principal.getUsername())
                .claim("name", principal.getFullName())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(expirationMinutes, ChronoUnit.MINUTES)))
                .signWith(key)
                .compact();
    }

    public Long parseUserId(String token) {
        Claims claims = Jwts.parser().verifyWith(key).requireIssuer(issuer).build()
                .parseSignedClaims(token).getPayload();
        return Long.valueOf(claims.getSubject());
    }

    public long expirationSeconds() {
        return expirationMinutes * 60;
    }
}
