<#
.SYNOPSIS
  Local print agent for the Garment ERP thermal bill printer.

.DESCRIPTION
  A dependency-free Windows agent (Windows PowerShell 5.1) that receives raw
  ESC/POS bytes from the ERP app and spools them to a selected Windows printer.

  It listens on 127.0.0.1 only and requires a pairing token on every call
  except /health:

    GET  /health    -> liveness, version and queue depth (no token needed)
    GET  /printers  -> printers installed on this PC
    POST /print     -> { printer, jobName, dataBase64, copies }

  Printing itself happens in a single worker process, so bills are never
  interleaved and /health keeps answering while a receipt is on the paper.

  Run with -Worker to start the print worker role (started automatically).
#>
#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$Worker,
    [int]$ParentPid = 0,
    [string]$InstallDir = (Join-Path $env:ProgramData 'GarmentPrintAgent')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$script:Version = '1.0.0'
$script:StartedAt = Get-Date
$script:MaxDecodedBytes = 524288     # 512 KB of raw printer bytes
$script:MaxBodyBytes = 1048576       # 1 MB request body
$script:RateLimitPerMinute = 60
$script:JobTimeoutSeconds = 10
$script:QueueFolder = Join-Path $InstallDir 'queue'
$script:LogFolder = Join-Path $InstallDir 'logs'
$script:ConfigPath = Join-Path $InstallDir 'config.json'
$script:SpoolerDll = Join-Path $InstallDir 'RawSpooler.dll'
$script:WorkerProcess = $null
$script:PrintPool = $null
$script:ScriptPath = $MyInvocation.MyCommand.Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

function Get-AgentConfig {
    if (Test-Path -LiteralPath $script:ConfigPath) {
        try {
            $config = Get-Content -LiteralPath $script:ConfigPath -Raw | ConvertFrom-Json
            if (-not $config.PSObject.Properties.Name -contains 'columns') {
                $config | Add-Member -NotePropertyName columns -NotePropertyValue ([pscustomobject]@{}) -Force
            }
            return $config
        } catch {
            Write-Log 'ERROR' "config.json could not be read: $($_.Exception.Message)"
        }
    }
    return [pscustomobject]@{ port = 17890; host = '127.0.0.1'; token = ''; columns = [pscustomobject]@{} }
}

function Save-AgentConfig($config) {
    $config | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $script:ConfigPath -Encoding UTF8
}

function Get-CalibratedColumns {
    param($Config, [string]$Printer)
    if (-not $Printer) { return 0 }
    try {
        $value = $Config.columns.$Printer
        if ($null -eq $value) { return 0 }
        $number = [int]$value
        if ($number -lt 24 -or $number -gt 64) { return 0 }
        return $number
    } catch {
        return 0
    }
}

# ---------------------------------------------------------------------------
# Logging: one file per day, seven days kept, 5 MB cap per file
# ---------------------------------------------------------------------------

function Write-Log {
    param([string]$Level = 'INFO', [string]$Message)
    try {
        if (-not (Test-Path -LiteralPath $script:LogFolder)) {
            New-Item -ItemType Directory -Path $script:LogFolder -Force | Out-Null
        }
        $file = Join-Path $script:LogFolder ("agent-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))
        $line = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
        Add-Content -LiteralPath $file -Value $line -Encoding UTF8

        if ((Get-Item -LiteralPath $file).Length -gt 5MB) {
            Move-Item -LiteralPath $file -Destination ($file + '.1') -Force
        }
        $cutoff = (Get-Date).AddDays(-7)
        Get-ChildItem -LiteralPath $script:LogFolder -Filter 'agent-*.log*' -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTime -lt $cutoff } |
            Remove-Item -Force -ErrorAction SilentlyContinue
    } catch {
        # Logging must never break printing.
    }
}

# ---------------------------------------------------------------------------
# Printers
# ---------------------------------------------------------------------------

function Get-StatusText($code) {
    switch ([int]$code) {
        1 { 'Paused' }
        2 { 'Error' }
        3 { 'Idle' }
        4 { 'Printing' }
        5 { 'Offline' }
        6 { 'Waiting' }
        7 { 'Stopped' }
        default { 'Unknown' }
    }
}

