# Phase 1 — MVP spec

Goal: a usable family task manager in ~10 days of focused work. Projects, tasks, list + board views, magic-link auth, mobile-responsive. Everything else is a later phase.

## Data model (already in `server/src/schema.sql`)

- **users** — `id`, `email`, `name`, `avatar_color`, `created_at`
- **magic_links** — `token`, `email`, `expires_at`, `used_at`
- **sessions** — `id`, `user_id`, `created_at`, `expires_at`
- **projects** — `id`, `name`, `color`, `archived_at`, `created_by`, timestamps
- **tasks** — `id`, `project_id`, `title`, `description`, `status` (todo/doing/done/blocked), `assignee_id`, `due_date`, `position`, `parent_id`, `completed_at`, timestamps

IDs are nanoid strings (12–16 chars). Timestamps are unix ms. Foreign keys enforced.

## API surface (already implemented as stubs)

```
POST   /api/auth/request-link   { email }              → { ok }
GET    /api/auth/verify?token=                          → sets cookie, returns user
GET    /api/auth/me                                     → { user | null }
POST   /api/auth/logout                                 → { ok }

GET    /api/users                                       → User[]
GET    /api/users/me                                    → User

GET    /api/projects                                    → Project[] (with task_count / done_count)
POST   /api/projects   { name, color? }                 → Project
GET    /api/projects/:id                                → Project
PATCH  /api/projects/:id                                → Project
DELETE /api/projects/:id                                → soft-archive

GET    /api/tasks?project_id=&assignee_id=&mine=1       → Task[]
POST   /api/tasks   { project_id, title, ... }          → Task
GET    /api/tasks/:id                                   → Task
PATCH  /api/tasks/:id                                   → Task
DELETE /api/tasks/:id
```

## Screens (scaffolded)

1. **Login** — magic-link request, "check your email" confirmation.
2. **Verify** — `/auth/verify?token=` consumes the token, sets session, redirects.
3. **My tasks** — open tasks assigned to me, grouped by project.
4. **Project: List view** — table rows with title / assignee / due / status; inline create.
5. **Project: Board view** — Kanban with todo / doing / blocked / done columns, drag-drop status change via dnd-kit.
6. **Task detail drawer** — title, description, assignee, due date, status pills, delete.
7. **Sidebar** — My tasks + projects with color dots + inline create + user/sign-out.

## What still needs work to call Phase 1 "done"

In priority order:

- [ ] **Run the verification step** (Task #7): `npm install` in both packages, confirm server starts, web dev server builds, login flow works end-to-end against the dev console-logged magic link.
- [ ] **Wire production build serving** — have the server serve the `web/dist/` build under `/` in prod so it's one process on one port. Currently dev-only via Vite proxy.
- [ ] **Optimistic updates** for task status changes — TanStack Query mutations should update the cache immediately so checkbox toggles feel instant.
- [ ] **Drag-and-drop within a column** (reordering, not just status change). dnd-kit `useSortable` per column.
- [ ] **Keyboard shortcuts** — `n` for new task in current view, `/` to focus a search box, `esc` to close the detail drawer.
- [ ] **Search across all projects** — simple `LIKE` query on task title; surface in the top bar.
- [ ] **Project color picker** in sidebar when creating, and project rename / archive UI.
- [ ] **Empty-state polish** — first project, first task, first sign-in messaging.
- [ ] **Mobile review** — sidebar drawer works; verify the board view scrolls horizontally and task detail drawer fills the screen on phones.
- [ ] **Seed script** — `server/scripts/seed.ts` that inserts 2–3 demo users, a couple of projects, and ~15 tasks. Makes the empty install feel alive.
- [ ] **Error boundaries** — at least one top-level so a render crash doesn't blank the screen.
- [ ] **Smoke tests** — a `server/test/` folder with a couple of `node --test` files hitting `/health`, `/api/auth/request-link`, and a project/task round-trip.

## What's deferred (Phase 2+)

Calendar view, recurring tasks, comments, attachments, web push, email digests, search-as-you-type, custom fields, bulk actions. See [`SCOPE.md`](SCOPE.md).

## Acceptance criteria for Phase 1

A family member can: open the URL on their phone, request a magic link, click it, land in the app, see a project they were invited to, add a task, assign it to someone, mark it done, and have it disappear from their "My tasks." All without anyone teaching them how.
