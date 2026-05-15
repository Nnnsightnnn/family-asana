#!/usr/bin/env bash
# =============================================================================
# Family Asana — admin.sh
# =============================================================================
# Linux/systemd port of admin.ps1. One-stop wrapper around the boring ops
# chores for the self-hosted Family Asana server. Meant to be run on the
# Hetzner VPS (or any Linux host) where the systemd service `family-asana`
# is installed.
#
#   ssh familyasana@family-asana
#   /opt/family-asana/scripts/admin.sh <command> [args]
#
# Conventions:
#   - Repo lives at        /opt/family-asana/
#   - SQLite DB is at      /opt/family-asana/server/data/family-asana.db
#   - systemd logs land in journalctl + /var/log/family-asana/{out,err,backup}.log
#   - Local backups go to  /opt/family-asana/backups/
#   - Env file:            /opt/family-asana/server/.env
#
# Override the app dir with APP_DIR=... for testing.
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/family-asana}"
DB_PATH="$APP_DIR/server/data/family-asana.db"
LOG_DIR="${LOG_DIR:-/var/log/family-asana}"
OUT_LOG="$LOG_DIR/out.log"
ERR_LOG="$LOG_DIR/err.log"
BACKUP_LOG="$LOG_DIR/backup.log"
BACKUP_DIR="$APP_DIR/backups"
ENV_FILE="$APP_DIR/server/.env"
SERVICE_NAME="family-asana"
HEALTH_URL="${HEALTH_URL:-http://localhost:4000/health}"

# --- Helpers ----------------------------------------------------------------

get_env_value() {
    local name="$1"
    [ -f "$ENV_FILE" ] || return 1
    local line
    line=$(grep -E "^[[:space:]]*${name}[[:space:]]*=" "$ENV_FILE" 2>/dev/null | head -1) || true
    [ -n "$line" ] || return 1
    # strip "name=" prefix and surrounding quotes
    sed -E "s/^[[:space:]]*${name}[[:space:]]*=[[:space:]]*//;s/^['\"]//;s/['\"]$//" <<<"$line"
}

backup_log() {
    local msg="$1"
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$ts] $msg"
    mkdir -p "$LOG_DIR" 2>/dev/null || true
    echo "[$ts] $msg" >> "$BACKUP_LOG" 2>/dev/null || true
}

file_size() {
    stat -c%s "$1" 2>/dev/null || stat -f%z "$1"
}

show_help() {
    cat <<EOF

Family Asana admin script
Usage: admin.sh <command> [args]

Commands:
  health                          GET $HEALTH_URL and print the JSON
  restart-service                 systemctl restart $SERVICE_NAME, confirm active
  tail-logs [n]                   Last n lines of err/out/backup logs (default 50)
  backup-now                      Online-backup the SQLite DB to $BACKUP_DIR
  offsite-push                    backup-now + upload to Cloudflare R2 (no-op if BACKUP_R2_BUCKET empty)
  offsite-verify                  Download latest R2 backup and PRAGMA integrity_check it
  list-users                      Show users (name, email)
  allow-email <addr>              Add email to ALLOWED_EMAILS in .env, restart service
  set-user <email> <name> [color] Set display name and (optional) avatar_color for a user
  ai-status                       Show AI scoping config (OpenRouter key + models)
  invite-text                     Print the SMS-ready onboarding message for the current APP_URL

EOF
}

# --- Commands ---------------------------------------------------------------

cmd_health() {
    if command -v jq >/dev/null 2>&1; then
        curl -sf -m 5 "$HEALTH_URL" | jq .
    else
        curl -sf -m 5 "$HEALTH_URL"
        echo
    fi
}

cmd_restart_service() {
    echo "Restarting $SERVICE_NAME..."
    sudo systemctl restart "$SERVICE_NAME"
    sleep 2
    systemctl status "$SERVICE_NAME" --no-pager --lines=0
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        echo "OK: $SERVICE_NAME is active."
    else
        echo "FAIL: $SERVICE_NAME is not active." >&2
        return 1
    fi
}

