import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, isDev } from './env.js';
import { db } from './db.js';
import { authRoutes } from './routes/auth.js';
import { projectRoutes } from './routes/projects.js';
import { taskRoutes } from './routes/tasks.js';
import { userRoutes } from './routes/users.js';
import { scopeRoutes } from './routes/scope.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: isDev ? true : false, // in prod we serve the web build from the same origin
    credentials: true,
  });
  await app.register(cookie, { secret: env.SESSION_SECRET });

  app.get('/health', async () => ({
    ok: true,
    ts: Date.now(),
    users: db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number },
  }));

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(projectRoutes, { prefix: '/api/projects' });
  await app.register(taskRoutes, { prefix: '/api/tasks' });
  await app.register(scopeRoutes, { prefix: '/api/scope' });

  // In production, serve the built web SPA from /web/dist with SPA fallback.
  if (!isDev) {
    const webDist = resolve(__dirname, '../../web/dist');
    if (existsSync(webDist)) {
      await app.register(fastifyStatic, {
        root: webDist,
        prefix: '/',
      });

      app.setNotFoundHandler((req, reply) => {
        if (
          (req.method === 'GET' || req.method === 'HEAD') &&
          !req.url.startsWith('/api/') &&
          !req.url.startsWith('/health')
        ) {
          return reply.type('text/html').sendFile('index.html');
        }
        reply.code(404).send({ error: 'not_found' });
      });
    } else {
      app.log.warn(
        `web dist directory not found at ${webDist} — serving API only`
      );
    }
  }

  return app;
}