function Test-VirtualPrinter($name, $portName) {
    if ($name -match '(?i)Microsoft Print to PDF|OneNote|XPS|Print to OneNote|Fax') { return $true }
    if ($portName -match '^(?i)PORTPROMPT|FILE|NUL') { return $true }
    return $false
}

function Test-LabelPrinter($name, $driverName) {
    $pattern = '(?i)label|barcode|zebra|tsc|gprinter|xprinter|dxp|te\d{3}|rider|posiflex|datamax|argox|citizen'
    return (($name -match $pattern) -or ($driverName -match $pattern))
}

function Get-PaperInfo {
    param([string]$Printer)
    $info = [pscustomobject]@{ paperWidthMm = 0; suggestedColumns = 0 }
    try {
        Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue
        $settings = New-Object System.Drawing.Printing.PrinterSettings
        $settings.PrinterName = $Printer
        $size = $settings.PaperSize
        if ($size -and $size.Width -gt 0) {
            $mm = [math]::Round($size.Width * 0.254, 1)
            $dots = [math]::Round($mm / 25.4 * 203)
            $info.paperWidthMm = $mm
            $info.suggestedColumns = [math]::Floor($dots / 12)
        }
    } catch {
        # Not every driver reports a paper size. The calibration print covers it.
    }
    return $info
}

function Get-PrinterList {
    param($Config)
    $items = @()
    $defaultName = $null

    # Win32_Printer sees every installed printer, including drivers that the
    # PrintManagement module skips (some ESC/POS roll drivers are one of them).
    try {
        $cim = @(Get-CimInstance -ClassName Win32_Printer -ErrorAction Stop)
        $default = $cim | Where-Object { $_.Default } | Select-Object -First 1
        if ($default) { $defaultName = $default.Name }
        $items = $cim | ForEach-Object {
            [pscustomobject]@{
                Name       = $_.Name
                DriverName = $_.DriverName
                PortName   = $_.PortName
                Status     = Get-StatusText $_.PrinterStatus
                Type       = if ($_.Network) { 'Network' } else { 'Local' }
            }
        }
    } catch {
        Write-Log 'WARN' "CIM printer list unavailable: $($_.Exception.Message)"
    }

    if ($items.Count -eq 0) {
        try {
            $items = Get-Printer -ErrorAction Stop | ForEach-Object {
                [pscustomobject]@{
                    Name       = $_.Name
                    DriverName = $_.DriverName
                    PortName   = $_.PortName
                    Status     = [string]$_.PrinterStatus
                    Type       = [string]$_.Type
                }
            }
        } catch {
            Write-Log 'WARN' "Get-Printer unavailable: $($_.Exception.Message)"
        }
    } else {
        # The PrintManagement module has friendlier status words.
        try {
            $known = @{}
            Get-Printer -ErrorAction Stop | ForEach-Object { $known[$_.Name] = $_ }
            foreach ($item in $items) {
                if ($known.ContainsKey($item.Name)) { $item.Status = [string]$known[$item.Name].PrinterStatus }
            }
        } catch { }
    }

    $result = @()
    foreach ($printer in $items) {
        if (-not $printer.Name) { continue }
        $paper = Get-PaperInfo $printer.Name
        $result += [pscustomobject]@{
            name               = $printer.Name
            driverName         = $printer.DriverName
            portName           = $printer.PortName
            status             = $printer.Status
            isDefault          = ($printer.Name -eq $defaultName)
            isVirtual          = (Test-VirtualPrinter $printer.Name $printer.PortName)
            isLabelPrinter     = (Test-LabelPrinter $printer.Name $printer.DriverName)
            paperWidthMm       = $paper.paperWidthMm
            suggestedColumns   = $paper.suggestedColumns
            calibratedColumns  = (Get-CalibratedColumns $Config $printer.Name)
        }
    }
    return $result
}

# ---------------------------------------------------------------------------
# Raw spooler (Win32 winspool). Compiled once by the installer; compiled in
# memory as a fallback so the agent always works.
# ---------------------------------------------------------------------------

$script:RawSpoolerSource = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

