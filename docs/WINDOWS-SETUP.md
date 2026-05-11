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

## 9. Scheduled backups

Open **Task Scheduler** → Create Basic Task:

- Name: **Family Asana backup**
- Trigger: Daily, every 6 hours
- Action: Start a program
  - Program: `powershell.exe`
  - Arguments:
    ```
    -NoProfile -Command "Copy-Item 'C:\family-asana\server\data\family-asana.db' 'C:\Users\<you>\OneDrive\FamilyAsanaBackups\family-asana-$(Get-Date -Format yyyyMMdd-HHmm).db' ; Get-ChildItem 'C:\Users\<you>\OneDrive\FamilyAsanaBackups\' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item"
    ```

That copies the SQLite file to OneDrive every 6 hours and keeps the most recent 30 copies. If you don't use OneDrive, point the destination at a Backblaze B2 sync folder.

> SQLite in WAL mode is safe to copy live — the WAL is checkpointed on each connection close and the main file is consistent.

### 9a. Weekly backup verification

A backup you can't restore isn't a backup. `scripts/verify-backup.ps1` copies the most recent `.db` from `C:\family-asana\backups\` to a temp file and runs `PRAGMA integrity_check` against it; exit 0 on `ok`, exit 1 otherwise.

Schedule it weekly (Sunday 04:00) with a single command in an Administrator PowerShell:

```powershell
schtasks /Create /SC WEEKLY /D SUN /TN "FamilyAsanaBackupVerify" /TR "powershell -ExecutionPolicy Bypass -File C:\family-asana\scripts\verify-backup.ps1" /ST 04:00
```

To run it manually any time:

```powershell
powershell -ExecutionPolicy Bypass -File C:\family-asana\scripts\verify-backup.ps1
```

If the backup folder you're verifying differs from the default (`C:\family-asana\backups\`) — e.g. you point the 6-hour backup task at OneDrive — edit `$BackupDir` at the top of `verify-backup.ps1` to match.

## 10. Test the failure cases

Before declaring victory:

- [ ] Reboot the PC. Confirm `FamilyAsana` service auto-starts (check `sc query FamilyAsana` or the Services GUI).
- [ ] Kill the node process. Confirm NSSM restarts it within ~5 seconds.
- [ ] Disconnect home Wi-Fi on your phone, switch to cellular, confirm Tailscale tunnel still resolves and the app loads.
- [ ] Copy the backup `.db` to a fresh location and open it with `sqlite3` to confirm it's a valid copy.

## Runbook for "the PC died"

1. Get any other machine running Node 20 (Mac, Linux, another Windows box).
2. Clone the repo, `npm install` in `server/`.
3. Drop the most recent backup file into `server/data/family-asana.db`.
4. Drop the `uploads/` folder into `server/uploads/` (when Phase 3 lands).
5. Set the same `SESSION_SECRET` in `.env` so existing sessions stay valid (otherwise everyone re-logs).
6. `npm run build && npm start`.
7. Update the Tailscale machine name to `family-asana` on the new host (and remove it from the old one).

Time-to-recovery: ~15 minutes once you have the backup file in hand.
