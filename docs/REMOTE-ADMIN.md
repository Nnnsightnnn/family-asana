# Remote admin & family onboarding

How to run the Family Asana server when you're not standing in front of the Windows PC, and how to get non-technical family members onto it without holding their hand.

## Core principle: trust the tailnet

Because the server is reachable **only over Tailscale**, anyone who can open the URL is already authenticated as a household member by Tailscale itself. That means:

- Set `ALLOWED_EMAILS=` (empty) in `server/.env`. The first time someone visits the URL and types their email, the magic-link flow signs them up.
- The "is this person allowed to use Family Asana" decision is made **in Tailscale**, not in the app. You invite their device to your tailnet; that's the gate.
- This is the simplest model for a family. Tightening it (per-user allowlists, role-based permissions) is a Phase 4+ concern.

If you ever want to lock it down further later, just populate `ALLOWED_EMAILS` and restart the service. The app supports both modes today.

## Things to set up on the Windows PC (while you're there)

Plan ~15 extra minutes during the Windows setup. These are the levers you'll wish you had every time you're remote and something breaks.

### 1. Tailscale SSH

Tailscale has a built-in SSH server that works on Windows. No keys to manage, no port forwarding, authenticated by your tailnet identity. **This is the single most valuable thing to set up.**

On the Windows PC, in PowerShell as Administrator:

```powershell
tailscale set --ssh
```

(Or from the Tailscale tray icon → Preferences → "Run SSH server".)

From your Mac:

```bash
tailscale ssh kenny@family-asana
```

You're in. Edit `.env`, restart the service, `tail` logs, run backups — anything you'd do at the keyboard, from anywhere.

### 2. Microsoft Remote Desktop (backup, for GUI ops)

Install **Microsoft Remote Desktop** on your Mac from the App Store. On the Windows PC: Settings → System → Remote Desktop → On. Add the PC by its Tailscale IP. Useful when something needs the GUI (Tailscale tray icon, Windows Update settings, Resend dashboard in a browser).

### 3. An admin script for common ops

`scripts/admin.ps1` lives in the repo and wraps the boring stuff so you don't have to remember NSSM / sqlite3 invocations. Run it from the Windows host after `tailscale ssh kenny@family-asana`:

```powershell
cd C:\family-asana
.\scripts\admin.ps1 health              # GET /health, pretty-print JSON
.\scripts\admin.ps1 restart-service     # nssm restart FamilyAsana, confirm RUNNING
.\scripts\admin.ps1 tail-logs 200       # last N lines of err.log + out.log + backup.log (default 50)
.\scripts\admin.ps1 backup-now          # online-backup the SQLite DB to C:\family-asana\backups\
.\scripts\admin.ps1 offsite-push        # backup-now + upload to Cloudflare R2 (no-op if BACKUP_R2_BUCKET empty)
.\scripts\admin.ps1 offsite-verify      # download latest R2 backup and PRAGMA integrity_check it
.\scripts\admin.ps1 list-users          # SELECT name, email FROM users (read-only)
.\scripts\admin.ps1                     # no args = print help banner
```

Companion script `scripts/verify-backup.ps1` runs `PRAGMA integrity_check` against the most recent **local** backup; `admin.ps1 offsite-verify` does the same against the most recent **R2** object. Both are scheduled weekly per [`WINDOWS-SETUP.md`](WINDOWS-SETUP.md).

### 4. Resend with a verified domain

In `.env`, set `RESEND_FROM` to use a domain you own (e.g., `Family Asana <no-reply@kenny.example>`). Verify the domain in Resend. Otherwise magic-link emails land in spam for the non-technical family members and you'll spend the rest of your life telling them to check their junk folder.

If you don't own a domain, the cheap-and-cheerful alternative: a domain costs ~$12/yr at Cloudflare or Porkbun. One-time decision.

## Family-member onboarding (the one-pager to text them)

The first time someone joins, they need to do three things. Write this in the Messages app for the family group; reuse it forever.

> 1. Install **Tailscale** from the App Store (iPhone) or Play Store (Android).
> 2. Open it. When it asks to log in, tap the link I'm about to send you. (You separately send them a Tailscale invite from your admin panel.)
> 3. Open **http://family-asana** in any browser. Enter your email, tap "Send sign-in link". Check your email, tap the link. You're in. Bookmark the page.
>
> If the page won't load later, the answer is almost always: open Tailscale and make sure it's on.

