import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { requireUser } from '../auth.js';

const UserPatch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  avatar_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export async function userRoutes(app: FastifyInstance) {
  app.get('/', async (req, reply) => {
    await requireUser(req, reply);
    return db
      .prepare('SELECT id, email, name, avatar_color FROM users ORDER BY name COLLATE NOCASE')
      .all();
  });

  app.get('/me', async (req, reply) => {
    return requireUser(req, reply);
  });

  app.patch('/me', async (req, reply) => {
    const user = await requireUser(req, reply);
    const body = UserPatch.parse(req.body);

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (body.name !== undefined) {
      sets.push('name = ?');
      vals.push(body.name);
    }
    if (body.avatar_color !== undefined) {
      sets.push('avatar_color = ?');
      vals.push(body.avatar_color);
    }
    if (sets.length > 0) {
      vals.push(user.id);
      db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    }
    return db
      .prepare('SELECT id, email, name, avatar_color, created_at FROM users WHERE id = ?')
      .get(user.id);
  });
}
