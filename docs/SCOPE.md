# Family Asana — Scope & Cost

A self-hosted, Asana-inspired task manager for a 2–4 person household, accessible at home and on the road.

## Recommended architecture

A small always-on machine at home runs the backend; family members reach it from anywhere through a private mesh network (Tailscale). All data stays on your hardware. No SaaS lock-in, no monthly platform bill.

**Backend host**
The existing Windows PC on your home network, left on 24/7. Plenty of horsepower for a family-sized workload. A few one-time Windows tweaks: disable sleep (Settings → System → Power → Screen and sleep → Never), set the user account to auto-login on reboot, and pin a static local IP via your router's DHCP reservation.

**Backend stack**
Node.js + Fastify, running as a Windows Service via [NSSM](https://nssm.cc/) so it auto-starts on boot and restarts on crash. SQLite as the database — single file, zero admin, plenty fast for a household. Backups: a Windows scheduled task runs `admin.ps1 offsite-push` every 6 hours, which produces a local `sqlite3 .backup` snapshot in `C:\family-asana\backups\` and uploads it to a Cloudflare R2 bucket (S3-compatible, free egress, 10 GB free tier). Retention is enforced by an R2 lifecycle rule (30 days), and a weekly `offsite-verify` job downloads the latest object and runs `PRAGMA integrity_check` against it.

**Frontend stack**
React + Vite + TypeScript + Tailwind. Asana-inspired layout: left sidebar with projects, main pane with list/board/calendar toggle, task detail drawer on the right. Uses TanStack Query for data fetching and dnd-kit for the Kanban drag-drop.

**Remote access**
Tailscale — free personal plan, up to 100 devices. Each family phone/laptop installs the app once; the family Asana then "just works" from anywhere as `http://family-asana` on your private network. No port forwarding, no public exposure, no DNS config.

**Auth**
Magic-link login via Resend (free tier: 100 emails/day, 3k/mo — way more than a family needs). One link, click from email, you're in. Sessions persist 90 days.

**File storage**
Attachments saved to local disk on the backend (a `/data/uploads` folder). The same offsite job extends to `aws s3 sync` the uploads folder to R2 when Phase 3 lands. Cap individual uploads at ~25 MB.

**Notifications**
Web Push (free, native browser API) for assignments, due-soon, comments. Email fallback through Resend.

**Recurring tasks**
A small background worker (BullMQ + SQLite-backed queue, or a plain `node-cron`) that materializes the next instance of each recurring task when the prior one completes or expires.

## Feature scope

**Phase 1 — MVP (week 1–2)**
Projects, tasks, assignees, due dates, statuses (To do / Doing / Done / Blocked). List view and Kanban board view with drag-drop. Task detail panel with description and subtasks. Basic auth (magic links). Three-color project tags. Mobile-responsive from day one.

**Phase 2 — Calendar + recurring (week 3)**
Month + week calendar view. Recurring tasks with weekly/monthly/custom cadences. "My tasks" view (everything assigned to you across projects). Due-soon highlighting.

**Phase 3 — Comments + attachments (week 4)**
Threaded comments on tasks with @mentions. Photo/file uploads (drag-drop, paste, mobile camera). Activity log per task.

**Phase 4 — Polish + notifications (week 5)**
Web Push setup, email digests, notification preferences per user. Bulk task actions (move, complete, reassign). Keyboard shortcuts (`n` for new task, `/` to search, `j/k` to navigate). Search across all projects. Empty states and Asana-style "you crushed it" celebration when a project hits zero open tasks.

**Phase 5 — Task mobilization**
A routing layer that takes a task from problem surface to solution surface at the moment of creation. AI scopes each new task into one of seven routes (DIY / delegate / outsource / buy / schedule / research / drop) and attaches the next concrete artifact (deep link to TaskRabbit/Instacart/etc., a delegation suggestion, or a copy-paste research prompt). Existing unscoped tasks get an opt-in "Scope this ✦" button. AI runs server-side via OpenRouter so we can swap between cheap (Haiku) and smart (Sonnet) models per call.

**Out of scope (for now)**
Forms / intake. Automations / rules. Portfolios. Goals. Reporting dashboards. Custom fields beyond a small fixed set (priority, tag). Native iOS/Android apps — the responsive web app installed as a PWA covers this.

## Cost breakdown

**One-time hardware**
- Windows PC: $0 (already owned)
- **Subtotal: $0**

**Recurring**
- Tailscale: $0 (personal plan covers 3 users / 100 devices)
- Resend email: $0 (free tier, 3k emails/month)
- Backups: $0/mo on Cloudflare R2 (10 GB free tier; this DB is MB-scale and won't approach it)
- Domain (optional, e.g. `family.example.com`): $12/yr → $1/mo
- Web Push: $0 (browser-native)
- Electricity: ~$3–8/mo extra for running a PC 24/7 vs. only when in use (depends on PC and local rates)
- **Subtotal: $3–10/month, almost entirely electricity**

**Compare to Asana Premium**
$10.99/user/month × 4 people = ~$528/year. Your build pays back the hardware in 2–3 months and is free indefinitely after.

## Effort estimate

For a single developer working with Claude as a pair, roughly **4–5 calendar weeks** to ship all four phases at solid quality. Phase 1 alone gets you something the family can actually use within ~10 days. Without AI assistance, double that.

## Risks / things to think about

- **Tailscale on family phones** — everyone has to install it once and stay logged in. Not painful, but worth a heads up. Kids' devices are the most likely sticking point.
- **Windows updates can reboot the box** — schedule restarts for 3 AM and let the NSSM-managed service come back up automatically. Test a reboot before declaring victory.
- **Backups matter more than you think** — if the SQLite file goes, the family's task list goes. Scheduled offsite copy to Cloudflare R2 (every 6 h, 30-day retention, weekly integrity check) is non-negotiable.
- **The "what if the PC dies on vacation" question** — restore the SQLite file + uploads folder onto any machine running Node, point Tailscale at the new host, and you're back in ~15 minutes. Worth a one-page runbook.
- **Notification fatigue** — default to "assigned to me + @mention" only. Anything more and the family will mute it within a week.

## Suggested next step

Lock the stack (Node vs. Python — Node recommended) and I'll generate a starter repo + a detailed Phase 1 spec you can hand to Claude Code, plus a short "Windows-as-server" setup checklist (sleep/auto-login/static IP/NSSM/Tailscale).
