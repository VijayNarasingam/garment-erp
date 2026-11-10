package com.garmentshop.erp.backup;

import com.garmentshop.erp.audit.AuditService;
import com.garmentshop.erp.common.ApiException;
import com.garmentshop.erp.config.AppProperties;
import com.garmentshop.erp.domain.BackupRecord;
import com.garmentshop.erp.domain.BackupStatus;
import com.garmentshop.erp.repository.BackupRecordRepository;
import com.garmentshop.erp.security.ApprovalService;
import com.garmentshop.erp.security.CurrentUserService;
import com.garmentshop.erp.security.Permissions;
import com.garmentshop.erp.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class BackupService {

    private static final DateTimeFormatter FILE_TIME = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");

    private final BackupRecordRepository backupRecordRepository;
    private final AppProperties appProperties;
    private final CurrentUserService currentUserService;
    private final ApprovalService approvalService;
    private final AuditService auditService;
    private final DataSource dataSource;
    private final JdbcTemplate jdbcTemplate;

    @Value("${spring.datasource.username:}")
    private String datasourceUsername;

    @Value("${spring.datasource.password:}")
    private String datasourcePassword;

    // ---------- Manual and scheduled backups ----------

    public BackupDtos.BackupResponse createManual() {
        currentUserService.requirePermission(Permissions.BACKUP_MANAGE);
        return runBackup("MANUAL", false);
    }

    @Scheduled(cron = "${app.backup.cron:0 30 1 * * *}")
    public void scheduledBackup() {
        if (!appProperties.backup().enabled()) {
            return;
        }
        try {
            runBackup("SCHEDULED", true);
            cleanupExpired();
        } catch (Exception ex) {
            log.error("Scheduled database backup failed", ex);
        }
    }

    private BackupDtos.BackupResponse runBackup(String type, boolean scheduled) {
        Long businessId = scheduled ? null : currentUserService.businessId();
        Long userId = scheduled ? null : currentUserService.userId();
        Path directory = backupsDirectory();
        String fileName = "garment-erp-" + FILE_TIME.format(LocalDateTime.now()) + "-"
                + type.toLowerCase(Locale.ENGLISH) + ".sql";
        Path file = directory.resolve(fileName).toAbsolutePath().normalize();

        BackupRecord record = new BackupRecord();
        record.setBusinessId(businessId);
        record.setFileName(fileName);
        record.setFilePath(file.toString());
        record.setStatus(BackupStatus.RUNNING);
        record.setType(type);
        record.setStartedAt(Instant.now());
        record.setCreatedBy(userId);
        backupRecordRepository.save(record);

        try {
            DatabaseInfo database = databaseInfo();
            executeBackup(database, file);
            if (!Files.exists(file) || Files.size(file) == 0) {
                throw new IllegalStateException("The backup command finished without producing a file.");
            }
            record.setSizeBytes(Files.size(file));
            record.setChecksum(sha256(file));
            record.setStatus(BackupStatus.SUCCESS);
            record.setMessage("Backup completed for " + database.product() + ".");
        } catch (Exception ex) {
            log.error("Backup {} failed", fileName, ex);
            record.setStatus(BackupStatus.FAILED);
            record.setMessage(truncate("Backup failed: " + rootMessage(ex)));
        }
        record.setFinishedAt(Instant.now());
        backupRecordRepository.save(record);

        auditService.record(businessId, null, userId,
                scheduled ? "system" : currentUserService.require().getUsername(),
                record.getStatus() == BackupStatus.SUCCESS ? "BACKUP_COMPLETED" : "BACKUP_FAILED",
                "BACKUP", String.valueOf(record.getId()), null,
                Map.of("fileName", fileName, "status", record.getStatus().name(),
                        "sizeBytes", record.getSizeBytes()),
                record.getMessage(), null, null);
        return response(record);
    }

    // ---------- Restore ----------

    public BackupDtos.BackupResponse restore(Long id, BackupDtos.RestoreRequest request) {
        currentUserService.requirePermission(Permissions.BACKUP_MANAGE);
        BackupRecord source = backupRecordRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Backup record not found."));
        if (source.getStatus() != BackupStatus.SUCCESS) {
            throw ApiException.badRequest("BACKUP_NOT_RESTORABLE", "Only successful backups can be restored.");
        }
        Path file = safeBackupPath(source);
        String expected = "RESTORE " + source.getFileName();
        if (!expected.equalsIgnoreCase(request.confirmation().trim())) {
            throw ApiException.badRequest("RESTORE_CONFIRMATION_REQUIRED",
                    "Type \"" + expected + "\" to confirm the restore.");
        }
        approvalService.authorize(request.approverUsername(), request.approverPin(),
                Permissions.BACKUP_MANAGE, null, request.reason());

        // A restore overwrites live data, so take a fresh backup first and abort if it fails.
        BackupDtos.BackupResponse safety = runBackup("PRE_RESTORE", false);
        if (!"SUCCESS".equals(safety.status())) {
            throw ApiException.conflict("PRE_RESTORE_BACKUP_FAILED",
                    "The safety backup failed. Restore was not started.");
        }

        UserPrincipal principal = currentUserService.require();
        BackupRecord record = new BackupRecord();
        record.setBusinessId(currentUserService.businessId());
        record.setFileName(source.getFileName());
        record.setFilePath(file.toString());
        record.setSizeBytes(source.getSizeBytes());
        record.setChecksum(source.getChecksum());
        record.setStatus(BackupStatus.RUNNING);
        record.setType("RESTORE");
        record.setStartedAt(Instant.now());
        record.setCreatedBy(principal.getId());
        backupRecordRepository.save(record);

        try {
            executeRestore(databaseInfo(), file);
            record.setStatus(BackupStatus.SUCCESS);
            record.setMessage("Restore completed. Safety backup: " + safety.fileName()
                    + ". Restart the application to clear cached state.");
        } catch (Exception ex) {
            log.error("Restore from {} failed", source.getFileName(), ex);
            record.setStatus(BackupStatus.FAILED);
            record.setMessage(truncate("Restore failed: " + rootMessage(ex)));
        }
        record.setFinishedAt(Instant.now());
        backupRecordRepository.save(record);

        auditService.log("DATABASE_RESTORED", "BACKUP", record.getId(),
                Map.of("sourceBackupId", source.getId(), "fileName", source.getFileName()),
                Map.of("status", record.getStatus().name(), "safetyBackup", safety.fileName()),
                request.reason(), null, null);
        return response(record);
    }

    // ---------- Listing and download ----------

    public List<BackupDtos.BackupResponse> records() {
        currentUserService.requirePermission(Permissions.BACKUP_MANAGE);
        return backupRecordRepository.findTop50ByOrderByIdDesc().stream().map(this::response).toList();
    }

    public Path backupFile(Long id) {
        currentUserService.requirePermission(Permissions.BACKUP_MANAGE);
        BackupRecord record = backupRecordRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Backup record not found."));
        return safeBackupPath(record);
    }

    // ---------- Database commands ----------

    private void executeBackup(DatabaseInfo database, Path file) throws IOException, InterruptedException {
        if ("H2".equals(database.product())) {
            String path = file.toString().replace("\\", "/").replace("'", "''");
            jdbcTemplate.execute("SCRIPT TO '" + path + "'");
            return;
        }
        if (!"MySQL".equals(database.product())) {
            throw new IllegalStateException("Unsupported database for backup: " + database.product());
        }
        String dump = appProperties.backup().mysqldumpPath();
        Path errorFile = Files.createTempFile("garment-erp-backup-", ".err");
        try {
            ProcessBuilder builder = new ProcessBuilder(dump,
                    "--host=" + database.host(),
                    "--port=" + database.port(),
                    "--user=" + database.username(),
                    "--single-transaction",
                    "--quick",
                    "--routines",
                    "--triggers",
                    "--default-character-set=utf8mb4",
                    database.database());
            builder.redirectOutput(file.toFile());
            builder.redirectError(errorFile.toFile());
            if (datasourcePassword != null && !datasourcePassword.isBlank()) {
                builder.environment().put("MYSQL_PWD", datasourcePassword);
            }
            run(builder, "mysqldump");
            String error = Files.readString(errorFile, StandardCharsets.UTF_8).trim();
            if (!error.isBlank()) {
                log.warn("mysqldump wrote to stderr: {}", truncate(error));
            }
        } finally {
            Files.deleteIfExists(errorFile);
        }
    }

    private void executeRestore(DatabaseInfo database, Path file) throws IOException, InterruptedException {
        if ("H2".equals(database.product())) {
            String path = file.toString().replace("\\", "/").replace("'", "''");
            jdbcTemplate.execute("RUNSCRIPT FROM '" + path + "'");
            return;
        }
        if (!"MySQL".equals(database.product())) {
            throw new IllegalStateException("Unsupported database for restore: " + database.product());
        }
        String mysql = appProperties.backup().mysqlPath();
        Path errorFile = Files.createTempFile("garment-erp-restore-", ".err");
        try {
            ProcessBuilder builder = new ProcessBuilder(mysql,
                    "--host=" + database.host(),
                    "--port=" + database.port(),
                    "--user=" + database.username(),
                    "--default-character-set=utf8mb4",
                    database.database());
            builder.redirectInput(file.toFile());
            builder.redirectOutput(ProcessBuilder.Redirect.DISCARD);
            builder.redirectError(errorFile.toFile());
            if (datasourcePassword != null && !datasourcePassword.isBlank()) {
                builder.environment().put("MYSQL_PWD", datasourcePassword);
            }
            run(builder, "mysql restore");
            String error = Files.readString(errorFile, StandardCharsets.UTF_8).trim();
            if (!error.isBlank()) {
                log.warn("mysql restore wrote to stderr: {}", truncate(error));
            }
        } finally {
            Files.deleteIfExists(errorFile);
        }
    }

    private void run(ProcessBuilder builder, String label) throws IOException, InterruptedException {
        Process process = builder.start();
        boolean finished = process.waitFor(15, TimeUnit.MINUTES);
        if (!finished) {
            process.destroyForcibly();
            throw new IllegalStateException(label + " timed out after 15 minutes.");
        }
        if (process.exitValue() != 0) {
            throw new IllegalStateException(label + " exited with code " + process.exitValue() + ".");
        }
    }

    private DatabaseInfo databaseInfo() {
        try (var connection = dataSource.getConnection()) {
            var metadata = connection.getMetaData();
            String product = metadata.getDatabaseProductName();
            String url = metadata.getURL();
            String username = metadata.getUserName();
            if (username == null || username.isBlank()) {
                username = datasourceUsername;
            }
            if ("H2".equals(product)) {
                return new DatabaseInfo(product, null, null, null, username);
            }
            if ("MySQL".equals(product)) {
                String prefix = "jdbc:mysql://";
                if (url == null || !url.startsWith(prefix)) {
                    throw new IllegalStateException("Unexpected MySQL JDBC URL.");
                }
                String rest = url.substring(prefix.length());
                String hostPort = rest.substring(0, rest.indexOf('/'));
                String database = rest.substring(rest.indexOf('/') + 1);
                int query = database.indexOf('?');
                if (query >= 0) {
                    database = database.substring(0, query);
                }
                String host = hostPort;
                String port = "3306";
                int colon = hostPort.lastIndexOf(':');
                if (colon >= 0) {
                    host = hostPort.substring(0, colon);
                    port = hostPort.substring(colon + 1);
                }
                if (!database.matches("[A-Za-z0-9_]+")) {
                    throw new IllegalStateException("Unsafe database name in JDBC URL.");
                }
                return new DatabaseInfo(product, host, port, database, username);
            }
            return new DatabaseInfo(product, null, null, null, username);
        } catch (Exception ex) {
            throw new IllegalStateException("Could not read database connection metadata.", ex);
        }
    }

    // ---------- Helpers ----------

    private Path backupsDirectory() {
        try {
            Path directory = Paths.get(appProperties.backupsDir()).toAbsolutePath().normalize();
            Files.createDirectories(directory);
            return directory;
        } catch (IOException ex) {
            throw new IllegalStateException("Could not create the backups directory.", ex);
        }
    }

    private Path safeBackupPath(BackupRecord record) {
        Path directory = backupsDirectory();
        Path file = Paths.get(record.getFilePath()).toAbsolutePath().normalize();
        if (!file.startsWith(directory)) {
            throw ApiException.forbidden("BACKUP_PATH_DENIED", "This backup file is outside the backups directory.");
        }
        if (!Files.exists(file)) {
            throw ApiException.notFound("Backup file not found on disk.");
        }
        return file;
    }

    private String sha256(Path file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (var input = Files.newInputStream(file)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                digest.update(buffer, 0, read);
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    private void cleanupExpired() {
        int retentionDays = appProperties.backup().retentionDays();
        if (retentionDays <= 0) {
            return;
        }
        Instant cutoff = Instant.now().minus(retentionDays, ChronoUnit.DAYS);
        for (BackupRecord record : backupRecordRepository.findAll()) {
            if ("RESTORE".equals(record.getType()) || record.getFinishedAt() == null
                    || record.getFinishedAt().isAfter(cutoff)) {
                continue;
            }
            try {
                Path file = Paths.get(record.getFilePath()).toAbsolutePath().normalize();
                if (file.startsWith(backupsDirectory()) && Files.deleteIfExists(file)) {
                    record.setMessage(truncate((record.getMessage() == null ? "" : record.getMessage())
                            + " | File removed after " + retentionDays + " days."));
                    backupRecordRepository.save(record);
                }
            } catch (Exception ex) {
                log.warn("Could not remove expired backup {}", record.getFileName(), ex);
            }
        }
    }

    private BackupDtos.BackupResponse response(BackupRecord record) {
        return new BackupDtos.BackupResponse(record.getId(), record.getFileName(), record.getSizeBytes(),
                record.getStatus().name(), record.getType(), record.getStartedAt(), record.getFinishedAt(),
                record.getMessage(), record.getCreatedBy(), record.getChecksum());
    }

    private String rootMessage(Throwable ex) {
        Throwable current = ex;
        while (current.getCause() != null) {
            current = current.getCause();
        }
        String message = current.getMessage();
        return message == null || message.isBlank() ? current.getClass().getSimpleName() : message;
    }

    private String truncate(String value) {
        if (value == null) {
            return null;
        }
        return value.length() <= 1000 ? value : value.substring(0, 1000);
    }

    private record DatabaseInfo(String product, String host, String port, String database, String username) {
    }
}
