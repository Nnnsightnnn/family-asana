# Windows-as-server setup

One-time setup to turn the family Windows PC into an always-on Family Asana host. Plan on ~45 minutes end-to-end.

## 1. Make the PC behave like a server

Settings → System → Power & battery → **Screen and sleep**:
- "Screen, when plugged in, turn off after" → 15 min (or whatever)
- "Sleep, when plugged in, put device to sleep after" → **Never**

Settings → Accounts → Sign-in options:
- Enable auto sign-in (`netplwiz` → uncheck "Users must enter a user name and password"). Required so the service comes back after a reboot.

Settings → Windows Update → Advanced options:
- Active hours: set so updates don't reboot during the day. Updates will still install — that's fine, the service auto-restarts.

## 2. Static local IP (so Tailscale + bookmarks don't drift)

In your router admin UI: find the Windows PC in the device list and **add a DHCP reservation** for its MAC address. Pick something memorable like `192.168.1.50`. Reboot the PC once to pick up the lease.

## 3. Install Node.js

Grab the Node 20 LTS Windows installer from [nodejs.org](https://nodejs.org/). Accept defaults. Verify in PowerShell:

```powershell
node --version   # v20.x.x
npm --version
```

## 4. Clone + build the app

```powershell
cd C:\family-asana    # or wherever
git clone <your repo>  # or copy the family-asana folder here
cd family-asana

# install + build both packages
cd server && npm install && npm run build
cd ..\web && npm install && npm run build
```

In the future you'll also want the server to serve `web/dist/` directly (one process, port 4000) — see Phase 1 spec.

## 5. Configure the server

```powershell
cd C:\family-asana\server
copy .env.example .env
notepad .env
```

Fill in:
- `SESSION_SECRET=` a long random string (run `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` to generate one)
- `RESEND_API_KEY=` from [resend.com](https://resend.com) (free tier, 3k/mo)
- `RESEND_FROM=` whatever sender domain you've verified in Resend
- `APP_URL=http://family-asana` (or whatever you'll name it on Tailscale)
- `ALLOWED_EMAILS=` comma-separated list of family emails
- `OPENROUTER_API_KEY=` (optional) enables AI task scoping ("Get help" on the task drawer). Leave blank to gracefully disable; defaults for the fast/smart models in `.env.example` are fine.

## 6. Run as a Windows Service via NSSM

Download [NSSM](https://nssm.cc/download). Extract `nssm.exe` somewhere on your PATH (e.g. `C:\Windows\System32\`).

```powershell
nssm install FamilyAsana
```

In the GUI:
- **Path**: `C:\Program Files\nodejs\node.exe`
- **Startup directory**: `C:\family-asana\server`
- **Arguments**: `dist\index.js`
- I/O tab → set `stdout` and `stderr` to log files (e.g. `C:\family-asana\logs\out.log`, `err.log`)
- Details tab → Startup type: **Automatic**

Then:
```powershell
nssm start FamilyAsana
sc query FamilyAsana   # should say RUNNING
```

Test by hitting `http://localhost:4000/health` in a browser on the PC.

## 7. Install Tailscale on the PC and every family device

[tailscale.com/download](https://tailscale.com/download). Sign in with the same account (or use a family-shared account). On the Windows PC, note its Tailscale name (e.g. `family-pc.tail-scales.ts.net`) and IP (e.g. `100.x.y.z`).

On each phone/laptop, install Tailscale and sign in. They can now reach `http://100.x.y.z:4000` (or, after step 8, `http://family-asana`).

## 8. (Optional) Magic DNS name

In the Tailscale admin panel, rename the PC node to `family-asana`. With Magic DNS enabled (default), every Tailscale-connected device can now use `http://family-asana:4000` as the URL. Set this as `APP_URL` in `.env` so magic links work for everyone.

For a nicer URL without the port, run a tiny reverse proxy (Caddy is one line of config) on the PC mapping `:80` → `:4000`. Optional — `:4000` works fine.

## 9. Scheduled backups (local + offsite to Cloudflare R2)

Two layers, both running on Task Scheduler:

1. **Local snapshot + offsite push every 6 h** — `admin.ps1 offsite-push` calls `backup-now` (sqlite3 `.backup` to `C:\family-asana\backups\`) and then uploads the snapshot to a Cloudflare R2 bucket. If R2 isn't configured the push is a silent no-op and you still get the local snapshot.
2. **Weekly integrity check on both layers** — `verify-backup.ps1` (local) and `admin.ps1 offsite-verify` (R2). Each downloads the most recent `.db`, runs `PRAGMA integrity_check`, and exits non-zero on failure.

Schedule both with `schtasks` in an Administrator PowerShell:

```powershell
# Every 6 hours: local snapshot + R2 push
schtasks /Create /SC HOURLY /MO 6 /TN "FamilyAsanaOffsitePush" /TR "powershell -ExecutionPolicy Bypass -File C:\family-asana\scripts\admin.ps1 offsite-push" /ST 03:00

# Sunday 04:00: weekly local integrity check
schtasks /Create /SC WEEKLY /D SUN /TN "FamilyAsanaBackupVerify" /TR "powershell -ExecutionPolicy Bypass -File C:\family-asana\scripts\verify-backup.ps1" /ST 04:00

# Sunday 04:15: weekly offsite integrity check
schtasks /Create /SC WEEKLY /D SUN /TN "FamilyAsanaOffsiteVerify" /TR "powershell -ExecutionPolicy Bypass -File C:\family-asana\scripts\admin.ps1 offsite-verify" /ST 04:15
```

To run any of them manually:

```powershell
C:\family-asana\scripts\admin.ps1 offsite-push
C:\family-asana\scripts\admin.ps1 offsite-verify
powershell -ExecutionPolicy Bypass -File C:\family-asana\scripts\verify-backup.ps1
```

> SQLite in WAL mode is safe to `.backup` live — the WAL is checkpointed on each connection close and the resulting copy is consistent.

> Retention is **enforced in the R2 bucket** via a lifecycle rule (step 9b), not by the script. The script never deletes from R2.

### 9a. R2 bucket setup (one-time, ~5 minutes)

Set up the bucket in the Cloudflare dashboard:

1. **Cloudflare dashboard → R2** → **Create bucket**. Pick a name (referenced as `<your-r2-bucket>` below) and a location hint near you.
2. On the bucket → **Settings** → **Object lifecycle rules** → **Add rule**. Name: `expire-7d`. Action: **Delete objects after** 7 days. Apply to all objects. Save. (This is the retention policy — the script does not delete. At 4 pushes/day × 7 days ≈ 28 snapshots ≈ a few MB.)
3. **R2 → Manage R2 API Tokens → Create API token**. Permission: **Object Read & Write**. Scope to the one bucket. Save the **Access Key ID** and **Secret Access Key** — you can't view the secret again later.
4. Note your **S3 API endpoint** URL — it looks like `https://<accountid>.r2.cloudflarestorage.com` and is shown on the R2 overview page.

### 9b. Plumb the credentials into `.env` over SSH

Don't paste the secret into chat, IM, or a build log. From your Mac, SSH in and write directly into the `.env` on the server:

```bash
ssh kenny@ncit
```

```powershell
cd C:\family-asana\server

# Non-secret values can be appended plainly:
Add-Content .env "BACKUP_R2_BUCKET=<your-r2-bucket>"
Add-Content .env "BACKUP_R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com"
Add-Content .env "BACKUP_R2_ACCESS_KEY_ID=<paste-the-access-key-id>"

# Secret — read it interactively so it isn't visible in shell history or logs:
$secret = Read-Host -AsSecureString "BACKUP_R2_SECRET_ACCESS_KEY"
$plain  = [System.Net.NetworkCredential]::new('', $secret).Password
Add-Content .env "BACKUP_R2_SECRET_ACCESS_KEY=$plain"
Remove-Variable plain
```

The service does **not** read these — only `admin.ps1` does — so no restart is required after editing.

Install the AWS CLI on the Windows host if it isn't already (`winget install Amazon.AWSCLI`). Then smoke-test:

```powershell
C:\family-asana\scripts\admin.ps1 offsite-push
```

Expect: a fresh `family-asana-<timestamp>.db` in `C:\family-asana\backups\`, an identical object in the R2 bucket, and an `OK` line in `C:\family-asana\logs\backup.log`. Tail with `admin.ps1 tail-logs`.

## 10. Test the failure cases

Before declaring victory:

- [ ] Reboot the PC. Confirm `FamilyAsana` service auto-starts (check `sc query FamilyAsana` or the Services GUI).
- [ ] Kill the node process. Confirm NSSM restarts it within ~5 seconds.
- [ ] Disconnect home Wi-Fi on your phone, switch to cellular, confirm Tailscale tunnel still resolves and the app loads.
- [ ] Copy the backup `.db` to a fresh location and open it with `sqlite3` to confirm it's a valid copy.

## Runbook for "the PC died"

1. Get any other machine running Node 20 (Mac, Linux, another Windows box).
2. Clone the repo, `npm install` in `server/`.
3. Pull the most recent backup from R2 (using your R2 token):
   ```bash
   export AWS_ACCESS_KEY_ID=<id> AWS_SECRET_ACCESS_KEY=<secret> AWS_DEFAULT_REGION=auto
   aws s3 ls s3://<your-r2-bucket>/ --endpoint-url https://<accountid>.r2.cloudflarestorage.com
   aws s3 cp s3://<your-r2-bucket>/family-asana-<latest>.db ./server/data/family-asana.db \
     --endpoint-url https://<accountid>.r2.cloudflarestorage.com
   ```
   (If R2 is unreachable, fall back to the local `C:\family-asana\backups\` folder — assuming the disk survived.)
4. Drop the `uploads/` folder into `server/uploads/` (when Phase 3 lands).
5. Set the same `SESSION_SECRET` in `.env` so existing sessions stay valid (otherwise everyone re-logs).
6. `npm run build && npm start`.
7. Update the Tailscale machine name to `family-asana` on the new host (and remove it from the old one).

Time-to-recovery: ~15 minutes once you have the backup file in hand.
