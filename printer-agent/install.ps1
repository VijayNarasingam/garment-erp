<#
.SYNOPSIS
  Installs the Garment ERP local print agent on this Windows PC.

.DESCRIPTION
  Run this once on the billing PC from an elevated PowerShell window. It

    1. copies the agent to %ProgramData%\GarmentPrintAgent,
    2. compiles the raw spooler helper,
    3. writes config.json with a pairing token,
    4. reserves the http://127.0.0.1:<port>/ URL for this user,
    5. registers a hidden auto-start scheduled task that runs at logon,
    6. starts the agent and waits until /health answers.

  The pairing token is printed at the end. Paste it in
  Settings > Bill print > Connect.
#>
#Requires -Version 5.1
[CmdletBinding()]
param(
    [int]$Port = 17890,
    [string]$InstallDir = (Join-Path $env:ProgramData 'GarmentPrintAgent'),
    [switch]$ResetToken,
    [switch]$NoStart
)

$ErrorActionPreference = 'Stop'

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
    Write-Host 'Administrator rights are required. Re-launching elevated...' -ForegroundColor Yellow
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $MyInvocation.MyCommand.Path))
    if ($ResetToken) { $arguments += '-ResetToken' }
    if ($NoStart) { $arguments += '-NoStart' }
    $arguments += @('-Port', $Port)
    Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -Verb RunAs -ArgumentList $arguments
    exit 0
}

$sourceFolder = Split-Path -Parent $MyInvocation.MyCommand.Path
$agentSource = Join-Path $sourceFolder 'agent.ps1'
if (-not (Test-Path -LiteralPath $agentSource)) {
    throw "agent.ps1 was not found next to this script ($sourceFolder)."
}

Write-Host 'Installing the Garment ERP print agent...' -ForegroundColor Cyan

# --- 1. Files ---------------------------------------------------------------
if (-not (Test-Path -LiteralPath $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}
foreach ($folder in @('logs', 'queue')) {
    $path = Join-Path $InstallDir $folder
    if (-not (Test-Path -LiteralPath $path)) { New-Item -ItemType Directory -Path $path -Force | Out-Null }
}

$agentPath = Join-Path $InstallDir 'agent.ps1'
Copy-Item -LiteralPath $agentSource -Destination $agentPath -Force
Write-Host "  Agent installed at $agentPath"

# --- 2. Raw spooler helper --------------------------------------------------
$agentText = Get-Content -LiteralPath $agentPath -Raw
$match = [regex]::Match($agentText, "(?s)\`$script:RawSpoolerSource = @'\r?\n(.*?)\r?\n'@")
if (-not $match.Success) {
    throw 'Could not find the raw spooler source inside agent.ps1.'
}
$spoolerSource = $match.Groups[1].Value
$spoolerDll = Join-Path $InstallDir 'RawSpooler.dll'
if (Test-Path -LiteralPath $spoolerDll) { Remove-Item -LiteralPath $spoolerDll -Force }
try {
    Add-Type -TypeDefinition $spoolerSource -Language CSharp -OutputAssembly $spoolerDll -OutputType Library -ReferencedAssemblies 'System.dll' -ErrorAction Stop
} catch {
    Add-Type -TypeDefinition $spoolerSource -Language CSharp -OutputAssembly $spoolerDll -OutputType Library -ErrorAction Stop
}
Write-Host "  Raw spooler compiled to $spoolerDll"

# --- 3. Config --------------------------------------------------------------
$configPath = Join-Path $InstallDir 'config.json'
$token = $null
if (Test-Path -LiteralPath $configPath) {
    try {
        $existing = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
        if (-not $ResetToken) { $token = $existing.token }
    } catch { }
}
if (-not $token) {
    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $token = ([System.BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
}

[pscustomobject]@{
    host = '127.0.0.1'
    port = $Port
    token = $token
    installedAt = (Get-Date).ToString('o')
    version = '1.0.0'
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $configPath -Encoding UTF8
Write-Host "  Config written to $configPath"

# --- 4. URL reservation -----------------------------------------------------
$prefix = "http://127.0.0.1:$Port/"
netsh http delete urlacl url=$prefix | Out-Null
$account = "$env:USERDOMAIN\$env:USERNAME"
netsh http add urlacl url=$prefix user=$account | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Could not reserve $prefix for $account. Run this script as administrator."
}
Write-Host "  Reserved $prefix for $account"

# --- 5. Scheduled task ------------------------------------------------------
$taskName = 'GarmentPrintAgent'
$psExe = Join-Path $PSHOME 'powershell.exe'
if (-not (Test-Path -LiteralPath $psExe)) { $psExe = (Get-Process -Id $PID).Path }

$action = New-ScheduledTaskAction -Execute $psExe `
    -Argument ("-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"{0}`"" -f $agentPath) `
    -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -Hidden -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal `
    -Settings $settings -Description 'Garment ERP local thermal bill print agent (loopback only).' -Force | Out-Null
Write-Host "  Scheduled task '$taskName' registered (hidden, starts at logon)"

# --- 6. Start and verify ----------------------------------------------------
$healthy = $false
if (-not $NoStart) {
    Start-ScheduledTask -TaskName $taskName
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 1
        try {
            $response = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/health" -f $Port) -TimeoutSec 2
            if ($response.status -eq 'ok') {
                $healthy = $true
                break
            }
        } catch { }
    }
}

Write-Host ''
if ($healthy) {
    Write-Host 'The print agent is running.' -ForegroundColor Green
} elseif ($NoStart) {
    Write-Host 'The print agent was installed but not started (-NoStart).' -ForegroundColor Yellow
} else {
    Write-Host 'The print agent did not answer /health in time. Check the log folder:' -ForegroundColor Red
    Write-Host (Join-Path $InstallDir 'logs')
}

Write-Host ''
Write-Host 'Pairing token (paste in Settings > Bill print):' -ForegroundColor Cyan
Write-Host ("  {0}" -f $token) -ForegroundColor White
Write-Host ''
Write-Host 'Next steps:'
Write-Host '  1. Open Settings > Bill print in the app.'
Write-Host '  2. Paste the token above and press Connect.'
Write-Host '  3. Choose the 80 mm thermal printer (not the label printer).'
Write-Host '  4. Press Test print and check the paper, the QR code and the cut.'
Write-Host '  5. Turn on "Print bills automatically" when the test print is clean.'