cmd_tail_logs() {
    local n="${1:-50}"
    for pair in "STDERR:$ERR_LOG" "STDOUT:$OUT_LOG" "BACKUP:$BACKUP_LOG"; do
        local label="${pair%%:*}"
        local logfile="${pair#*:}"
        echo "===== $label (last $n lines of $logfile) ====="
        if [ -f "$logfile" ]; then
            tail -n "$n" "$logfile"
        else
            echo "log not found: $logfile"
        fi
        echo
    done
}

cmd_backup_now() {
    if [ ! -f "$DB_PATH" ]; then
        echo "SQLite DB not found at $DB_PATH" >&2
        return 1
    fi
    mkdir -p "$BACKUP_DIR"
    local stamp
    stamp=$(date '+%Y-%m-%d-%H%M')
    local dest="$BACKUP_DIR/family-asana-$stamp.db"
    echo "Running sqlite3 .backup to $dest..."
    sqlite3 "$DB_PATH" ".backup '$dest'"
    if [ ! -f "$dest" ]; then
        echo "Backup destination not found after copy: $dest" >&2
        return 1
    fi
    local size
    size=$(file_size "$dest")
    echo "OK: backup written to $dest ($size bytes)."
}

cmd_offsite_push() {
    local bucket endpoint key_id secret
    bucket=$(get_env_value BACKUP_R2_BUCKET 2>/dev/null || true)
    endpoint=$(get_env_value BACKUP_R2_ENDPOINT 2>/dev/null || true)
    key_id=$(get_env_value BACKUP_R2_ACCESS_KEY_ID 2>/dev/null || true)
    secret=$(get_env_value BACKUP_R2_SECRET_ACCESS_KEY 2>/dev/null || true)

    if [ -z "${bucket:-}" ]; then
        backup_log "offsite-push: BACKUP_R2_BUCKET empty; skipping (offsite disabled)."
        return 0
    fi
    if [ -z "${endpoint:-}" ] || [ -z "${key_id:-}" ] || [ -z "${secret:-}" ]; then
        backup_log "offsite-push: ERROR - BACKUP_R2_* incomplete."
        return 1
    fi
    if ! command -v aws >/dev/null 2>&1; then
        backup_log "offsite-push: ERROR - aws CLI not on PATH."
        return 1
    fi

    cmd_backup_now

    local latest
    latest=$(find "$BACKUP_DIR" -maxdepth 1 -name '*.db' -type f -printf '%T@ %p\n' 2>/dev/null \
        | sort -n | tail -1 | cut -d' ' -f2-)
    if [ -z "$latest" ]; then
        backup_log "offsite-push: ERROR - no .db in $BACKUP_DIR after backup-now"
        return 1
    fi

    local key size
    key=$(basename "$latest")
    size=$(file_size "$latest")
    backup_log "offsite-push: uploading $key ($size bytes) to s3://$bucket/"

    if AWS_ACCESS_KEY_ID="$key_id" \
       AWS_SECRET_ACCESS_KEY="$secret" \
       AWS_DEFAULT_REGION=auto \
       aws s3 cp "$latest" "s3://$bucket/$key" \
            --endpoint-url "$endpoint" --only-show-errors; then
        backup_log "offsite-push: OK - $key uploaded to s3://$bucket/."
        return 0
    else
        local code=$?
        backup_log "offsite-push: ERROR - aws s3 cp failed (exit $code)."
        return $code
    fi
}

