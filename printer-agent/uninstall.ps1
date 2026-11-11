<#
.SYNOPSIS
  Removes the Garment ERP local print agent from this Windows PC.

.DESCRIPTION
  Stops the agent, deletes the scheduled task and the URL reservation, and
  removes the installed files. Logs and the pairing token are kept unless
  -Purge is given.
#>
#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$InstallDir = (Join-Path $env:ProgramData 'GarmentPrintAgent'),
    [switch]$Purge
)

$ErrorActionPreference = 'Continue'

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
    Write-Host 'Administrator rights are required. Re-launching elevated...' -ForegroundColor Yellow
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $MyInvocation.MyCommand.Path))
    if ($Purge) { $arguments += '-Purge' }
    Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -Verb RunAs -ArgumentList $arguments
    exit 0
}

$taskName = 'GarmentPrintAgent'

Write-Host 'Stopping the print agent...'
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$InstallDir*" } |
    ForEach-Object {
        Write-Host "  Stopping process $($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

if (Test-Path -LiteralPath (Join-Path $InstallDir 'config.json')) {
    $port = (Get-Content -LiteralPath (Join-Path $InstallDir 'config.json') -Raw | ConvertFrom-Json).port
    netsh http delete urlacl url="http://127.0.0.1:$port/" | Out-Null
    Write-Host "  Removed the URL reservation for port $port"
}

if ($Purge) {
    if (Test-Path -LiteralPath $InstallDir) {
        Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  Removed $InstallDir"
    }
} else {
    foreach ($file in @('agent.ps1', 'RawSpooler.dll')) {
        $path = Join-Path $InstallDir $file
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue }
    }
    Write-Host "  Kept $InstallDir (logs and the pairing token). Use -Purge to remove everything."
}

Write-Host 'The print agent has been removed.' -ForegroundColor Green
