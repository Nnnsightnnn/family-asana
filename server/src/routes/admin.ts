import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { db, now } from '../db.js';
import { env } from '../env.js';
import { requireUser, User } from '../auth.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function isAdmin(user: User): boolean {
  return env.ADMIN_EMAILS.includes(user.email.trim().toLowerCase());
}

/**
 * Gate: require an authed user AND admin-allowlisted email.
 * Returns the user on success; otherwise sends 401/403 and throws to abort the
 * handler (same pattern as requireUser).
 */
async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<User> {
  const user = await requireUser(req, reply);
  if (!isAdmin(user)) {
    reply.code(403).send({ error: 'forbidden' });
    throw new Error('forbidden');
  }
  return user;
}

export async function adminRoutes(app: FastifyInstance) {
  // Five-number health snapshot for the in-app admin page.
  app.get('/stats', async (req, reply) => {
    await requireAdmin(req, reply);
    const sevenDaysAgo = now() - 7 * DAY_MS;

    const usersTotal = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
    const projectsTotal = (
      db
        .prepare('SELECT COUNT(*) as c FROM projects WHERE archived_at IS NULL')
        .get() as { c: number }
    ).c;
    const tasksTotal = (db.prepare('SELECT COUNT(*) as c FROM tasks').get() as { c: number }).c;
    const tasksLast7d = (
      db
        .prepare('SELECT COUNT(*) as c FROM tasks WHERE created_at >= ?')
        .get(sevenDaysAgo) as { c: number }
    ).c;
    // Phase 5 mobilization adds `mobilization_state='resolved'` when a task is
    // completed. Use that signal (vs. status='done') so it reflects the
    // routed-and-done meaning.
    const tasksResolved7d = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM tasks WHERE mobilization_state = 'resolved' AND updated_at >= ?"
        )
        .get(sevenDaysAgo) as { c: number }
    ).c;

    return {
      users_total: usersTotal,
      tasks_total: tasksTotal,
      tasks_last_7d: tasksLast7d,
      tasks_resolved_7d: tasksResolved7d,
      projects_total: projectsTotal,
    };
  });

  // Family roster + last-session timestamp (for the revoke-button row).
  app.get('/users', async (req, reply) => {
    await requireAdmin(req, reply);
    return db
      .prepare(
        `SELECT u.id, u.email, u.name, u.avatar_color, u.created_at,
                (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_session_at,
                (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS active_sessions
           FROM users u
           ORDER BY u.name COLLATE NOCASE`
      )
      .all(now());
  });

  // Kill every session row for the target user. Returns the number deleted so
  // the UI can confirm "Revoked 3 sessions."
  app.post('/sessions/:user_id/revoke', async (req, reply) => {
    await requireAdmin(req, reply);
    const { user_id } = req.params as { user_id: string };
    const info = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user_id);
    return { revoked: info.changes };
  });
}
