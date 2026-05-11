import { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { requireUser } from '../auth.js';

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
}
