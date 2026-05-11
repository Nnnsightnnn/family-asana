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

export function now(): number {
  return Date.now();
}
