import { env } from './env.js';
import { buildApp } from './app.js';

const app = await buildApp();

app
  .listen({ port: env.PORT, host: env.HOST })
  .then(() => app.log.info(`family-asana server listening on ${env.HOST}:${env.PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
