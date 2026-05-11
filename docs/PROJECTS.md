# Projects — work breakdown for parallel execution

This is the dispatch view of remaining work. Each item below is a self-contained card with scope, files, acceptance criteria, and dependencies — sized so a single Claude Code session (or sub-agent) can complete it without needing the rest of this doc as context. Items marked **parallel-safe** can be worked on concurrently without merge conflicts.

For the *why* and *what* of the product, read [`SCOPE.md`](SCOPE.md). For the bigger Phase 1 checklist, [`PHASE-1-SPEC.md`](PHASE-1-SPEC.md). This doc is the *how do we ship it* layer.

## Streams

- **A — Backend infrastructure** — Fastify, SQLite, deployability
- **B — Frontend interactions** — UI polish, drag-drop, shortcuts, search
- **C — Quality & polish** — error boundaries, mobile review, PWA, a11y
- **D — Ops & admin** — admin script, in-app admin page, backup runbook
- **E — Phase 2: Calendar + recurring** (blocked on Phase 1 done)
- **F — Phase 3: Comments + attachments** (blocked on Phase 1 done)
- **G — Phase 4: Notifications** (blocked on Phase 2/3)

## Suggested dispatch (first parallel wave)

Three sub-agents can run concurrently with no merge conflicts:

| Agent | Picks up | Touches |
|---|---|---|
| 1 | **A1 + A2 + A3** | `server/` only |
| 2 | **B1 + B2 + B3** | `web/src/components/` + `web/src/pages/` |
| 3 | **D1 + D3 + docs** | `scripts/` + `docs/` |

Once that wave lands, a second wave (B4, B5, B6, C1, C2, C3, D2) is unblocked and similarly parallelizable. Phase 2+ streams stay blocked until **all of A, B, C** are green.

---

## Stream A — Backend infrastructure

### A1 — Serve the web build from the server in production
- **Effort:** S (1–2 hrs)
- **Parallel-safe:** Yes — touches `server/index.ts` and `server/package.json` only
- **Blocks:** Windows deployment, the `/admin` page (D2), seed-on-deploy
- **Blocked by:** None