cmd_offsite_verify() {
    local bucket endpoint key_id secret
    bucket=$(get_env_value BACKUP_R2_BUCKET 2>/dev/null || true)
    endpoint=$(get_env_value BACKUP_R2_ENDPOINT 2>/dev/null || true)
    key_id=$(get_env_value BACKUP_R2_ACCESS_KEY_ID 2>/dev/null || true)
    secret=$(get_env_value BACKUP_R2_SECRET_ACCESS_KEY 2>/dev/null || true)

    if [ -z "${bucket:-}" ]; then
        backup_log "offsite-verify: BACKUP_R2_BUCKET empty; nothing to verify."
        return 0
    fi
    if [ -z "${endpoint:-}" ] || [ -z "${key_id:-}" ] || [ -z "${secret:-}" ]; then
        backup_log "offsite-verify: ERROR - BACKUP_R2_* incomplete."
        return 1
    fi
    if ! command -v aws >/dev/null 2>&1; then
        backup_log "offsite-verify: ERROR - aws CLI not on PATH."
        return 1
    fi

    local temp_path
    temp_path=$(mktemp -t family-asana-verify.XXXXXX.db)
    # cleanup on any exit from this function
    trap "rm -f '$temp_path'" RETURN

    export AWS_ACCESS_KEY_ID="$key_id"
    export AWS_SECRET_ACCESS_KEY="$secret"
    export AWS_DEFAULT_REGION=auto

    backup_log "offsite-verify: listing s3://$bucket/ ..."
    local latest_key
    latest_key=$(aws s3 ls "s3://$bucket/" --endpoint-url "$endpoint" 2>/dev/null \
        | grep -E '\.db[[:space:]]*$' \
        | sort -r | head -1 | awk '{print $NF}') || true

    if [ -z "${latest_key:-}" ]; then
        backup_log "offsite-verify: ERROR - no .db objects in s3://$bucket/."
        unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
        return 1
    fi

    backup_log "offsite-verify: downloading $latest_key to $temp_path"
    if ! aws s3 cp "s3://$bucket/$latest_key" "$temp_path" \
            --endpoint-url "$endpoint" --only-show-errors; then
        backup_log "offsite-verify: ERROR - download failed."
        unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
        return 1
    fi
    unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY

    local result
    result=$(sqlite3 "$temp_path" 'PRAGMA integrity_check;' 2>&1 || echo "FAILED")
    if [[ "$result" == ok* ]]; then
        backup_log "offsite-verify: OK - $latest_key integrity_check=ok"
        return 0
    else
        backup_log "offsite-verify: ERROR - $latest_key integrity_check FAILED: $result"
        return 1
    fi
}

cmd_list_users() {
    if [ ! -f "$DB_PATH" ]; then
        echo "SQLite DB not found at $DB_PATH" >&2
        return 1
    fi
    echo "Users (ordered by created_at):"
    echo
    sqlite3 -header -column "$DB_PATH" "SELECT name, email FROM users ORDER BY created_at;"
}

cmd_allow_email() {
    local email="${1:-}"
    if [ -z "$email" ]; then
        echo "usage: admin.sh allow-email <email>" >&2
        return 1
    fi
    if [ ! -f "$ENV_FILE" ]; then
        echo ".env not found at $ENV_FILE" >&2
        return 1
    fi
    local current
    current=$(get_env_value ALLOWED_EMAILS 2>/dev/null || true)
    if [ -z "${current:-}" ]; then
        echo "WARNING: ALLOWED_EMAILS is currently empty (open mode — Tailscale is the gate)."
        echo "         Adding '$email' switches to allowlist mode — only listed emails can sign in."
    fi
    # de-dupe (case-insensitive)
    if [ -n "${current:-}" ] && grep -qiE "(^|,)[[:space:]]*${email}[[:space:]]*(,|$)" <<<"$current"; then
        echo "$email already in ALLOWED_EMAILS — no change."
        return 0
    fi
    local new
    if [ -z "${current:-}" ]; then
        new="$email"
    else
        new="${current},${email}"
    fi
    local tmp
    tmp=$(mktemp)
    if grep -q "^ALLOWED_EMAILS=" "$ENV_FILE"; then
        awk -v new="$new" '/^ALLOWED_EMAILS=/ { print "ALLOWED_EMAILS=" new; next } { print }' \
            "$ENV_FILE" > "$tmp"
    else
        cp "$ENV_FILE" "$tmp"
        echo "ALLOWED_EMAILS=$new" >> "$tmp"
    fi
    mv "$tmp" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "Added $email. Restarting service..."
    sudo systemctl restart "$SERVICE_NAME"
    echo "Done. Current allowlist: $new"
}

