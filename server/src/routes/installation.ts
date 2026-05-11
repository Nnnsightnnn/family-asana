import { FastifyInstance } from 'fastify';
import { db, now } from '../db.js';
import { requireUser } from '../auth.js';

type InstallationRow = {
  id: number;
  setup_completed_at: number | null;
  setup_started_by: string | null;
};

function readInstallation(): InstallationRow {
  // The schema seeds the singleton row, but be defensive in case an older
  // DB came up without it for any reason.
  let row = db
    .prepare('SELECT * FROM installation WHERE id = 1')
    .get() as InstallationRow | undefined;
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO installation (id) VALUES (1)').run();
    row = db
      .prepare('SELECT * FROM installation WHERE id = 1')
      .get() as InstallationRow;
  }
  return row;
}

export async function installationRoutes(app: FastifyInstance) {
  // Public — needed before any user exists. Reveals only setup state.
  app.get('/status', async () => {
    const row = readInstallation();
    const userCount = (
      db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }
    ).c;
    const setupRequired = userCount === 0 || row.setup_completed_at === null;
    return {
      setup_required: setupRequired,
      setup_completed_at: row.setup_completed_at,
    };
  });

  // Idempotent: second call returns the existing row unchanged.
  app.post('/complete', async (req, reply) => {
    const user = await requireUser(req, reply);
    const row = readInstallation();
    if (row.setup_completed_at !== null) {
      return {
        setup_required: false,
        setup_completed_at: row.setup_completed_at,
        setup_started_by: row.setup_started_by,
      };
    }
    const ts = now();
    db.prepare(
      'UPDATE installation SET setup_completed_at = ?, setup_started_by = ? WHERE id = 1'
    ).run(ts, user.id);
    return {
      setup_required: false,
      setup_completed_at: ts,
      setup_started_by: user.id,
    };
  });
}