**Scope.** In production (`NODE_ENV=production`), Fastify serves `web/dist/` as static assets with SPA fallback to `index.html` for client-side routing. In dev (`NODE_ENV=development`), Vite continues to serve the frontend; the server should NOT try to serve `dist/` (it likely won't exist).

**Files.**
- `server/src/index.ts` — register `@fastify/static` conditionally; add SPA fallback (`setNotFoundHandler` that returns `index.html` for non-`/api`/non-`/health` paths)
- `server/package.json` — add `@fastify/static`
- Root `package.json` — add a `build` script that runs `npm -w web run build && npm -w server run build`

**Acceptance.**
- `npm run build` from the repo root produces `web/dist/` and `server/dist/`
- `cd server && NODE_ENV=production npm start` serves the SPA at `http://localhost:4000/`
- Hard-refreshing on `/projects/<id>` returns the SPA, not a 404
- `/api/*` and `/health` still work
- In `npm run dev`, the server does not 500 on missing `web/dist/`

### A2 — Seed script for demo data
- **Effort:** S (1 hr)
- **Parallel-safe:** Yes — new file in `server/scripts/`
- **Blocks:** Easier review of B5, B6, C2
- **Blocked by:** None

**Scope.** `server/scripts/seed.ts` populates a fresh DB with 3 demo users (with distinct avatar colors), 2–3 projects, and ~15 tasks across statuses, due dates, and assignees. Idempotent — running twice doesn't duplicate rows; it bails if any users already exist.

**Files.**
- `server/scripts/seed.ts`
- `server/package.json` — add `"seed": "tsx scripts/seed.ts"` script

**Acceptance.**
- `npm run seed` against an empty DB inserts demo data and exits 0
- Re-running it against a non-empty DB exits with a "DB not empty, skipping" message
- Demo data looks alive in both List and Board views (multiple statuses, a couple of due dates this week, a couple overdue)

### A3 — Smoke tests
- **Effort:** M (2–3 hrs)
- **Parallel-safe:** Yes — new files in `server/test/`
- **Blocks:** Confidence in remote upgrades
- **Blocked by:** None (but A1 makes the prod-mode test possible)

**Scope.** Use Node's built-in `node --test`. Tests boot the server against an in-memory SQLite (`DB_PATH=:memory:` if supported by `better-sqlite3`; otherwise a tmp file) and exercise:
- `GET /health` → 200, ok=true
- `POST /api/auth/request-link` → 200, magic_links row inserted
- Magic-link round-trip: create token → `GET /api/auth/verify?token=...` → session cookie set, `me()` returns user
- Project + Task CRUD round-trip on an authenticated session
- 401 on protected route without a session

**Files.**
- `server/test/auth.test.ts`
- `server/test/projects-and-tasks.test.ts`
- `server/test/helpers.ts` — boot-test-server helper, authenticated-fetch helper
- `server/package.json` — `"test": "node --test --import tsx --experimental-test-coverage"` (or similar)

**Acceptance.**
- `npm test` passes locally
- Tests don't leave a DB file behind
- A clearly-broken regression (e.g., a route that always 500s) fails the suite

### A4 — Wire `/admin` API surface (optional, do with D2)
- **Effort:** S
- **Parallel-safe:** Yes, but pair with D2 since they're useless apart
- **Blocked by:** None functional; conceptually do after A1

**Scope.** Routes under `/api/admin/*` for self-service ops, gated by `requireUser` + a check that the user's email is in an `ADMIN_EMAILS` env var. Endpoints: `GET /api/admin/stats` (user count, task count, last-7-days task count), `POST /api/admin/sessions/:user_id/revoke` (kills all sessions for a user). Keep this surface small.

**Files.**
- `server/src/routes/admin.ts`
- `server/src/env.ts` — add `ADMIN_EMAILS`
- `server/src/index.ts` — register route

**Acceptance.**
- Non-admin user gets 403 on any `/api/admin/*` route
- `GET /api/admin/stats` returns sensible numbers
- Revoke session by user-id actually invalidates that user's sessions

---

## Stream B — Frontend interactions

### B1 — Optimistic updates across task mutations
- **Effort:** S–M (2 hrs)
- **Parallel-safe:** Yes — only TanStack Query mutation hooks
- **Blocks:** Mobile responsiveness feeling good
- **Blocked by:** None

**Scope.** Wrap `useMutation` calls for task status, assignee, due-date, and title with `onMutate` / `onError` / `onSettled` so the UI updates immediately and only rolls back on server error. Touch points are `ProjectView.tsx`'s `updateTask` and the inline checkbox toggle in `ListView.tsx`.

**Files.**
- `web/src/components/ProjectView.tsx`
- `web/src/components/ListView.tsx`
- New helper if useful: `web/src/hooks/useOptimisticTaskUpdate.ts`

**Acceptance.**
- Toggling a checkbox feels instant (no perceptible delay or flicker)
- Forcing a server error (e.g., briefly stop the server in dev) reverts the optimistic state and surfaces a small error toast
- React Query's cache stays consistent — switching projects and back shows the correct state from the server

### B2 — Drag-to-reorder within a column (board view)
- **Effort:** M (3 hrs)
- **Parallel-safe:** Yes — only `BoardView.tsx` and `tasks.position` server-side
- **Blocks:** Nothing critical; nice-to-have
- **Blocked by:** None (dnd-kit already in the project)

**Scope.** Switch `useDraggable`/`useDroppable` in `BoardView.tsx` to `useSortable` per column. On drop within a column, calculate a fractional `position` value between the two neighbors (e.g., `(prev.position + next.position) / 2`) and `PATCH` it. Cross-column drops continue to change status (existing behavior).

**Files.**
- `web/src/components/BoardView.tsx`
- `server/src/routes/tasks.ts` — already accepts `position` in `TaskPatch`; verify no changes needed

**Acceptance.**
- Drag a card up or down within the same column → it stays put, lower position values render first
- Drag across columns → status changes (existing behavior unchanged)
- Reorder, refresh page → order persists

### B3 — Keyboard shortcuts
- **Effort:** S (1–2 hrs)
- **Parallel-safe:** Yes — new file, plus mounting in `Dashboard.tsx`
- **Blocked by:** None

**Scope.** Global shortcut layer:
- `n` (no modifier, not in input) → focus the inline "add task" input in whatever view is open
- `/` → focus a top-bar search input (B4)
- `esc` → close the task detail drawer
- `j` / `k` → next/prev task row (List view only, with focus ring)

**Files.**
- `web/src/hooks/useKeyboardShortcuts.ts`
- `web/src/pages/Dashboard.tsx` — mount the hook, hold focused-task state
- Possibly minor changes to `ListView.tsx` for focus management

**Acceptance.**
- Each shortcut works from the project view
- Shortcuts don't fire when typing into an input/textarea
- A small `?` overlay listing the shortcuts (extra credit, leave a TODO if skipped)

### B4 — Cross-project search
- **Effort:** M (2–3 hrs)
- **Parallel-safe:** Yes (after B3 lands the `/` shortcut)
- **Blocks:** None
- **Blocked by:** B3 ideally (for the keyboard hookup); independent otherwise

**Scope.** A search input in the top bar (`Dashboard.tsx` header) that queries a new `GET /api/tasks/search?q=...` endpoint (server-side `LIKE %q%` on `title` and `description`, limited to 20 results, joined with project). Results render in a dropdown; clicking one navigates to the project and opens the task in the detail drawer.

**Files.**
- `server/src/routes/tasks.ts` — add `/search` sub-route
- `web/src/api.ts` — `api.searchTasks(q)`
- `web/src/components/SearchBar.tsx` (new)
- `web/src/pages/Dashboard.tsx` — mount it

**Acceptance.**
- Typing 2+ chars shows results within 200ms locally
- Clicking a result navigates and opens the detail drawer for that task
- Empty query → no request fired; results dropdown hidden

### B5 — Project management UI (color picker, rename, archive)
- **Effort:** M (2–3 hrs)
- **Parallel-safe:** Yes — new files
- **Blocked by:** None

**Scope.** Right-click (or "⋯" button) on a sidebar project opens a small menu: Rename, Change color, Archive. Rename inline-edits; Change color shows a palette of 8; Archive calls `DELETE /api/projects/:id` and removes from the sidebar.

**Files.**
- `web/src/components/Sidebar.tsx`
- `web/src/components/ProjectMenu.tsx` (new)

**Acceptance.**
- All three actions work and persist after refresh
- Archived projects disappear from the sidebar but their data is preserved (already true; just verify)
- Color palette matches the Asana-inspired set in `tailwind.config.js`

### B6 — Empty-state polish
- **Effort:** S (1 hr)
- **Parallel-safe:** Yes
- **Blocked by:** None

**Scope.** Add tasteful empty states for: no projects yet (sidebar), no tasks in a project (list view), no tasks in a column (board view, smaller). Each should suggest the next action ("Create your first project" with a button).

**Files.**
- `web/src/components/Sidebar.tsx`
- `web/src/components/ListView.tsx`
- `web/src/components/BoardView.tsx`

**Acceptance.**
- A brand-new DB (post-seed-skip) shows friendly empty states, not blank panes
- Empty-state buttons trigger the correct create flow

---

## Stream C — Quality & polish

### C1 — Error boundaries
- **Effort:** S (1 hr)
- **Parallel-safe:** Yes
- **Blocked by:** None

**Scope.** A top-level React error boundary that renders a friendly "Something went wrong" with a Reload button. A second one wrapping the task detail drawer so a render bug in one task doesn't blank the whole app.

**Files.**
- `web/src/components/ErrorBoundary.tsx`
- `web/src/main.tsx` and `web/src/components/ProjectView.tsx`

**Acceptance.**
- Forcing a render crash (e.g., temporarily `throw new Error()` in `TaskDetail`) shows the boundary, not a blank screen
- Reload button restores the app

### C2 — Mobile review pass
- **Effort:** S–M (1–2 hrs of clicking around + targeted fixes)
- **Parallel-safe:** Yes — likely small targeted edits
- **Blocked by:** A2 (need data to look at), B6 (so empty states aren't the blocker)

**Scope.** Open the app at 375px (iPhone SE-ish) and walk every flow: login, sidebar drawer, list view, board view (horizontal scroll), task detail drawer, my tasks. Fix anything that obviously breaks. Don't gold-plate — just usability.

**Files.** Wherever the fixes land. Most likely: `web/src/pages/Dashboard.tsx`, `web/src/components/BoardView.tsx`, `web/src/components/TaskDetail.tsx`.

**Acceptance.**
- All flows complete-able on a 375px viewport
- No horizontal scroll outside the board view
- Tap targets ≥ 36px

### C3 — PWA: add-to-home-screen
- **Effort:** S (1 hr)
- **Parallel-safe:** Yes
- **Blocked by:** A1 (server must serve the manifest in prod) — work in parallel, but verify post-A1

**Scope.** Add `web/public/manifest.webmanifest` and a 192px + 512px app icon. Reference manifest from `index.html`. Optional: a minimal service worker that just lets the app install (no offline support yet).

**Files.**
- `web/public/manifest.webmanifest`
- `web/public/icon-192.png`, `web/public/icon-512.png` (placeholder OK — flat blue square with "FA")
- `web/index.html` — add `<link rel="manifest">`

**Acceptance.**
- Chrome "Install Family Asana" prompt appears on mobile after a couple of visits
- Installed app opens standalone (no browser chrome)
- Icon shows up on the home screen

### C4 — Accessibility quick pass
- **Effort:** S (1 hr)
- **Parallel-safe:** Yes
- **Blocked by:** None

**Scope.** Run through the app with keyboard only. Add `aria-label` to icon-only buttons, ensure focus rings are visible on `input.input`, make sure status `<select>`s have accessible labels, etc. This isn't a full WCAG audit (use `design:accessibility-review` for that) — just the obvious wins.

**Files.** Spread across `web/src/components/`.

**Acceptance.**
- Tab order is sensible across login → dashboard
- All buttons have an accessible name
- No console warnings about missing labels

---

## Stream D — Ops & admin

### D1 — `scripts/admin.ps1` PowerShell wrapper
- **Effort:** S (1 hr)
- **Parallel-safe:** Yes — new file
- **Blocked by:** None

**Scope.** A PowerShell script that lives on the Windows server and wraps the boring remote-admin operations. Commands: `restart-service`, `tail-logs [n]`, `backup-now`, `list-users`, `health`. Each is a 2–4 line wrapper. Designed to be run after `tailscale ssh kenny@family-asana` over Tailscale.

**Files.**
- `scripts/admin.ps1`
- `docs/REMOTE-ADMIN.md` — add an "Admin script" section with the command list

**Acceptance.**
- `.\admin.ps1 health` returns the `/health` JSON
- `.\admin.ps1 restart-service` cycles the NSSM service
- `.\admin.ps1 tail-logs 50` prints the last 50 lines of NSSM stderr
- Unknown command prints help

### D2 — In-app `/admin` page
- **Effort:** M (2–3 hrs)
- **Parallel-safe:** Yes (but pair with A4 since it consumes those endpoints)
- **Blocked by:** A4

**Scope.** A phone-friendly admin page at `/admin` showing: connected family members, task counts (this week / total), last backup time, a "Force backup" button, and a "Revoke sessions" button per user. Visible only to emails in `ADMIN_EMAILS`.

**Files.**
- `web/src/pages/Admin.tsx`
- `web/src/App.tsx` — route + admin-only gate
- `web/src/api.ts` — admin endpoints

**Acceptance.**
- Non-admin users get redirected to `/`
- Stats numbers match `/api/admin/stats`
- Revoking a session forces that user to re-login

### D3 — Backup verification script
- **Effort:** S (1 hr)
- **Parallel-safe:** Yes
- **Blocked by:** None

**Scope.** A PowerShell script that picks the most-recent backup file, copies it to a temp location, opens it with `sqlite3`, runs `PRAGMA integrity_check;`, and reports green/red. Run it weekly via Task Scheduler.

**Files.**
- `scripts/verify-backup.ps1`
- `docs/WINDOWS-SETUP.md` — schedule it (extends step 9)

**Acceptance.**
- Running it manually prints `integrity_check: ok`
- Corrupting a copy of the DB file makes the script exit non-zero with a clear message
- Scheduled task entry can be re-created from a documented one-liner

### D4 — First-run setup wizard (in-app)
- **Effort:** M (3 hrs)
- **Parallel-safe:** Yes
- **Blocked by:** None

**Scope.** On a brand-new install, the first user to sign in is treated as the admin. The app shows a 3-step setup overlay: 1) confirm your name + pick avatar color, 2) create your first project, 3) invite family (gives copy-paste-ready instructions). Stored in DB so it doesn't re-trigger.

