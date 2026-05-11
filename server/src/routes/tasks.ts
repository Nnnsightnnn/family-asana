import { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db, now } from '../db.js';
import { requireUser } from '../auth.js';

const Status = z.enum(['todo', 'doing', 'done', 'blocked']);
const Route = z.enum([
  'unset',
  'diy',
  'delegate',
  'outsource',
  'buy',
  'schedule',
  'research',
  'drop',
]);
const MobilizationState = z.enum(['unscoped', 'scoped', 'dispatched', 'resolved']);

const TaskInput = z.object({
  project_id: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().max(20000).optional(),
  status: Status.optional(),
  assignee_id: z.string().nullable().optional(),
  due_date: z.number().int().nullable().optional(),
  parent_id: z.string().nullable().optional(),
  position: z.number().optional(),
  // Mobilization (optional on create; persisted via "Save & mobilize" path).
  route: Route.optional(),
  mobilization_state: MobilizationState.optional(),
  next_action: z.string().max(280).nullable().optional(),
  service_url: z.string().url().max(2000).nullable().optional(),
  scoped_model: z.string().max(200).nullable().optional(),
});

const TaskPatch = TaskInput.partial().extend({
  project_id: z.string().min(1).optional(),
});

export async function taskRoutes(app: FastifyInstance) {
  // Cross-project search: title/description LIKE %q%, joined with project.
  // Escapes LIKE wildcards in user input so '%' and '_' are matched literally.
  app.get('/search', async (req, reply) => {
    await requireUser(req, reply);
    const parsed = z
      .object({
        q: z.string().min(2).max(200),
        limit: z.coerce.number().int().min(1).max(50).optional(),
      })
      .parse(req.query);
    // Escape SQL LIKE metacharacters in user input. '\' is our ESCAPE char.
    const escaped = parsed.q.replace(/[\\%_]/g, (ch) => '\\' + ch);
    const pattern = `%${escaped}%`;
    const limit = parsed.limit ?? 20;
    const sql = `
      SELECT t.*, p.name AS project_name, p.color AS project_color
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
       WHERE (t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\')
       ORDER BY t.updated_at DESC
       LIMIT ?
    `;
    return db.prepare(sql).all(pattern, pattern, limit);
  });

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

    // Mobilization: when the new-task form sends a route, treat the task as
    // already scoped (mobilization_state='scoped') unless the caller said otherwise.
    const route = body.route ?? 'unset';
    const scoped = route !== 'unset';
    const mobState = body.mobilization_state ?? (scoped ? 'scoped' : 'unscoped');
    const scopedAt = scoped ? ts : null;

    db.prepare(
      `INSERT INTO tasks
        (id, project_id, title, description, status, assignee_id, due_date, position, parent_id,
         route, mobilization_state, next_action, service_url, scoped_at, scoped_model,
         created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      route,
      mobState,
      body.next_action ?? null,
      body.service_url ?? null,
      scopedAt,
      body.scoped_model ?? null,
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
      const completed = body.status === 'done' ? now() : null;
      setField('completed_at', completed);
      // Done implicitly resolves the mobilization, unless the caller is sending
      // an explicit mobilization_state in the same patch.
      if (body.status === 'done' && body.mobilization_state === undefined) {
        setField('mobilization_state', 'resolved');
      }
    }
    if (body.assignee_id !== undefined) setField('assignee_id', body.assignee_id);
    if (body.due_date !== undefined) setField('due_date', body.due_date);
    if (body.position !== undefined) setField('position', body.position);
    if (body.parent_id !== undefined) setField('parent_id', body.parent_id);
    if (body.project_id !== undefined) setField('project_id', body.project_id);
    if (body.route !== undefined) setField('route', body.route);
    if (body.mobilization_state !== undefined) setField('mobilization_state', body.mobilization_state);
    if (body.next_action !== undefined) setField('next_action', body.next_action);
    if (body.service_url !== undefined) setField('service_url', body.service_url);
    if (body.scoped_model !== undefined) setField('scoped_model', body.scoped_model);

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
