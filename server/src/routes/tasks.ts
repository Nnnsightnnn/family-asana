import { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db, now } from '../db.js';
import { requireUser } from '../auth.js';

const Status = z.enum(['todo', 'doing', 'done', 'blocked']);

const TaskInput = z.object({
  project_id: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().max(20000).optional(),
  status: Status.optional(),
  assignee_id: z.string().nullable().optional(),
  due_date: z.number().int().nullable().optional(),
  parent_id: z.string().nullable().optional(),
  position: z.number().optional(),
});

const TaskPatch = TaskInput.partial().extend({
  project_id: z.string().min(1).optional(),
});

export async function taskRoutes(app: FastifyInstance) {
  // List tasks, filterable by project or assignee
  app.get('/', async (req, reply) => {
    await requireUser(req, reply);
    const q = z
      .object({
        project_id: z.string().optional(),
        assignee_id: z.string().optional(),
        mine: z.string().optional(),
      })
      .parse(req.query);

    const where: string[] = [];
    const args: unknown[] = [];
    if (q.project_id) {
      where.push('project_id = ?');
      args.push(q.project_id);
    }
    if (q.assignee_id) {
      where.push('assignee_id = ?');
      args.push(q.assignee_id);
    }
    if (q.mine === '1') {
      const user = await requireUser(req, reply);
      where.push('assignee_id = ?');
      args.push(user.id);
    }
    const sql = `SELECT * FROM tasks ${
      where.length ? 'WHERE ' + where.join(' AND ') : ''
    } ORDER BY status, position, created_at`;
    return db.prepare(sql).all(...args);
  });

  app.post('/', async (req, reply) => {
    const user = await requireUser(req, reply);
    const body = TaskInput.parse(req.body);
    const id = nanoid(12);
    const ts = now();

    // Default position = max(position) + 1 within project & status
    const status = body.status ?? 'todo';
    const maxPos = db
      .prepare(
        'SELECT COALESCE(MAX(position), 0) as p FROM tasks WHERE project_id = ? AND status = ?'
      )
      .get(body.project_id, status) as { p: number };
    const position = body.position ?? maxPos.p + 1;

    db.prepare(
      `INSERT INTO tasks
        (id, project_id, title, description, status, assignee_id, due_date, position, parent_id, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      body.project_id,
      body.title,
      body.description ?? '',
      status,
      body.assignee_id ?? null,
      body.due_date ?? null,
      position,
      body.parent_id ?? null,
      user.id,
      ts,
      ts
    );
    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  });

  app.get('/:id', async (req, reply) => {
    await requireUser(req, reply);
    const { id } = req.params as { id: string };
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!row) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return row;
  });

  app.patch('/:id', async (req, reply) => {
    await requireUser(req, reply);
    const { id } = req.params as { id: string };
    const body = TaskPatch.parse(req.body);

    const sets: string[] = [];
    const vals: unknown[] = [];
    const setField = (col: string, val: unknown) => {
      sets.push(`${col} = ?`);
      vals.push(val);
    };

    if (body.title !== undefined) setField('title', body.title);
    if (body.description !== undefined) setField('description', body.description);
    if (body.status !== undefined) {
      setField('status', body.status);
      setField('completed_at', body.status === 'done' ? now() : null);
    }
    if (body.assignee_id !== undefined) setField('assignee_id', body.assignee_id);
    if (body.due_date !== undefined) setField('due_date', body.due_date);
    if (body.position !== undefined) setField('position', body.position);
    if (body.parent_id !== undefined) setField('parent_id', body.parent_id);
    if (body.project_id !== undefined) setField('project_id', body.project_id);

    if (sets.length === 0) return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

    setField('updated_at', now());
    vals.push(id);
    db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  });

  app.delete('/:id', async (req, reply) => {
    await requireUser(req, reply);
    const { id } = req.params as { id: string };
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return { ok: true };
  });
}