namespace GarmentPrint
{
    public static class RawSpooler
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct DOC_INFO_1
        {
            [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
            [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
            [MarshalAs(UnmanagedType.LPWStr)] public string pDatatype;
        }

        [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool OpenPrinter(string pPrinterName, out IntPtr hPrinter, IntPtr pDefault);

        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool ClosePrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool StartDocPrinter(IntPtr hPrinter, int Level, ref DOC_INFO_1 pDocInfo);

        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool EndDocPrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool StartPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool EndPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

        /// <summary>Spools raw bytes to a printer as a RAW job.</summary>
        public static void Print(string printerName, string documentName, byte[] data)
        {
            if (data == null || data.Length == 0)
            {
                throw new ArgumentException("No data to print.", "data");
            }

            IntPtr handle;
            if (!OpenPrinter(printerName, out handle, IntPtr.Zero))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "OpenPrinter failed for " + printerName);
            }

            try
            {
                DOC_INFO_1 info = new DOC_INFO_1
                {
                    pDocName = string.IsNullOrEmpty(documentName) ? "Receipt" : documentName,
                    pOutputFile = null,
                    pDatatype = "RAW"
                };

                if (!StartDocPrinter(handle, 1, ref info))
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "StartDocPrinter failed");
                }
                if (!StartPagePrinter(handle))
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "StartPagePrinter failed");
                }

                int written;
                if (!WritePrinter(handle, data, data.Length, out written))
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "WritePrinter failed");
                }

                EndPagePrinter(handle);
                EndDocPrinter(handle);
            }
            finally
            {
                ClosePrinter(handle);
            }
        }
    }
}
'@

function Initialize-Spooler {
    if ('GarmentPrint.RawSpooler' -as [type]) { return }
    if (Test-Path -LiteralPath $script:SpoolerDll) {
        try {
            Add-Type -Path $script:SpoolerDll -ErrorAction Stop
            return
        } catch {
            Write-Log 'WARN' "RawSpooler.dll could not be loaded, compiling in memory: $($_.Exception.Message)"
        }
    }
    Add-Type -TypeDefinition $script:RawSpoolerSource -Language CSharp -ErrorAction Stop
}

function Invoke-RawPrint {
    param([string]$Printer, [string]$JobName, [byte[]]$Data, [int]$Copies = 1)
    Initialize-Spooler
    for ($copy = 1; $copy -le $Copies; $copy++) {
        [GarmentPrint.RawSpooler]::Print($Printer, $JobName, $Data)
    }
}

# ---------------------------------------------------------------------------
# Worker role: owns the printer, one job at a time
# ---------------------------------------------------------------------------

function Invoke-WorkerLoop {
    Write-Log 'INFO' "Worker started (parent pid $ParentPid)."
    if (-not (Test-Path -LiteralPath $script:QueueFolder)) {
        New-Item -ItemType Directory -Path $script:QueueFolder -Force | Out-Null
    }

    while ($true) {
        if ($ParentPid -gt 0) {
            $parent = Get-Process -Id $ParentPid -ErrorAction SilentlyContinue
            if (-not $parent) {
                Write-Log 'INFO' 'Agent process is gone, worker exiting.'
                break
            }
        }

        $job = Get-ChildItem -LiteralPath $script:QueueFolder -Filter '*.job.json' -ErrorAction SilentlyContinue |
            Sort-Object Name | Select-Object -First 1

        if (-not $job) {
            Start-Sleep -Milliseconds 120
            continue
        }

        $id = [System.IO.Path]::GetFileNameWithoutExtension($job.Name) -replace '\.job$', ''
        $resultPath = Join-Path $script:QueueFolder ("$id.result.json")
        $dataPath = Join-Path $script:QueueFolder ("$id.bin")

        try {
            $descriptor = Get-Content -LiteralPath $job.FullName -Raw | ConvertFrom-Json
            $bytes = [System.IO.File]::ReadAllBytes($dataPath)
            Write-Log 'INFO' ("Printing {0} copy/copies on '{1}' as '{2}' ({3} bytes)." -f $descriptor.copies, $descriptor.printer, $descriptor.jobName, $bytes.Length)
            Invoke-RawPrint -Printer $descriptor.printer -JobName $descriptor.jobName -Data $bytes -Copies ([int]$descriptor.copies)
            $result = [pscustomobject]@{ ok = $true; jobId = $id; printer = $descriptor.printer; bytes = $bytes.Length; copies = [int]$descriptor.copies }
        } catch {
            Write-Log 'ERROR' "Print job $id failed: $($_.Exception.Message)"
            $result = [pscustomobject]@{ ok = $false; jobId = $id; error = $_.Exception.Message }
        }

        try {
            $result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $resultPath -Encoding UTF8
            Remove-Item -LiteralPath $job.FullName -Force -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath $dataPath -Force -ErrorAction SilentlyContinue
        } catch {
            Write-Log 'ERROR' "Could not finalise job $id : $($_.Exception.Message)"
        }
    }
}

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