**Files.**
- `server/src/schema.sql` — `installation` table with `setup_completed_at`
- `server/src/routes/admin.ts` (or auth) — setup status endpoint
- `web/src/pages/Setup.tsx`
- `web/src/App.tsx` — route + redirect

**Acceptance.**
- Fresh install: first sign-in routes to `/setup`, walks through 3 steps, lands at `/`
- Subsequent users: no setup overlay
- Reloading mid-setup remembers progress

---

## Stream E — Phase 2: Calendar + recurring

Blocked until Streams A, B, C are green. Each item is M–L effort. Cards intentionally sparser — flesh them out when the time comes.

- **E1 — Calendar view** (month + week, render `tasks.due_date` as cells)
- **E2 — Recurring task data model + worker** (new `recurring_tasks` table; cron-style worker materializes next instance on completion)
- **E3 — Due-soon highlighting** (visual treatment on tasks due in ≤ 3 days; overdue in red)

## Stream F — Phase 3: Comments + attachments

- **F1 — Comments** (`comments` table; threaded? Probably flat for v1; `@mention` notifications wire later)
- **F2 — Attachments** (multipart upload to local `server/uploads/`; 25 MB cap; mobile camera input)
- **F3 — Activity log** (denormalized `activity` table; rendered in the task detail drawer)

## Stream G — Phase 4: Notifications

- **G1 — Web Push** (server-side subscription store; VAPID keys in env)
- **G2 — Email digests** (daily-summary worker via Resend)
- **G3 — Notification preferences** (per-user opt-out per category)

---

## How to dispatch this to multiple agents

Each work item above is self-contained: scope, files, acceptance criteria. A single agent prompt of the form:

> Implement card **B1 — Optimistic updates** from `docs/PROJECTS.md`. Read the card for scope and acceptance criteria. Read `CLAUDE.md` for repo conventions. Don't touch files outside the listed paths. Stop and ask if you hit any ambiguity.

…should reliably produce a clean PR-sized change. The dispatch table at the top of this doc shows which cards are safe to run concurrently.

When you finish a wave, run the smoke tests (A3, once it exists) and visit the affected screens in a browser before kicking off the next wave. Don't trust a card as done until the acceptance criteria are checked off.
