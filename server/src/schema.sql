-- Family Asana schema (Phase 1)
-- All IDs are short nanoid strings.
-- All timestamps are unix milliseconds (INTEGER), generated server-side.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#4573D2', -- Asana-ish blue
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS magic_links (
  token      TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#4573D2',
  archived_at INTEGER,
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(archived_at);

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done','blocked')),
  assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  due_date    INTEGER, -- unix ms, midnight UTC
  position    REAL NOT NULL DEFAULT 0, -- fractional indexing for list ordering
  parent_id   TEXT REFERENCES tasks(id) ON DELETE CASCADE, -- subtasks
  completed_at INTEGER,
  -- Mobilization: route a task from problem surface to solution surface.
  route       TEXT NOT NULL DEFAULT 'unset'
              CHECK (route IN ('unset','diy','delegate','outsource','buy','schedule','research','drop')),
  mobilization_state TEXT NOT NULL DEFAULT 'unscoped'
              CHECK (mobilization_state IN ('unscoped','scoped','dispatched','resolved')),
  next_action  TEXT, -- short imperative the AI proposed, e.g. "Call the landlord"
  service_url  TEXT, -- deep link when route=outsource|buy
  scoped_at    INTEGER, -- when AI last scoped this task
  scoped_model TEXT, -- which OpenRouter model produced the scope
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
-- Indexes on mobilization columns are created in db.ts AFTER the
-- addColumnIfMissing migration runs, so existing DBs without those columns
-- don't blow up on first boot.
