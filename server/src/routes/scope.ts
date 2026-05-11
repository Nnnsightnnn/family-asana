import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, now } from '../db.js';
import { requireUser } from '../auth.js';
import { scopeTask } from '../ai.js';

const ScopeInput = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(20000).optional(),
  due_date: z.number().int().nullable().optional(),
  tier: z.enum(['fast', 'smart']).optional(),
});

const ScopeTaskParams = z.object({
  tier: z.enum(['fast', 'smart']).optional(),
});

export async function scopeRoutes(app: FastifyInstance) {
  // Live scoping for the new-task form (no task exists yet).
  app.post('/', async (req, reply) => {
    await requireUser(req, reply);
    const body = ScopeInput.parse(req.body);
    const result = await scopeTask(
      { title: body.title, description: body.description, due_date: body.due_date ?? null },
      { tier: body.tier }
    );
    return result;
  });

  // Scope an existing task and persist the result.
  app.post('/tasks/:id', async (req, reply) => {
    await requireUser(req, reply);
    const { id } = req.params as { id: string };
    const body = ScopeTaskParams.parse(req.body ?? {});

    const row = db
      .prepare('SELECT id, title, description, due_date FROM tasks WHERE id = ?')
      .get(id) as
      | { id: string; title: string; description: string; due_date: number | null }
      | undefined;
    if (!row) {
      reply.code(404);
      return { error: 'not_found' };
    }

    const result = await scopeTask(
      {
        title: row.title,
        description: row.description,
        due_date: row.due_date,
      },
      { tier: body.tier }
    );

    if (result.disabled) {
      reply.code(503);
      return { error: 'scoping_disabled', result };
    }

    const ts = now();
    db.prepare(
      `UPDATE tasks SET
         route = ?,
         mobilization_state = CASE WHEN mobilization_state = 'unscoped' THEN 'scoped' ELSE mobilization_state END,
         next_action = ?,
         service_url = ?,
         scoped_at = ?,
         scoped_model = ?,
         updated_at = ?
       WHERE id = ?`
    ).run(
      result.route === 'unset' ? 'unset' : result.route,
      result.next_action,
      result.service_url,
      ts,
      result.model,
      ts,
      id
    );

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    return { task: updated, scope: result };
  });
}
