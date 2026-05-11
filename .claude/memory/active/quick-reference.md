# Quick Reference

Top patterns for Family Asana. Check this FIRST before any task.

**Last Updated**: 2026-05-11
**Pattern Count**: 6

---

## How to Use

When starting any task: scan relevant sections → apply the pattern → update if you discover improvements.

---

## Patterns

### [ESM-IMPORTS] Add `.js` extension to relative imports

**Quick Check**: Both `server/` and `web/` are `"type": "module"`. TS source compiles to ESM JS, so resolver needs the `.js` suffix.

**Quick Fix**: Import as `from './db.js'`, not `from './db'` or `from './db.ts'`. Yes, even though the file is `.ts`.

**Common Mistake**: Copy-pasting from a CommonJS example and dropping the extension — TS will compile but the runtime will fail to resolve.

**Example**: `server/src/index.ts` lines 5–10.

---

### [DB-SCHEMA] Schema changes go in `schema.sql` first

**Quick Check**: All tables defined in `server/src/schema.sql`. It's idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).

**Quick Fix**: When adding a column or table:
1. Edit `server/src/schema.sql`.
2. For an existing DB, write a small migration (the bootstrap only creates, doesn't migrate). Delete `server/data/family-asana.db` in dev to start fresh.
3. Update Zod validators in the relevant `server/src/routes/*.ts`.
4. Update `web/src/types.ts` to mirror.

**Common Mistake**: Adding columns only to the route handler — the SQLite file persists between dev sessions and silently uses the old shape.

---

### [IDS-AND-TIMES] nanoid IDs, unix-ms timestamps

**Quick Check**: IDs are 12–16 char nanoid strings. Timestamps are INTEGER unix milliseconds (`Date.now()`), generated server-side.

**Quick Fix**:
```ts
import { nanoid } from 'nanoid';
const id = nanoid(14);
const now = Date.now();
db.prepare('INSERT INTO tasks (id, ..., created_at, updated_at) VALUES (?, ..., ?, ?)').run(id, ..., now, now);
```

**Common Mistake**: Storing ISO strings or auto-increment ints — breaks the existing query layer and frontend type assumptions.

---

### [TASK-STATUS] Status enum is locked at four values

**Quick Check**: `tasks.status` CHECK constraint allows only `'todo' | 'doing' | 'done' | 'blocked'`.

**Quick Fix**: Adding a new status requires:
1. Update CHECK constraint in `server/src/schema.sql` (and migrate existing DB).
2. Update the Zod enum in `server/src/routes/tasks.ts`.
3. Update `Task['status']` in `web/src/types.ts`.
4. Add the column in `web/src/components/BoardView.tsx`.

**Common Mistake**: Only updating the frontend — server will 400 on the new value, or the SQLite CHECK will reject.

---

### [API-PROXY] Keep Vite proxy in sync with new top-level routes

**Quick Check**: `web/vite.config.ts` proxies `/api` and `/health` to `:4000`. Anything else (e.g. a new `/webhook` endpoint) won't reach the server in dev.

**Quick Fix**: Add the new prefix to the `proxy` object in `web/vite.config.ts`.

**Common Mistake**: Adding a route on the server that works in curl but 404s from the React app — almost always a missing proxy entry.

---

### [DEV-LOGIN] Magic links log to console in dev

**Quick Check**: If `RESEND_API_KEY` is empty in `server/.env`, `mailer.ts` logs the magic-link URL to stdout instead of sending email.

**Quick Fix**: Check the server terminal after `POST /api/auth/request-link`. Paste the logged URL into the browser to log in.

**Common Mistake**: Wondering why no email arrived — verify `RESEND_API_KEY` is set if you actually want real email.

---

## Categories

### Backend (`server/`)
- ESM-IMPORTS, DB-SCHEMA, IDS-AND-TIMES, TASK-STATUS, DEV-LOGIN

### Frontend (`web/`)
- API-PROXY

### Add new patterns here as they emerge.

---

**Next Review**: 2026-05-18