cmd_set_user() {
    local email="${1:-}"
    local name="${2:-}"
    local color="${3:-}"
    if [ -z "$email" ] || [ -z "$name" ]; then
        cat <<EOF
usage: admin.sh set-user <email> <name> [color]

  Stoop Light palette:
    #A86A4B  clay
    #6B8A6E  sage
    #5A7A8E  slate
EOF
        return 1
    fi
    # SQL-quote single quotes by doubling
    local safe_email="${email//\'/\'\'}"
    local safe_name="${name//\'/\'\'}"
    local sql
    if [ -n "$color" ]; then
        local safe_color="${color//\'/\'\'}"
        sql="UPDATE users SET name='$safe_name', avatar_color='$safe_color' WHERE email='$safe_email';"
    else
        sql="UPDATE users SET name='$safe_name' WHERE email='$safe_email';"
    fi
    sqlite3 "$DB_PATH" "$sql"
    echo "Updated user $email."
    sqlite3 -header -column "$DB_PATH" \
        "SELECT name, email, avatar_color FROM users WHERE email='$safe_email';"
}

cmd_ai_status() {
    if [ ! -f "$ENV_FILE" ]; then
        echo ".env not found at $ENV_FILE" >&2
        return 1
    fi
    local key fast smart base
    key=$(get_env_value OPENROUTER_API_KEY 2>/dev/null || true)
    fast=$(get_env_value OPENROUTER_FAST_MODEL 2>/dev/null || true)
    smart=$(get_env_value OPENROUTER_SMART_MODEL 2>/dev/null || true)
    base=$(get_env_value OPENROUTER_BASE_URL 2>/dev/null || true)

    echo "AI scoping (mobilization):"
    if [ -z "${key:-}" ]; then
        echo "  status:       DISABLED (OPENROUTER_API_KEY is empty)"
        echo "  effect:       'Get help' UI hidden; new-task form falls back to plain save."
    else
        echo "  status:       ENABLED"
        echo "  key:          ${key:0:8}..."
    fi
    echo "  base url:     ${base:-(default) https://openrouter.ai/api/v1}"
    echo "  fast model:   ${fast:-(default) anthropic/claude-haiku-4.5}"
    echo "  smart model:  ${smart:-(default) anthropic/claude-sonnet-4.6}"
}

cmd_invite_text() {
    local app_url
    app_url=$(get_env_value APP_URL 2>/dev/null || echo 'http://family-asana:4000')
    local from
    from=$(get_env_value RESEND_FROM 2>/dev/null || echo 'no-reply@mail.nnnsightnnn.com')
    cat <<EOF
--- Copy/paste below into iMessage ---

Hey! Made a little task app for our family — projects, lists, board view, works on your phone. No App Store download for it; it's a website behind our home network.

Two-step setup:

1. Install Tailscale (App Store / Play Store). When you open it, sign in with the link I'm sending you in a sec. That puts you on our family network.

2. Open $app_url in Safari (or Chrome). Type your email, tap "Send sign-in link." Check your inbox (from $from) — tap the link. You're in.

Bookmark it, or tap Share → "Add to Home Screen" and it lives on your dock like a real app.

If the page won't load later: open Tailscale, make sure the toggle is on. That's almost always the answer.

--- End ---
EOF
}

# --- Dispatch ---------------------------------------------------------------

case "${1:-}" in
    health)           cmd_health ;;
    restart-service)  cmd_restart_service ;;
    tail-logs)        cmd_tail_logs "${2:-50}" ;;
    backup-now)       cmd_backup_now ;;
    offsite-push)     cmd_offsite_push ;;
    offsite-verify)   cmd_offsite_verify ;;
    list-users)       cmd_list_users ;;
    allow-email)      cmd_allow_email "${2:-}" ;;
    set-user)         cmd_set_user "${2:-}" "${3:-}" "${4:-}" ;;
    ai-status)        cmd_ai_status ;;
    invite-text)      cmd_invite_text ;;
    ''|help|-h|--help) show_help ;;
    *)                echo "Unknown command: $1" >&2; show_help; exit 1 ;;
esac
