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
#   Local backups land in C:\family-asana\backups\. Offsite backups (Cloudflare
#   R2) are handled by `offsite-push`, which calls `backup-now` and then
#   `aws s3 cp`s the snapshot to the bucket configured via BACKUP_R2_* in
#   server\.env. See docs/WINDOWS-SETUP.md step 9 for the full setup.
#
# Usage:
#   .\admin.ps1                       # prints help
#   .\admin.ps1 health
#   .\admin.ps1 restart-service
#   .\admin.ps1 tail-logs             # last 50 lines of each
#   .\admin.ps1 tail-logs 200         # last 200 lines of each
#   .\admin.ps1 backup-now
#   .\admin.ps1 offsite-push          # backup-now + upload to Cloudflare R2
#   .\admin.ps1 offsite-verify        # download latest R2 backup, integrity_check it
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
$BackupLog  = Join-Path $LogDir 'backup.log'
$BackupDir  = 'C:\family-asana\backups'
$EnvFile    = 'C:\family-asana\server\.env'
$ServiceNm  = 'FamilyAsana'
$HealthUrl  = 'http://localhost:4000/health'

# --- Shared helpers ----------------------------------------------------------
function Get-EnvValue {
    param([string]$Name)
    if (-not (Test-Path $EnvFile)) { return $null }
    $match = (Get-Content $EnvFile) |
        Where-Object { $_ -match "^\s*$Name\s*=" } |
        Select-Object -First 1
    if ($null -eq $match) { return $null }
    return ($match -replace "^\s*$Name\s*=\s*", '').Trim('"').Trim("'")
}

function Write-BackupLog {
    param([string]$Message)
    $ts   = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$ts] $Message"
    Write-Host $line
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    Add-Content -Path $BackupLog -Value $line
}

