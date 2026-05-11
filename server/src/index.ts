import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { env, isDev } from './env.js';
import { db } from './db.js';
import { authRoutes } from './routes/auth.js';
import { projectRoutes } from './routes/projects.js';
import { taskRoutes } from './routes/tasks.js';
import { userRoutes } from './routes/users.js';

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

app
  .listen({ port: env.PORT, host: env.HOST })
  .then(() => app.log.info(`family-asana server listening on ${env.HOST}:${env.PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
