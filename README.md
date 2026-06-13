# Family Asana

Self-hosted, Asana-inspired task manager for the household. Runs on the family Windows PC, reachable from anywhere over Tailscale.

## Layout

```
family-asana/
├── server/   # Fastify + SQLite backend (Node 20+)
├── web/      # React + Vite + Tailwind frontend
└── docs/     # Phase specs, Windows setup, runbooks
```

## Quick start (dev)

```bash
# 1. install deps
cd server && npm install
cd ../web && npm install

# 2. server config
cd ../server
cp .env.example .env
# edit .env: set SESSION_SECRET (any long random string) and RESEND_API_KEY (optional in dev)

# 3. run server (terminal 1)
npm run dev
# → listens on http://localhost:4000, creates ./data/family-asana.db on first run

# 4. run web (terminal 2)
cd ../web
npm run dev
# → opens http://localhost:5173, proxies /api to the server
```

In dev with no Resend key, the server logs magic-link URLs to the console instead of emailing them — paste the URL into your browser to log in.

## Production (Windows)

See [`docs/WINDOWS-SETUP.md`](docs/WINDOWS-SETUP.md) for the full setup: Node install, NSSM service wrapping, Tailscale, static DHCP reservation, scheduled-task backups.

## Phase 1 scope

Projects, tasks (status / assignee / due date), List + Board views, magic-link auth, mobile-responsive shell. Full breakdown: [`docs/PHASE-1-SPEC.md`](docs/PHASE-1-SPEC.md). Later phases (calendar + recurring, comments + attachments, notifications) tracked in [`docs/SCOPE.md`](docs/SCOPE.md).


---

<p align="center">
  <a href="https://nnnsightnnn.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".brand/built-by-dark.svg">
      <img src=".brand/built-by.svg" alt="built by nnnsightnnn" height="26">
    </picture>
  </a>
</p>