function Get-PropertyValue {
    param($Object, [string]$Name, $Default = $null)
    if ($null -eq $Object) { return $Default }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $Default }
    if ($null -eq $property.Value) { return $Default }
    return $property.Value
}

function Add-CorsHeaders {
    param($Context)
    $origin = $Context.Request.Headers['Origin']
    if ($origin) {
        $Context.Response.Headers['Access-Control-Allow-Origin'] = $origin
        $Context.Response.Headers['Vary'] = 'Origin'
    }
    $Context.Response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    $Context.Response.Headers['Access-Control-Allow-Headers'] = 'X-Print-Agent-Token, Content-Type'
    $Context.Response.Headers['Access-Control-Allow-Private-Network'] = 'true'
    $Context.Response.Headers['Access-Control-Max-Age'] = '600'
}

function Send-Json {
    param($Context, [int]$Status, $Payload)
    $json = ($Payload | ConvertTo-Json -Depth 6 -Compress)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    Add-CorsHeaders $Context
    $Context.Response.StatusCode = $Status
    $Context.Response.ContentType = 'application/json; charset=utf-8'
    $Context.Response.ContentLength64 = $bytes.Length
    $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Context.Response.OutputStream.Close()
}

function Send-Error {
    param($Context, [int]$Status, [string]$Code, [string]$Message)
    Send-Json $Context $Status ([pscustomobject]@{ code = $Code; message = $Message })
}

function Test-HostHeader {
    param($Context)
    $hostHeader = $Context.Request.Headers['Host']
    if (-not $hostHeader) { return $false }
    $name = ($hostHeader -split ':')[0].Trim().ToLowerInvariant()
    return ($name -eq '127.0.0.1' -or $name -eq 'localhost' -or $name -eq '::1' -or $name -eq '::1')
}

function Test-Token {
    param($Context, $Token)
    if (-not $Token) { return $false }
    $presented = $Context.Request.Headers['X-Print-Agent-Token']
    if (-not $presented) { return $false }
    return ([string]$presented).Trim() -eq ([string]$Token).Trim()
}

function Test-RateLimit {
    param([string]$Key, $State)
    $now = [DateTime]::UtcNow
    if (-not $State.ContainsKey($Key)) { $State[$Key] = New-Object System.Collections.ArrayList }
    $bucket = $State[$Key]
    while ($bucket.Count -gt 0 -and ($now - $bucket[0]).TotalSeconds -gt 60) { $bucket.RemoveAt(0) }
    if ($bucket.Count -ge $script:RateLimitPerMinute) { return $false }
    [void]$bucket.Add($now)
    return $true
}

function Get-RequestBody {
    param($Context)
    $length = $Context.Request.ContentLength64
    if ($length -gt $script:MaxBodyBytes) {
        throw [System.InvalidOperationException]::new('BODY_TOO_LARGE')
    }
    $memory = New-Object System.IO.MemoryStream
    $buffer = New-Object byte[] 8192
    $read = 0
    do {
        $read = $Context.Request.InputStream.Read($buffer, 0, $buffer.Length)
        if ($read -gt 0) { $memory.Write($buffer, 0, $read) }
        if ($memory.Length -gt $script:MaxBodyBytes) { throw [System.InvalidOperationException]::new('BODY_TOO_LARGE') }
    } while ($read -gt 0)
    return $memory.ToArray()
}

