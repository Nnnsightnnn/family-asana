import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH ?? join(process.cwd(), 'data', 'family-asana.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema on every boot — all statements are idempotent.
const schemaPath = join(__dirname, 'schema.sql');
const schemaSql = readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);

// Idempotent column-add migration for tables already created on older boots.
// SQLite's CREATE TABLE IF NOT EXISTS won't add columns to an existing table,
// so we add them post-hoc and swallow the "duplicate column" error.
function addColumnIfMissing(table: string, col: string, def: string) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/duplicate column name/i.test(msg)) throw e;
  }
}

// Mobilization columns on tasks (added after initial deploy).
addColumnIfMissing(
  'tasks',
  'route',
  `TEXT NOT NULL DEFAULT 'unset' CHECK (route IN ('unset','diy','delegate','outsource','buy','schedule','research','drop'))`
);
addColumnIfMissing(
  'tasks',
  'mobilization_state',
  `TEXT NOT NULL DEFAULT 'unscoped' CHECK (mobilization_state IN ('unscoped','scoped','dispatched','resolved'))`
);
addColumnIfMissing('tasks', 'next_action', 'TEXT');
addColumnIfMissing('tasks', 'service_url', 'TEXT');
addColumnIfMissing('tasks', 'scoped_at', 'INTEGER');
addColumnIfMissing('tasks', 'scoped_model', 'TEXT');
addColumnIfMissing('tasks', 'recurrence', 'TEXT');

// Indexes that depend on the columns above. CREATE INDEX IF NOT EXISTS is safe to re-run.
db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_route ON tasks(route);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_mobilization ON tasks(mobilization_state);`);

export function now(): number {
  return Date.now();
}
