import { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db, now } from '../db.js';
import { requireUser } from '../auth.js';

const ProjectInput = z.object({
  name: z.string().min(1).max(120),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export async function projectRoutes(app: FastifyInstance) {
  app.get('/', async (req, reply) => {
    await requireUser(req, reply);
    return db
      .prepare(
        `SELECT p.*,
                (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.parent_id IS NULL) as task_count,
                (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.parent_id IS NULL AND t.status = 'done') as done_count
           FROM projects p
          WHERE p.archived_at IS NULL
          ORDER BY p.created_at DESC`
      )
      .all();
  });

  app.post('/', async (req, reply) => {
    const user = await requireUser(req, reply);
    const body = ProjectInput.parse(req.body);
    const id = nanoid(12);
    const ts = now();
    db.prepare(
      `INSERT INTO projects (id, name, color, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, body.name, body.color ?? '#4573D2', user.id, ts, ts);
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  });

  app.get('/:id', async (req, reply) => {
    await requireUser(req, reply);
    const { id } = req.params as { id: string };
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!row) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return row;
  });

  app.patch('/:id', async (req, reply) => {
    await requireUser(req, reply);
    const { id } = req.params as { id: string };
    const body = ProjectInput.partial().parse(req.body);

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (body.name !== undefined) {
      sets.push('name = ?');
      vals.push(body.name);
    }
    if (body.color !== undefined) {
      sets.push('color = ?');
      vals.push(body.color);
    }
    if (sets.length === 0) {
      return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    }
    sets.push('updated_at = ?');
    vals.push(now(), id);
    db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  });

  app.delete('/:id', async (req, reply) => {
    await requireUser(req, reply);
    const { id } = req.params as { id: string };
    db.prepare('UPDATE projects SET archived_at = ? WHERE id = ?').run(now(), id);
    return { ok: true };
  });
}
