package com.garmentshop.erp.backup;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

@RestController
@RequestMapping("/api/backups")
@RequiredArgsConstructor
public class BackupController {

    private final BackupService backupService;

    @GetMapping
    @PreAuthorize("hasAuthority('backup.manage')")
    public List<BackupDtos.BackupResponse> records() {
        return backupService.records();
    }

    @PostMapping
    @PreAuthorize("hasAuthority('backup.manage')")
    public BackupDtos.BackupResponse create() {
        return backupService.createManual();
    }

    @PostMapping("/{id}/restore")
    @PreAuthorize("hasAuthority('backup.manage')")
    public BackupDtos.BackupResponse restore(@PathVariable Long id,
                                             @Valid @RequestBody BackupDtos.RestoreRequest request) {
        return backupService.restore(id, request);
    }

    @GetMapping("/{id}/download")
    @PreAuthorize("hasAuthority('backup.manage')")
    public ResponseEntity<Resource> download(@PathVariable Long id) throws Exception {
        Path file = backupService.backupFile(id);
        FileSystemResource resource = new FileSystemResource(file);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType("application/sql"));
        headers.setContentDisposition(ContentDisposition.attachment()
                .filename(file.getFileName().toString()).build());
        headers.setContentLength(Files.size(file));
        return ResponseEntity.ok().headers(headers).body(resource);
    }
}
