# Family Asana — Claude Context

Self-hosted Asana-inspired task manager for a 2–4 person household. Backend runs on a home Windows PC, reachable over Tailscale. Architecture, scope, and Phase 1 spec live in `docs/`.

## Tech Stack

- **Runtime**: Node 20+, npm workspaces (root `package.json` runs `server` + `web`)
- **Backend** (`server/`): Fastify 4 · `better-sqlite3` · Zod · TypeScript (ESM) · `nanoid` IDs · Resend (magic-link email) · `@fastify/cookie` sessions
- **Frontend** (`web/`): React 18 · Vite 5 · TypeScript · Tailwind 3 · TanStack Query v5 · React Router 6 · `@dnd-kit` (Kanban drag-drop)
- **DB**: SQLite (single file at `server/data/family-asana.db`, WAL, foreign keys ON). Schema: `server/src/schema.sql`
- **Prod hosting**: Windows PC + NSSM service + Tailscale (see `docs/WINDOWS-SETUP.md`)

## Project Structure

```
family-asana/
├── server/                # Fastify + SQLite backend
│   ├── src/
│   │   ├── index.ts       # entry: registers plugins + routes, listens on PORT
│   │   ├── env.ts         # env parsing
│   │   ├── db.ts          # better-sqlite3 instance + schema bootstrap
│   │   ├── auth.ts        # session cookie + magic-link helpers
│   │   ├── mailer.ts      # Resend (or console-log fallback in dev)
│   │   ├── schema.sql     # source of truth for DB shape
│   │   └── routes/        # auth.ts, users.ts, projects.ts, tasks.ts
│   ├── data/              # SQLite file (gitignored)
│   └── .env.example
├── web/                   # React SPA
│   ├── src/
│   │   ├── main.tsx, App.tsx      # entry + router
│   │   ├── api.ts                  # fetch wrapper
│   │   ├── types.ts                # shared API types
│   │   ├── pages/                  # Login, Dashboard
│   │   └── components/             # Sidebar, ListView, BoardView, MyTasks, ProjectView, TaskDetail
│   ├── vite.config.ts              # proxies /api + /health to :4000
│   └── tailwind.config.js
└── docs/                  # SCOPE.md, PHASE-1-SPEC.md, WINDOWS-SETUP.md
```

---

## Setup — first time on this machine

```bash
# 1. install
cd ~/family-asana/server && npm install
cd ~/family-asana/web    && npm install

# 2. server env
cd ~/family-asana/server
cp .env.example .env
# edit .env — at minimum set:
#   SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
# leave RESEND_API_KEY blank for dev (magic links print to the server console)

# 3. dev servers (two terminals)
cd ~/family-asana/server && npm run dev   # → http://localhost:4000
cd ~/family-asana/web    && npm run dev   # → http://localhost:5173

# 4. sign in
# request a link in the UI, then grep the server terminal for "[magic-link]" and paste the URL into the browser
```

Production deployment on the family Windows PC: see [`docs/WINDOWS-SETUP.md`](docs/WINDOWS-SETUP.md). Phase-1 remaining work is in [`docs/PHASE-1-SPEC.md`](docs/PHASE-1-SPEC.md).

---

## Critical Guard Rails

### 📦 ESM Imports [CODE]
**[CODE-00001]** Both packages are ESM (`"type": "module"`). Relative imports from `.ts` files MUST use the `.js` extension (e.g. `import { db } from './db.js'`).
> TRIGGER: When writing any import in `server/src/` or `web/src/`

### 🗄️ Database Conventions [DATA]
**[DATA-00001]** IDs are `nanoid` strings (12–16 chars), never auto-increment integers. Generate server-side.
**[DATA-00002]** Timestamps are unix milliseconds (INTEGER columns), generated server-side via `Date.now()`. No ISO strings in the DB.
**[DATA-00003]** Schema changes go in `server/src/schema.sql` (the source of truth). It's idempotent — uses `CREATE TABLE IF NOT EXISTS`.
**[DATA-00004]** Task status is a CHECK constraint: `todo | doing | done | blocked`. Adding a status means updating the schema, the Zod validator, and the BoardView columns.
> TRIGGER: When touching `server/src/schema.sql`, route handlers, or shared types

### 🔒 Auth & Security [SEC]
**[SEC-00001]** Sessions live in cookies signed with `SESSION_SECRET`. Never log session IDs or magic-link tokens.
**[SEC-00002]** `ALLOWED_EMAILS` (env) gates signup. Empty = open (intended for behind-Tailscale only). Don't accidentally tighten or loosen this in code.
**[SEC-00003]** CORS is dev-only (`origin: true` when `isDev`). In prod the server serves the web build same-origin — don't add public CORS.
> TRIGGER: When editing `server/src/auth.ts`, `server/src/index.ts`, or anything cookie/session-related

### 🌐 API Conventions [API]
**[API-00001]** All API routes are prefixed `/api/*`. `/health` is the only non-prefixed endpoint.
**[API-00002]** Validate request bodies with Zod schemas at the route boundary; trust internal callers.
**[API-00003]** Web dev server proxies `/api` and `/health` to `:4000` — keep both lists in sync if adding new top-level routes (`web/vite.config.ts`).
> TRIGGER: When adding a route or top-level endpoint

### ✅ Verification [VERIFY]
**[VERIFY-00001]** Read code before recommending changes. Schema, route, and frontend types must stay aligned.
**[VERIFY-00002]** For UI changes: run `npm run dev` in both `server/` and `web/`, click through the affected flow in a browser. Type-check ≠ feature-check.
> TRIGGER: Before proposing or completing ANY changes

### 📁 File Organization [FILE]
**[FILE-00001]** Route handlers go in `server/src/routes/<resource>.ts`. Components go in `web/src/components/`. Pages (top-level routes) in `web/src/pages/`.
> TRIGGER: When creating new files

### ⚡ Execution [EXEC]
**[EXEC-00001]** Parallelize independent operations (multiple Read/Bash in one message).
> TRIGGER: Before making tool calls

---

## 📋 Task Management [TASK]
**[TASK-00001]** Use task tracking for multi-step work.
**[TASK-00002]** Commit format: `"Fix: [Description] (Task: <id>)"` — once this repo is under git.
> TRIGGER: When starting complex tasks

---

## 📚 Quick Reference

- **Phase 1 spec / remaining checklist**: [`docs/PHASE-1-SPEC.md`](docs/PHASE-1-SPEC.md)
- **Full scope and roadmap**: [`docs/SCOPE.md`](docs/SCOPE.md)
- **Production setup on Windows**: [`docs/WINDOWS-SETUP.md`](docs/WINDOWS-SETUP.md)
- **Health check**: `curl http://localhost:4000/health`
- **DB file**: `server/data/family-asana.db` (created on first boot)

## ⚠️ Important Reminders

Do what is asked; nothing more, nothing less.
Verify assumptions before acting.
Parallelize independent work.