That's it. Three steps. No accounts to create, no passwords to forget, no app to download for Family Asana itself (it's a PWA — they can "Add to Home Screen" if they want it on the dock).

## Common situations and the remote fix

### "I'm not getting the magic-link email"

1. From your Mac: open the Resend dashboard → **Emails** tab → search by their email. Did the send succeed?
2. If yes, it's a spam issue → tell them to check spam, and verify your Resend `from` domain.
3. If no, the server failed to send. `tailscale ssh` in, look at `C:\family-asana\logs\err.log` (or wherever NSSM writes stderr), and check for a Resend API error.
4. As a one-off recovery: SSH in, open the DB with `sqlite3 server\data\family-asana.db "SELECT token FROM magic_links WHERE email='them@x.com' ORDER BY expires_at DESC LIMIT 1;"`, and text them the URL `http://family-asana/auth/verify?token=<that>` directly. Don't do this often — it's a bypass, not a workflow.

### "The page won't load"

99% of the time, their Tailscale is off or logged out. Have them open the Tailscale app and check the toggle. If Tailscale shows "Connected" but the page still won't load, then the server is genuinely down — go to the next section.

### "Everything is broken / nothing loads"

```bash
tailscale ssh kenny@family-asana
```

```powershell
# Is the service running?
sc query FamilyAsana

# Recent stdout / stderr (paths from your NSSM setup)
Get-Content C:\family-asana\logs\out.log -Tail 50
Get-Content C:\family-asana\logs\err.log -Tail 50

# Restart
nssm restart FamilyAsana

# Verify it's listening
curl http://localhost:4000/health
```

If `sc query` shows the service stopped and it won't restart, the usual culprit is the `.env` file (typo) or the SQLite file (locked). If the DB is the problem, restore from the latest local snapshot in `C:\family-asana\backups\` — or, if those are gone too, pull the latest object from the R2 bucket via `aws s3 cp s3://<bucket>/<file> server\data\family-asana.db --endpoint-url <r2-endpoint>`.

### "We need to add my brother-in-law"

From wherever you are with internet:

1. Log into [login.tailscale.com](https://login.tailscale.com). Invite his device — Tailscale emails him a link, he installs the app, taps the link, done.
2. (If `ALLOWED_EMAILS` is empty, which is the recommended default, you're already done.)
3. Text him the family onboarding one-pager above.

That's it. You never had to touch the Windows PC.

### "We need to remove someone (ex, former housemate)"

1. Tailscale admin → remove their device from the tailnet. They can no longer reach the server, period.
2. Optional cleanup: `tailscale ssh` in, then `sqlite3 server\data\family-asana.db "DELETE FROM sessions WHERE user_id='<their-id>';"` so any cached session on their device is killed. (Without this, the device couldn't reach the server anyway, but it's tidy.)

### "I want to see who's using it / what they're doing"

```sql
sqlite3 server\data\family-asana.db "SELECT name, email, datetime(created_at/1000, 'unixepoch') FROM users;"
sqlite3 server\data\family-asana.db "SELECT COUNT(*) FROM tasks WHERE created_at > strftime('%s','now','-7 days')*1000;"
```

(Phase 4 polish: a small `/admin` page in the app that surfaces this stuff so you don't have to SQL. Easy add when there's a real reason.)

## Things to know about Windows updates

When Windows Update reboots the box overnight, NSSM auto-restarts the service, family members never notice. Once a month, after a reboot, SSH in and run `curl http://localhost:4000/health` just to confirm everything's green. Five seconds.

If the PC fails to come back from a reboot, the runbook is in [`WINDOWS-SETUP.md`](WINDOWS-SETUP.md) under "Runbook for 'the PC died'" — point Tailscale at any spare machine, drop in the latest backup, and you're up in 15 minutes.

## Things you'll be glad you wrote down

Keep these in a password manager or a single Apple Note titled "Family Asana — admin":

- Tailscale tailnet name
- The Windows PC's Tailscale name (e.g. `family-asana`) and IP
- The Resend account login
- The path to NSSM logs on the PC
- Where the SQLite backups land — local: `C:\family-asana\backups\`; offsite: Cloudflare R2 bucket name + S3 endpoint URL + the R2 API token (Access Key ID + Secret)
- The `SESSION_SECRET` (so you can restore sessions onto a new host without re-logging the whole family in)
