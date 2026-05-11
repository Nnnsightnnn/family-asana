# =============================================================================
# Family Asana — admin.ps1
# =============================================================================
# Purpose:
#   One-stop wrapper around the boring ops chores for the self-hosted Family
#   Asana server. Meant to be run on the Windows host (where the NSSM service
#   `FamilyAsana` is installed) after you SSH in via Tailscale:
#
#       tailscale ssh kenny@family-asana
#       cd C:\family-asana
#       .\scripts\admin.ps1 <command> [args]
#
# Conventions / assumptions:
#   - Repo lives at        C:\family-asana\
#   - SQLite DB is at      C:\family-asana\server\data\family-asana.db
#   - NSSM logs land at    C:\family-asana\logs\{out,err}.log
#   - Backups go to        C:\family-asana\backups\
#
#   NOTE: WINDOWS-SETUP.md step 9 suggests OneDrive as a backup destination
#   (C:\Users\<you>\OneDrive\FamilyAsanaBackups\), but that path is per-user.
#   This script defaults to the simpler C:\family-asana\backups\ so it works
#   out of the box. If you'd rather drop straight into OneDrive, edit
#   $BackupDir below.
#
# Usage:
#   .\admin.ps1                       # prints help
#   .\admin.ps1 health
#   .\admin.ps1 restart-service
#   .\admin.ps1 tail-logs             # last 50 lines of each
#   .\admin.ps1 tail-logs 200         # last 200 lines of each
#   .\admin.ps1 backup-now
#   .\admin.ps1 list-users
# =============================================================================

param(
    [string]$Command,
    [int]$N = 50
)

$ErrorActionPreference = 'Stop'

# --- Configuration -----------------------------------------------------------
$DbPath     = 'C:\family-asana\server\data\family-asana.db'
$LogDir     = 'C:\family-asana\logs'
$OutLog     = Join-Path $LogDir 'out.log'
$ErrLog     = Join-Path $LogDir 'err.log'
$BackupDir  = 'C:\family-asana\backups'
$EnvFile    = 'C:\family-asana\server\.env'
$ServiceNm  = 'FamilyAsana'
$HealthUrl  = 'http://localhost:4000/health'

function Show-Help {
    Write-Host ""
    Write-Host "Family Asana admin script" -ForegroundColor Cyan
    Write-Host "Usage: .\admin.ps1 <command> [args]"
    Write-Host ""
    Write-Host "Commands:"
    Write-Host "  health              GET $HealthUrl and print the JSON"
    Write-Host "  restart-service     nssm restart $ServiceNm, then confirm RUNNING"
    Write-Host "  tail-logs [n]       Print last n lines of err.log and out.log (default 50)"
    Write-Host "  backup-now          Online-backup the SQLite DB to $BackupDir"
    Write-Host "  list-users          SELECT name, email FROM users (read-only)"
    Write-Host "  ai-status           Show whether AI task scoping is configured + which models"
    Write-Host ""
}

function Invoke-Health {
    try {
        $resp = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 5
        $resp | ConvertTo-Json -Depth 5
    } catch {
        Write-Error "Health check failed: $($_.Exception.Message)"
        exit 1
    }
}

function Invoke-RestartService {
    Write-Host "Restarting $ServiceNm via NSSM..." -ForegroundColor Cyan
    & nssm restart $ServiceNm
    if ($LASTEXITCODE -ne 0) {
        Write-Error "nssm restart returned exit code $LASTEXITCODE"
        exit 1
    }
    Start-Sleep -Seconds 2
    Write-Host ""
    Write-Host "Service status:" -ForegroundColor Cyan
    $status = & sc.exe query $ServiceNm
    $status
    if ($status -match 'RUNNING') {
        Write-Host ""
        Write-Host "OK: $ServiceNm is RUNNING." -ForegroundColor Green
    } else {
        Write-Error "$ServiceNm did not reach RUNNING state."
        exit 1
    }
}

function Invoke-TailLogs {
    param([int]$Tail)

    Write-Host "===== STDERR (last $Tail lines of $ErrLog) =====" -ForegroundColor Yellow
    if (Test-Path $ErrLog) {
        Get-Content $ErrLog -Tail $Tail
    } else {
        Write-Host "log not found: $ErrLog"
    }
    Write-Host ""
    Write-Host "===== STDOUT (last $Tail lines of $OutLog) =====" -ForegroundColor Yellow
    if (Test-Path $OutLog) {
        Get-Content $OutLog -Tail $Tail
    } else {
        Write-Host "log not found: $OutLog"
    }
}

