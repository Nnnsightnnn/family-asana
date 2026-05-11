# =============================================================================
# Family Asana — verify-backup.ps1
# =============================================================================
# Purpose:
#   Smoke-test the most recent SQLite backup by running PRAGMA integrity_check
#   against a temp copy of it. Catches "the backup file is corrupt and you only
#   find out the day your house burns down" — silent backup rot.
#
#   Intended to run weekly via Task Scheduler. See WINDOWS-SETUP.md for the
#   schtasks one-liner.
#
# Exit codes:
#   0 — integrity_check returned "ok"
#   1 — no backups found, or integrity_check failed
# =============================================================================

$ErrorActionPreference = 'Stop'

$BackupDir = 'C:\family-asana\backups'
$TempPath  = Join-Path $env:TEMP 'family-asana-verify.db'

# 1. Find the most recently modified .db file in the backup folder.
if (-not (Test-Path $BackupDir)) {
    Write-Error "Backup directory not found: $BackupDir"
    exit 1
}

$latest = Get-ChildItem -Path $BackupDir -Filter '*.db' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $latest) {
    Write-Error "No .db backup files found in $BackupDir"
    exit 1
}

$file = $latest.FullName
Write-Host "Verifying: $file"

# 2. Copy it to temp (clobber any existing file).
try {
    Copy-Item -Path $file -Destination $TempPath -Force
} catch {
    Write-Error "Failed to copy backup to temp: $($_.Exception.Message)"
    exit 1
}

# 3. Run sqlite3 integrity_check, capture stdout.
$sqlite = Get-Command sqlite3.exe -ErrorAction SilentlyContinue
if (-not $sqlite) {
    Write-Error "sqlite3.exe not on PATH; install SQLite or add it to PATH."
    if (Test-Path $TempPath) { Remove-Item $TempPath -Force -ErrorAction SilentlyContinue }
    exit 1
}

$result = $null
$exitCode = 0
try {
    $result = & sqlite3.exe $TempPath 'PRAGMA integrity_check;' 2>&1
    $exitCode = $LASTEXITCODE
} catch {
    Write-Error "sqlite3 invocation threw: $($_.Exception.Message)"
    if (Test-Path $TempPath) { Remove-Item $TempPath -Force -ErrorAction SilentlyContinue }
    exit 1
}

# Normalize result to a string (sqlite3 prints "ok" on one line when healthy).
$resultText = ($result | Out-String).Trim()

# 4. Inspect the output.
if ($exitCode -eq 0 -and $resultText -match '^ok') {
    Write-Host "integrity_check: ok ($file)"
    if (Test-Path $TempPath) { Remove-Item $TempPath -Force -ErrorAction SilentlyContinue }
    exit 0
} else {
    Write-Host "integrity_check FAILED for $file"
    Write-Host "sqlite3 exit code: $exitCode"
    Write-Host "sqlite3 output:"
    Write-Host $resultText
    if (Test-Path $TempPath) { Remove-Item $TempPath -Force -ErrorAction SilentlyContinue }
    exit 1
}