# The print response is written from a runspace so the request loop stays free
# while the thermal printer is still working.
$script:PrintWaitScript = {
    param($Context, $Id, $ResultPath, $TimeoutSeconds, $Warning)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $result = $null
    while ((Get-Date) -lt $deadline) {
        if (Test-Path -LiteralPath $ResultPath) {
            try { $result = Get-Content -LiteralPath $ResultPath -Raw | ConvertFrom-Json } catch { $result = $null }
            break
        }
        Start-Sleep -Milliseconds 60
    }
    Remove-Item -LiteralPath $ResultPath -Force -ErrorAction SilentlyContinue

    $status = 500
    $payload = @{
        code    = 'PRINT_FAILED'
        message = "The printer did not finish within $TimeoutSeconds seconds. Check the paper before retrying."
    }
    if ($result -and $result.ok) {
        $status = 200
        $payload = @{
            jobId   = $result.jobId
            printer = $result.printer
            bytes   = $result.bytes
            copies  = $result.copies
            warning = $Warning
        }
    } elseif ($result -and (-not $result.ok)) {
        $payload = @{ code = 'PRINT_FAILED'; message = [string]$result.error }
    }

    $json = ($payload | ConvertTo-Json -Depth 6 -Compress)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    try {
        $origin = $Context.Request.Headers['Origin']
        if ($origin) {
            $Context.Response.Headers['Access-Control-Allow-Origin'] = $origin
            $Context.Response.Headers['Vary'] = 'Origin'
        }
        $Context.Response.Headers['Access-Control-Allow-Private-Network'] = 'true'
        $Context.Response.StatusCode = $status
        $Context.Response.ContentType = 'application/json; charset=utf-8'
        $Context.Response.ContentLength64 = $bytes.Length
        $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        $Context.Response.OutputStream.Close()
    } catch {
    }
}

function Initialize-PrintPool {
    if ($script:PrintPool) { return }
    $script:PrintPool = [runspacefactory]::CreateRunspacePool(1, 3)
    $script:PrintPool.Open()
}

function Start-PrintWait {
    param($Context, $Id, $ResultPath, $Warning)
    Initialize-PrintPool
    $shell = [powershell]::Create()
    $shell.RunspacePool = $script:PrintPool
    [void]$shell.AddScript($script:PrintWaitScript.ToString())
    [void]$shell.AddArgument($Context)
    [void]$shell.AddArgument($Id)
    [void]$shell.AddArgument($ResultPath)
    [void]$shell.AddArgument($script:JobTimeoutSeconds)
    [void]$shell.AddArgument($Warning)
    [void]$shell.BeginInvoke()
}

# ---------------------------------------------------------------------------
# Agent role
# ---------------------------------------------------------------------------

function Start-WorkerProcess {
    try {
        $shell = (Get-Process -Id $PID).Path
        $scriptPath = $script:ScriptPath
        $arguments = @(
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-WindowStyle', 'Hidden',
            '-File', ('"{0}"' -f $scriptPath),
            '-Worker',
            '-ParentPid', $PID,
            '-InstallDir', ('"{0}"' -f $InstallDir)
        )
        $process = Start-Process -FilePath $shell -ArgumentList $arguments -WindowStyle Hidden -PassThru
        Write-Log 'INFO' "Worker process started (pid $($process.Id))."
        return $process
    } catch {
        Write-Log 'ERROR' "Could not start the worker process: $($_.Exception.Message)"
        return $null
    }
}

function Ensure-Worker {
    if ($script:WorkerProcess) {
        try {
            if (-not $script:WorkerProcess.HasExited) { return $script:WorkerProcess }
        } catch { }
    }
    $script:WorkerProcess = Start-WorkerProcess
    return $script:WorkerProcess
}