function Invoke-BackupNow {
    if (-not (Test-Path $DbPath)) {
        Write-Error "SQLite DB not found at $DbPath"
        exit 1
    }
    if (-not (Test-Path $BackupDir)) {
        New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
        Write-Host "Created backup directory: $BackupDir"
    }

    $stamp = Get-Date -Format 'yyyy-MM-dd-HHmm'
    $dest  = Join-Path $BackupDir "family-asana-$stamp.db"

    # Prefer sqlite3 .backup (safe online backup). Fall back to Copy-Item.
    $sqlite = Get-Command sqlite3.exe -ErrorAction SilentlyContinue
    if ($sqlite) {
        Write-Host "Running sqlite3 .backup to $dest..." -ForegroundColor Cyan
        & sqlite3.exe $DbPath ".backup '$dest'"
        if ($LASTEXITCODE -ne 0) {
            Write-Error "sqlite3 .backup failed with exit code $LASTEXITCODE"
            exit 1
        }
    } else {
        Write-Host "sqlite3.exe not on PATH; falling back to Copy-Item (WAL-mode safe)." -ForegroundColor Yellow
        Copy-Item -Path $DbPath -Destination $dest -Force
    }

    if (Test-Path $dest) {
        $size = (Get-Item $dest).Length
        Write-Host "OK: backup written to $dest ($size bytes)." -ForegroundColor Green
    } else {
        Write-Error "Backup destination not found after copy: $dest"
        exit 1
    }
}

function Invoke-ListUsers {
    $sqlite = Get-Command sqlite3.exe -ErrorAction SilentlyContinue
    if (-not $sqlite) {
        Write-Error "sqlite3.exe not on PATH; install SQLite or add it to PATH."
        exit 1
    }
    if (-not (Test-Path $DbPath)) {
        Write-Error "SQLite DB not found at $DbPath"
        exit 1
    }

    Write-Host "Users (ordered by created_at):" -ForegroundColor Cyan
    Write-Host ""
    # -header + -column for readable output. Read-only query.
    & sqlite3.exe -header -column $DbPath "SELECT name, email FROM users ORDER BY created_at;"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "sqlite3 query failed with exit code $LASTEXITCODE"
        exit 1
    }
}

function Invoke-AiStatus {
    if (-not (Test-Path $EnvFile)) {
        Write-Error ".env not found at $EnvFile"
        exit 1
    }
    $lines = Get-Content $EnvFile
    function Get-EnvValue($name) {
        $match = $lines | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -First 1
        if ($null -eq $match) { return $null }
        return ($match -replace "^\s*$name\s*=\s*", '').Trim('"').Trim("'")
    }
    $key   = Get-EnvValue 'OPENROUTER_API_KEY'
    $fast  = Get-EnvValue 'OPENROUTER_FAST_MODEL'
    $smart = Get-EnvValue 'OPENROUTER_SMART_MODEL'
    $base  = Get-EnvValue 'OPENROUTER_BASE_URL'

    Write-Host "AI scoping (mobilization):" -ForegroundColor Cyan
    if ([string]::IsNullOrWhiteSpace($key)) {
        Write-Host "  status:       DISABLED (OPENROUTER_API_KEY is empty)" -ForegroundColor Yellow
        Write-Host "  effect:       'Get help' UI hidden; new-task form falls back to plain save."
    } else {
        $masked = $key.Substring(0, [Math]::Min(8, $key.Length)) + '...'
        Write-Host "  status:       ENABLED" -ForegroundColor Green
        Write-Host "  key:          $masked"
    }
    Write-Host "  base url:     $(if ($base) { $base } else { '(default) https://openrouter.ai/api/v1' })"
    Write-Host "  fast model:   $(if ($fast) { $fast } else { '(default) anthropic/claude-haiku-4.5' })"
    Write-Host "  smart model:  $(if ($smart) { $smart } else { '(default) anthropic/claude-sonnet-4.6' })"
}

# --- Dispatch ----------------------------------------------------------------
switch ($Command) {
    'health'          { Invoke-Health }
    'restart-service' { Invoke-RestartService }
    'tail-logs'       { Invoke-TailLogs -Tail $N }
    'backup-now'      { Invoke-BackupNow }
    'list-users'      { Invoke-ListUsers }
    'ai-status'       { Invoke-AiStatus }
    default           { Show-Help }
}