function Show-Help {
    Write-Host ""
    Write-Host "Family Asana admin script" -ForegroundColor Cyan
    Write-Host "Usage: .\admin.ps1 <command> [args]"
    Write-Host ""
    Write-Host "Commands:"
    Write-Host "  health              GET $HealthUrl and print the JSON"
    Write-Host "  restart-service     nssm restart $ServiceNm, then confirm RUNNING"
    Write-Host "  tail-logs [n]       Print last n lines of err.log, out.log, backup.log (default 50)"
    Write-Host "  backup-now          Online-backup the SQLite DB to $BackupDir"
    Write-Host "  offsite-push        backup-now + upload to Cloudflare R2 (no-op if BACKUP_R2_BUCKET empty)"
    Write-Host "  offsite-verify      Download latest R2 backup and PRAGMA integrity_check it"
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
    Write-Host ""
    Write-Host "===== BACKUP (last $Tail lines of $BackupLog) =====" -ForegroundColor Yellow
    if (Test-Path $BackupLog) {
        Get-Content $BackupLog -Tail $Tail
    } else {
        Write-Host "log not found: $BackupLog"
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

function Invoke-OffsitePush {
    # Read R2 config from server/.env.
    $bucket   = Get-EnvValue 'BACKUP_R2_BUCKET'
    $endpoint = Get-EnvValue 'BACKUP_R2_ENDPOINT'
    $keyId    = Get-EnvValue 'BACKUP_R2_ACCESS_KEY_ID'
    $secret   = Get-EnvValue 'BACKUP_R2_SECRET_ACCESS_KEY'

    if ([string]::IsNullOrWhiteSpace($bucket)) {
        Write-BackupLog "offsite-push: BACKUP_R2_BUCKET empty; skipping (offsite disabled)."
        exit 0
    }
    if ([string]::IsNullOrWhiteSpace($endpoint) -or
        [string]::IsNullOrWhiteSpace($keyId)   -or
        [string]::IsNullOrWhiteSpace($secret)) {
        Write-BackupLog "offsite-push: ERROR - BACKUP_R2_* incomplete (need ENDPOINT, ACCESS_KEY_ID, SECRET_ACCESS_KEY)."
        exit 1
    }

    $aws = Get-Command aws -ErrorAction SilentlyContinue
    if (-not $aws) {
        Write-BackupLog "offsite-push: ERROR - aws CLI not on PATH. Install from https://aws.amazon.com/cli/"
        exit 1
    }

    # 1. Produce a fresh local snapshot (same code path as backup-now).
    Invoke-BackupNow

    # 2. Find the file we just wrote.
    $latest = Get-ChildItem -Path $BackupDir -Filter '*.db' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $latest) {
        Write-BackupLog "offsite-push: ERROR - no .db in $BackupDir after backup-now (unexpected)."
        exit 1
    }

    # 3. Upload to R2. Scope creds to this process via env vars; clear after.
    $env:AWS_ACCESS_KEY_ID     = $keyId
    $env:AWS_SECRET_ACCESS_KEY = $secret
    # R2 doesn't use regions but the CLI insists one be set.
    if ([string]::IsNullOrWhiteSpace($env:AWS_DEFAULT_REGION)) {
        $env:AWS_DEFAULT_REGION = 'auto'
    }

    $key  = $latest.Name
    $size = $latest.Length
    Write-BackupLog "offsite-push: uploading $key ($size bytes) to s3://$bucket/ via $endpoint"

    & aws s3 cp $latest.FullName "s3://$bucket/$key" --endpoint-url $endpoint --only-show-errors
    $code = $LASTEXITCODE

    Remove-Item Env:AWS_ACCESS_KEY_ID     -ErrorAction SilentlyContinue
    Remove-Item Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue

    if ($code -eq 0) {
        Write-BackupLog "offsite-push: OK - $key uploaded to s3://$bucket/."
        exit 0
    } else {
        Write-BackupLog "offsite-push: ERROR - aws s3 cp failed with exit code $code."
        exit 1
    }
}

function Invoke-OffsiteVerify {
    $bucket   = Get-EnvValue 'BACKUP_R2_BUCKET'
    $endpoint = Get-EnvValue 'BACKUP_R2_ENDPOINT'
    $keyId    = Get-EnvValue 'BACKUP_R2_ACCESS_KEY_ID'
    $secret   = Get-EnvValue 'BACKUP_R2_SECRET_ACCESS_KEY'

    if ([string]::IsNullOrWhiteSpace($bucket)) {
        Write-BackupLog "offsite-verify: BACKUP_R2_BUCKET empty; nothing to verify."
        exit 0
    }
    if ([string]::IsNullOrWhiteSpace($endpoint) -or
        [string]::IsNullOrWhiteSpace($keyId)   -or
        [string]::IsNullOrWhiteSpace($secret)) {
        Write-BackupLog "offsite-verify: ERROR - BACKUP_R2_* incomplete."
        exit 1
    }

    $aws = Get-Command aws -ErrorAction SilentlyContinue
    if (-not $aws) {
        Write-BackupLog "offsite-verify: ERROR - aws CLI not on PATH."
        exit 1
    }
    $sqlite = Get-Command sqlite3.exe -ErrorAction SilentlyContinue
    if (-not $sqlite) {
        Write-BackupLog "offsite-verify: ERROR - sqlite3.exe not on PATH."
        exit 1
    }

    $env:AWS_ACCESS_KEY_ID     = $keyId
    $env:AWS_SECRET_ACCESS_KEY = $secret
    if ([string]::IsNullOrWhiteSpace($env:AWS_DEFAULT_REGION)) {
        $env:AWS_DEFAULT_REGION = 'auto'
    }

    Write-BackupLog "offsite-verify: listing s3://$bucket/ ..."
    $listing  = & aws s3 ls "s3://$bucket/" --endpoint-url $endpoint 2>&1
    $listCode = $LASTEXITCODE
    if ($listCode -ne 0) {
        Write-BackupLog "offsite-verify: ERROR - aws s3 ls failed (exit $listCode): $listing"
        Remove-Item Env:AWS_ACCESS_KEY_ID     -ErrorAction SilentlyContinue
        Remove-Item Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
        exit 1
    }

    # Backup filenames are family-asana-yyyy-MM-dd-HHmm.db, so lex sort == chronological.
    $latestKey = $listing |
        Where-Object { $_ -match '\.db\s*$' } |
        ForEach-Object { ($_ -split '\s+')[-1] } |
        Sort-Object -Descending |
        Select-Object -First 1

    if ([string]::IsNullOrWhiteSpace($latestKey)) {
        Write-BackupLog "offsite-verify: ERROR - no .db objects in s3://$bucket/."
        Remove-Item Env:AWS_ACCESS_KEY_ID     -ErrorAction SilentlyContinue
        Remove-Item Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
        exit 1
    }

    $tempPath = Join-Path $env:TEMP 'family-asana-offsite-verify.db'
    Write-BackupLog "offsite-verify: downloading $latestKey to $tempPath"
    & aws s3 cp "s3://$bucket/$latestKey" $tempPath --endpoint-url $endpoint --only-show-errors
    $dlCode = $LASTEXITCODE

    Remove-Item Env:AWS_ACCESS_KEY_ID     -ErrorAction SilentlyContinue
    Remove-Item Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue

    if ($dlCode -ne 0) {
        Write-BackupLog "offsite-verify: ERROR - download failed (exit $dlCode)."
        if (Test-Path $tempPath) { Remove-Item $tempPath -Force -ErrorAction SilentlyContinue }
        exit 1
    }

    $result      = & sqlite3.exe $tempPath 'PRAGMA integrity_check;' 2>&1
    $checkCode   = $LASTEXITCODE
    $resultText  = ($result | Out-String).Trim()

    if (Test-Path $tempPath) { Remove-Item $tempPath -Force -ErrorAction SilentlyContinue }

    if ($checkCode -eq 0 -and $resultText -match '^ok') {
        Write-BackupLog "offsite-verify: OK - $latestKey integrity_check=ok"
        exit 0
    } else {
        Write-BackupLog "offsite-verify: ERROR - $latestKey integrity_check FAILED (exit $checkCode): $resultText"
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
    'offsite-push'    { Invoke-OffsitePush }
    'offsite-verify'  { Invoke-OffsiteVerify }
    'list-users'      { Invoke-ListUsers }
    'ai-status'       { Invoke-AiStatus }
    default           { Show-Help }
}