function Invoke-PrintJob {
    param($Context, $Body, $Config)

    try {
        $json = [System.Text.Encoding]::UTF8.GetString([byte[]]$Body)
        $request = $json | ConvertFrom-Json
    } catch {
        Write-Log 'ERROR' "Print body could not be parsed (length $(@($Body).Count)): $($json)"
        Send-Error $Context 400 'INVALID_JSON' 'The request body is not valid JSON.'
        return
    }

    $printer = [string](Get-PropertyValue $request 'printer' '')
    if (-not $printer) {
        Send-Error $Context 400 'INVALID_REQUEST' 'A printer name is required.'
        return
    }

    $known = @(Get-PrinterList $Config | Where-Object { $_.name -eq $printer })
    if ($known.Count -eq 0) {
        Send-Error $Context 404 'UNKNOWN_PRINTER' "The printer '$printer' is not installed on this PC."
        return
    }

    $copies = 1
    $requestedCopies = Get-PropertyValue $request 'copies' $null
    if ($null -ne $requestedCopies -and "$requestedCopies" -ne '') {
        $copies = [int]$requestedCopies
    }
    if ($copies -lt 1 -or $copies -gt 3) {
        Send-Error $Context 400 'INVALID_COPIES' 'Copies must be between 1 and 3.'
        return
    }

    $raw = [string](Get-PropertyValue $request 'dataBase64' '')
    if (-not $raw) {
        Send-Error $Context 400 'INVALID_REQUEST' 'dataBase64 is required.'
        return
    }

    try {
        $bytes = [System.Convert]::FromBase64String($raw)
    } catch {
        Send-Error $Context 400 'INVALID_PAYLOAD' 'dataBase64 is not valid base64.'
        return
    }

    if ($bytes.Length -gt $script:MaxDecodedBytes) {
        Send-Error $Context 413 'PAYLOAD_TOO_LARGE' 'The receipt is larger than 512 KB.'
        return
    }

    $jobName = [string](Get-PropertyValue $request 'jobName' '')
    if (-not $jobName) { $jobName = 'Receipt' }

    if (-not (Test-Path -LiteralPath $script:QueueFolder)) {
        New-Item -ItemType Directory -Path $script:QueueFolder -Force | Out-Null
    }

    $id = [Guid]::NewGuid().ToString('N').Substring(0, 8)
    $dataPath = Join-Path $script:QueueFolder ("$id.bin")
    $jobPath = Join-Path $script:QueueFolder ("$id.job.json")
    $resultPath = Join-Path $script:QueueFolder ("$id.result.json")

    [System.IO.File]::WriteAllBytes($dataPath, $bytes)
    [pscustomobject]@{
        id      = $id
        printer = $printer
        jobName = $jobName
        copies  = $copies
        bytes   = $bytes.Length
        created = (Get-Date).ToString('o')
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $jobPath -Encoding UTF8

    $script:WorkerProcess = Ensure-Worker

    $warning = $null
    if ($known[0].isLabelPrinter) { $warning = 'This printer looks like a label or barcode printer.' }
    if ($known[0].isVirtual) { $warning = 'This printer is virtual (PDF or file).' }

    Write-Log 'INFO' "Job $id queued for '$printer' ($copies copy/copies, $($bytes.Length) bytes)."
    Start-PrintWait $Context $id $resultPath $warning
}

function Invoke-Agent {
    $config = Get-AgentConfig
    if (-not $config.token) {
        Write-Log 'ERROR' 'No pairing token configured. Run install.ps1 to create one.'
    }

    $prefix = "http://{0}:{1}/" -f $config.host, $config.port
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($prefix)
    $listener.Start()
    Write-Log 'INFO' "Print agent $script:Version listening on $prefix."

    $script:WorkerProcess = Ensure-Worker
    $rateState = @{}

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $path = $context.Request.Url.AbsolutePath.TrimEnd('/')
        if (-not $path) { $path = '/' }
        $method = $context.Request.HttpMethod

        try {
            if (-not (Test-HostHeader $context)) {
                Send-Error $context 403 'BAD_HOST' 'Only local requests are accepted.'
                continue
            }

            if ($method -eq 'OPTIONS') {
                Add-CorsHeaders $context
                $context.Response.StatusCode = 204
                $context.Response.Close()
                continue
            }

            $remote = $context.Request.RemoteEndPoint.Address
            if (-not (Test-RateLimit $remote $rateState)) {
                Send-Error $context 429 'RATE_LIMITED' 'Too many requests. Wait a minute and try again.'
                continue
            }

            if ($path -eq '/health') {
                $queueDepth = 0
                if (Test-Path -LiteralPath $script:QueueFolder) {
                    $queueDepth = @(Get-ChildItem -LiteralPath $script:QueueFolder -Filter '*.job.json' -ErrorAction SilentlyContinue).Count
                }
                Send-Json $context 200 ([pscustomobject]@{
                    status        = 'ok'
                    version       = $script:Version
                    uptimeSeconds = [int]((Get-Date) - $script:StartedAt).TotalSeconds
                    queueDepth    = $queueDepth
                })
                continue
            }

            if (-not (Test-Token $context $config.token)) {
                Send-Error $context 401 'UNAUTHORIZED' 'A valid pairing token is required.'
                continue
            }

            switch ($path) {
                '/printers' {
                    $printers = @(Get-PrinterList $config)
                    $default = $printers | Where-Object { $_.isDefault } | Select-Object -First 1
                    Send-Json $context 200 ([pscustomobject]@{
                        defaultPrinter = if ($default) { $default.name } else { $null }
                        printers       = $printers
                    })
                }
                '/printer-columns' {
                    if ($method -ne 'POST') {
                        Send-Error $context 405 'METHOD_NOT_ALLOWED' 'Use POST for /printer-columns.'
                        break
                    }
                    $body = $null
                    try {
                        $body = Get-RequestBody $context
                    } catch {
                        Send-Error $context 400 'INVALID_REQUEST' 'The request body could not be read.'
                        break
                    }
                    try {
                        $request = ([System.Text.Encoding]::UTF8.GetString([byte[]]$body)) | ConvertFrom-Json
                    } catch {
                        Send-Error $context 400 'INVALID_JSON' 'The request body is not valid JSON.'
                        break
                    }
                    $printer = [string](Get-PropertyValue $request 'printer' '')
                    if (-not $printer) {
                        Send-Error $context 400 'INVALID_REQUEST' 'A printer name is required.'
                        break
                    }
                    $columns = [int](Get-PropertyValue $request 'columns' 0)
                    if ($columns -lt 0 -or $columns -gt 64) {
                        Send-Error $context 400 'INVALID_COLUMNS' 'Columns must be between 0 and 64.'
                        break
                    }
                    if ($columns -gt 0 -and $columns -lt 24) {
                        Send-Error $context 400 'INVALID_COLUMNS' 'Columns must be at least 24.'
                        break
                    }
                    if ($columns -gt 0) {
                        $config.columns | Add-Member -NotePropertyName $printer -NotePropertyValue $columns -Force
                    } else {
                        $config.columns.PSObject.Properties.Remove($printer)
                    }
                    try {
                        Save-AgentConfig $config
                    } catch {
                        # The measurement still applies to this browser even if the
                        # agent cannot write its config file.
                        Write-Log 'WARN' "Could not save the calibration: $($_.Exception.Message)"
                    }
                    Write-Log 'INFO' "Calibrated '$printer' to $columns characters per line."
                    Send-Json $context 200 ([pscustomobject]@{ printer = $printer; columns = $columns })
                }
                '/print' {
                    if ($method -ne 'POST') {
                        Send-Error $context 405 'METHOD_NOT_ALLOWED' 'Use POST for /print.'
                        break
                    }
                    $body = $null
                    try {
                        $body = Get-RequestBody $context
                    } catch {
                        if ($_.Exception.Message -eq 'BODY_TOO_LARGE') {
                            Send-Error $context 413 'BODY_TOO_LARGE' 'The request body is larger than 1 MB.'
                        } else {
                            Send-Error $context 400 'INVALID_REQUEST' 'The request body could not be read.'
                        }
                        break
                    }
                    Invoke-PrintJob $context $body $config
                }
                default {
                    Send-Error $context 404 'NOT_FOUND' "Unknown path '$path'."
                }
            }
        } catch {
            Write-Log 'ERROR' "Unhandled error: $($_.Exception.Message)"
            try {
                Send-Error $context 500 'AGENT_ERROR' 'The print agent hit an unexpected error.'
            } catch { }
        }
    }
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if ($Worker) {
    Invoke-WorkerLoop
    exit 0
}

try {
    Invoke-Agent
} catch {
    Write-Log 'ERROR' "Agent stopped: $($_.Exception.Message)"
    Write-Log 'ERROR' "Stack: $($_.ScriptStackTrace)"
    exit 1
}
