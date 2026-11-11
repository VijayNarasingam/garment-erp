package com.garmentshop.erp.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(
        Jwt jwt,
        Cors cors,
        String uploadsDir,
        String backupsDir,
        boolean demoData,
        String seedPassword,
        Notification notification,
        Backup backup,
        Server server
) {
    public record Server(
            String forwardHeadersStrategy,
            String tomcatRemoteIpHeader,
            String tomcatProxiesHeader,
            boolean trustLocalProxy
    ) {
    }
    public record Jwt(String secret, long expirationMinutes, String issuer) {
    }

    public record Cors(String allowedOrigins) {
    }

    public record Notification(Provider whatsapp, Provider sms, Provider email, Retry retry) {
        public record Provider(String provider, String apiUrl, String apiKey, String sender) {
        }

        public record Retry(int maxAttempts, int initialDelaySeconds) {
        }
    }

    public record Backup(boolean enabled, String cron, int retentionDays, String mysqldumpPath, String mysqlPath) {
    }
}
