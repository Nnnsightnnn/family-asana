/**
 * Seed the DB with realistic demo data.
 *
 * Idempotent: bails (exit 0) if any users already exist. Delete
 * `server/data/family-asana.db` to start fresh.
 *
 * Run with: npm run seed
 */
import { nanoid } from 'nanoid';
import { db, now } from '../src/db.js';

const DAY = 86_400_000;

type SeedUser = { name: string; email: string; color: string };
type SeedProject = { name: string; color: string };
type SeedTask = {
  project: string; // project name
  title: string;
  status: 'todo' | 'doing' | 'done' | 'blocked';
  assignee?: string; // user name
  dueOffsetDays?: number; // 0 = today, -2 = 2 days overdue, 5 = in 5 days
};

const USERS: SeedUser[] = [
  { name: 'Kenny',  email: 'kenny@family.local', color: '#A86A4B' },
  { name: 'Robin',  email: 'robin@family.local', color: '#6B8A6E' },
  { name: 'Sam',    email: 'sam@family.local',   color: '#5A7A8E' },
];

const PROJECTS: SeedProject[] = [
  { name: 'Home',         color: '#A86A4B' },
  { name: 'Kids',         color: '#6B8A6E' },
  { name: 'Weekend trip', color: '#5A7A8E' },
];

const TASKS: SeedTask[] = [
  // Home
  { project: 'Home', title: 'Replace porch light bulb', status: 'todo', assignee: 'Kenny', dueOffsetDays: -1 },
  { project: 'Home', title: 'Renew Costco membership', status: 'todo', assignee: 'Robin', dueOffsetDays: 3 },
  { project: 'Home', title: 'Schedule HVAC tune-up', status: 'doing', assignee: 'Kenny' },
  { project: 'Home', title: 'Donate the old bookshelf', status: 'blocked', assignee: 'Robin' },
  { project: 'Home', title: 'Hang the hallway mirror', status: 'done', assignee: 'Kenny' },
  { project: 'Home', title: 'Order new air filters', status: 'todo' },

  // Kids
  { project: 'Kids', title: 'Pediatrician appt — Sam', status: 'todo', assignee: 'Robin', dueOffsetDays: 0 },
  { project: 'Kids', title: 'Sign permission slip', status: 'todo', assignee: 'Kenny', dueOffsetDays: 1 },
  { project: 'Kids', title: 'Buy soccer cleats (size 4)', status: 'doing', assignee: 'Kenny', dueOffsetDays: 4 },
  { project: 'Kids', title: 'Library books due back', status: 'todo', assignee: 'Robin', dueOffsetDays: -2 },
  { project: 'Kids', title: 'Plan birthday party', status: 'doing', assignee: 'Robin', dueOffsetDays: 14 },
  { project: 'Kids', title: 'Update emergency contacts at school', status: 'done', assignee: 'Robin' },

  // Weekend trip
  { project: 'Weekend trip', title: 'Book Airbnb', status: 'done', assignee: 'Kenny' },
  { project: 'Weekend trip', title: 'Pack the car Friday night', status: 'todo', assignee: 'Kenny', dueOffsetDays: 5 },
  { project: 'Weekend trip', title: 'Confirm dog sitter', status: 'doing', assignee: 'Robin', dueOffsetDays: 2 },
  { project: 'Weekend trip', title: 'Print the trail map', status: 'todo' },
];

function midnight(offsetDays: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime() + offsetDays * DAY;
}

function main() {
  const existing = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
  if (existing.c > 0) {
    console.log(`DB not empty (${existing.c} users) — skipping seed.`);
    return;
  }

  const ts = now();

  const insertUser = db.prepare(
    'INSERT INTO users (id, email, name, avatar_color, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const insertProject = db.prepare(
    'INSERT INTO projects (id, name, color, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertTask = db.prepare(
    `INSERT INTO tasks
       (id, project_id, title, description, status, assignee_id, due_date, position, parent_id, created_by, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, '', ?, ?, ?, ?, NULL, ?, ?, ?, ?)`
  );

  const userIds = new Map<string, string>();
  const projectIds = new Map<string, string>();

  db.transaction(() => {
    for (const u of USERS) {
      const id = nanoid(12);
      insertUser.run(id, u.email, u.name, u.color, ts);
      userIds.set(u.name, id);
    }

    const adminId = userIds.get('Kenny')!;

    for (const p of PROJECTS) {
      const id = nanoid(12);
      insertProject.run(id, p.name, p.color, adminId, ts, ts);
      projectIds.set(p.name, id);
    }

    let pos = 0;
    for (const t of TASKS) {
      const id = nanoid(12);
      const projectId = projectIds.get(t.project);
      if (!projectId) throw new Error(`Unknown project: ${t.project}`);
      const assigneeId = t.assignee ? userIds.get(t.assignee) ?? null : null;
      const dueDate = t.dueOffsetDays !== undefined ? midnight(t.dueOffsetDays) : null;
      const completedAt = t.status === 'done' ? ts : null;
      insertTask.run(
        id,
        projectId,
        t.title,
        t.status,
        assigneeId,
        dueDate,
        pos++,
        adminId,
        ts,
        ts,
        completedAt
      );
    }
  })();

  console.log(
    `Seeded ${USERS.length} users, ${PROJECTS.length} projects, ${TASKS.length} tasks.`
  );
  console.log('Sign in as one of:');
  for (const u of USERS) console.log(`  ${u.email}`);
}

main();
