# Bootstrap Report

**Date**: 2026-05-11
**Target**: `/Users/kenny/family-asana`
**ClaudeKit version**: 2.0.0 (from `.claude/VERSION`)

## Tech Stack Discovered

| Area | Choice |
|------|--------|
| Workspace | npm workspaces (`server`, `web`) |
| Backend | Fastify 4 (TypeScript, ESM), tsx for dev, better-sqlite3 |
| DB | SQLite (single file, WAL, FKs on) — schema at `server/src/schema.sql` |
| Validation | Zod |
| Auth | Magic-link (Resend) + cookie sessions (`@fastify/cookie`) |
| Frontend | React 18 + Vite 5 + TS, Tailwind 3 |
| Data fetching | TanStack Query v5 |
| Routing | React Router 6 |
| DnD | @dnd-kit/core + @dnd-kit/sortable (Kanban) |
| Prod host | Windows PC + NSSM + Tailscale (see `docs/WINDOWS-SETUP.md`) |

## Architecture

Two-package monorepo. Frontend talks to backend via `/api/*` HTTP (Vite proxy in dev, same-origin in prod once wired). See `.claude/architecture/layer-stack.md` for the full layer map (L0–L5 on each side) and a Mermaid diagram.

Backend routes are organized by resource: `auth`, `users`, `projects`, `tasks`. Frontend pages are `Login` and `Dashboard`; reusable components are `Sidebar`, `ListView`, `BoardView`, `MyTasks`, `ProjectView`, `TaskDetail`.

## Guard Rails Created (in `CLAUDE.md`)

| ID | Category | Rule |
|----|----------|------|
| CODE-00001 | ESM | Use `.js` extension on relative imports from `.ts` files |
| DATA-00001 | Data | IDs are nanoid strings, not integers |
| DATA-00002 | Data | Timestamps are unix-ms integers, generated server-side |
| DATA-00003 | Data | Schema changes go in `server/src/schema.sql` first |
| DATA-00004 | Data | Task status enum locked at todo/doing/done/blocked — update schema, Zod, types, BoardView together |
| SEC-00001 | Security | Never log session IDs or magic-link tokens |
| SEC-00002 | Security | `ALLOWED_EMAILS` env gates signup; intended for Tailscale-private deploy |
| SEC-00003 | Security | CORS is dev-only — prod is same-origin |
| API-00001 | API | All API routes live under `/api/*`; `/health` is the lone exception |
| API-00002 | API | Validate request bodies with Zod at the route boundary |
| API-00003 | API | Keep `web/vite.config.ts` proxy entries in sync with new top-level routes |
| VERIFY-00001 | Verify | Read schema + route + frontend types together; they must stay aligned |
| VERIFY-00002 | Verify | UI changes require an end-to-end browser run, not just a type check |
| FILE-00001 | File org | Routes → `server/src/routes/<resource>.ts`; components vs pages split in `web/src/` |

## Files Created or Updated

| Path | Change |
|------|--------|
| `CLAUDE.md` | Replaced template stub with real tech stack, project structure, and 14 project-specific guard rails |
| `.claude/architecture/layer-stack.md` | **New** — layered map with Mermaid diagram |
| `.claude/memory/active/quick-reference.md` | Replaced empty template with 6 starter patterns (ESM imports, DB schema, IDs/times, status enum, API proxy, dev login) |
| `.claude/BOOTSTRAP_REPORT.md` | **New** — this file |

Left untouched (already populated by ClaudeKit and not stale):
- `.claude/commands/*` (10 slash commands)
- `.claude/hooks/*` (4 Python hooks)
- `.claude/memory/active/procedural-memory.md` (empty template — patterns will be added as discovered)
- `.claude/memory/active/episodic-memory.md`
- `.claude/pain-points/active-pain-points.md` (empty — populate as friction is encountered)

## Codebase Snapshot

- 11 TypeScript source files on the server, 11 on the web
- DB initialized at `server/data/family-asana.db`
- All Phase 1 API endpoints stubbed; Phase 1 verification (Task #7 per `docs/PHASE-1-SPEC.md`) is the gating todo before declaring MVP done

## Next Steps

1. Run Phase 1 verification: `npm install` in both packages, start `server` + `web` dev servers, click through magic-link login → create project → create task → drag status on board.
2. Wire production build serving (server serves `web/dist/` under `/`).
3. As patterns and friction emerge, add to `.claude/memory/active/procedural-memory.md` and `.claude/pain-points/active-pain-points.md`; promote frequent patterns to `quick-reference.md`.
