import { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db, now } from '../db.js';
import { env } from '../env.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  emailIsAllowed,
  getUserFromRequest,
  setSessionCookie,
  upsertUserByEmail,
} from '../auth.js';
import { sendMagicLink } from '../mailer.js';

const LINK_TTL_MS = 15 * 60 * 1000;

export async function authRoutes(app: FastifyInstance) {
  app.post('/request-link', async (req, reply) => {
    const body = z.object({ email: z.string().email() }).parse(req.body);
    const email = body.email.trim().toLowerCase();

    if (!emailIsAllowed(email)) {
      // Don't leak whether an email is allowed.
      return { ok: true };
    }

    const token = nanoid(40);
    db.prepare(
      'INSERT INTO magic_links (token, email, expires_at) VALUES (?, ?, ?)'
    ).run(token, email, now() + LINK_TTL_MS);

    const url = `${env.APP_URL}/auth/verify?token=${token}`;
    await sendMagicLink(email, url);
    return { ok: true };
  });

  app.get('/verify', async (req, reply) => {
    const q = z.object({ token: z.string().min(10) }).parse(req.query);
    const link = db
      .prepare('SELECT * FROM magic_links WHERE token = ?')
      .get(q.token) as
      | { token: string; email: string; expires_at: number; used_at: number | null }
      | undefined;

    if (!link || link.used_at || link.expires_at < now()) {
      reply.code(400);
      return { error: 'invalid_or_expired' };
    }

    db.prepare('UPDATE magic_links SET used_at = ? WHERE token = ?').run(now(), q.token);
    const user = upsertUserByEmail(link.email);
    const sid = createSession(user.id);
    setSessionCookie(reply, sid);
    return { ok: true, user };
  });

  app.get('/me', async (req) => {
    const user = getUserFromRequest(req);
    return { user };
  });

  app.post('/logout', async (req, reply) => {
    const sid = (req.cookies as Record<string, string | undefined>)?.fa_session;
    if (sid) destroySession(sid);
    clearSessionCookie(reply);
    return { ok: true };
  });
}
