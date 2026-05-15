#!/usr/bin/env bash
# =============================================================================
# Family Asana — verify-backup.sh
# =============================================================================
# Smoke-test the most recent LOCAL SQLite backup with PRAGMA integrity_check.
# Catches "the backup file is corrupt and you only find out the day your house
# burns down" — silent backup rot.
#
# Intended to run weekly via systemd timer.
#
# Exit codes:
#   0 — integrity_check returned "ok"
#   1 — no backups found, or integrity_check failed
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/family-asana}"
BACKUP_DIR="$APP_DIR/backups"

TEMP_PATH=$(mktemp -t family-asana-verify.XXXXXX.db)
trap "rm -f '$TEMP_PATH'" EXIT

if [ ! -d "$BACKUP_DIR" ]; then
    echo "Backup directory not found: $BACKUP_DIR" >&2
    exit 1
fi

LATEST=$(find "$BACKUP_DIR" -maxdepth 1 -name '*.db' -type f -printf '%T@ %p\n' 2>/dev/null \
    | sort -n | tail -1 | cut -d' ' -f2-)

if [ -z "$LATEST" ]; then
    echo "No .db backup files found in $BACKUP_DIR" >&2
    exit 1
fi

echo "Verifying: $LATEST"
cp "$LATEST" "$TEMP_PATH"

RESULT=$(sqlite3 "$TEMP_PATH" 'PRAGMA integrity_check;' 2>&1 || echo "FAILED")

if [[ "$RESULT" == ok* ]]; then
    echo "integrity_check: ok ($LATEST)"
    exit 0
else
    echo "integrity_check FAILED for $LATEST"
    echo "sqlite3 output: $RESULT"
    exit 1
fi
