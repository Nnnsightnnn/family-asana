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
  getUserByEmail,
  getUserFromRequest,
  hashPassword,
  requireUser,
  setSessionCookie,
  upsertUserByEmail,
  userHasPassword,
  verifyPassword,
} from '../auth.js';
import { sendMagicLink } from '../mailer.js';

const LINK_TTL_MS = 15 * 60 * 1000;
const MIN_PASSWORD_LEN = 8;
const MAX_PASSWORD_LEN = 200;

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

  app.post('/login', async (req, reply) => {
    const body = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .parse(req.body);
    const email = body.email.trim().toLowerCase();

    // Same response shape for every failure mode so we don't leak which
    // emails exist or which have passwords set.
    const fail = () => {
      reply.code(401);
      return { error: 'invalid_credentials' };
    };

    if (!emailIsAllowed(email)) return fail();

    const user = getUserByEmail(email);
    if (!user || !user.password_hash) return fail();

    const ok = await verifyPassword(body.password, user.password_hash);
    if (!ok) return fail();

    const sid = createSession(user.id);
    setSessionCookie(reply, sid);
    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_color: user.avatar_color,
        created_at: user.created_at,
      },
    };
  });

  app.post('/set-password', async (req, reply) => {
    const user = await requireUser(req, reply);
    const body = z
      .object({
        password: z.string().min(MIN_PASSWORD_LEN).max(MAX_PASSWORD_LEN),
        current_password: z.string().min(1).max(MAX_PASSWORD_LEN).optional(),
      })
      .parse(req.body);

    // If the user already has a password, require the current one to rotate it.
    if (userHasPassword(user.id)) {
      const row = db
        .prepare('SELECT password_hash FROM users WHERE id = ?')
        .get(user.id) as { password_hash: string | null };
      if (!body.current_password) {
        reply.code(400);
        return { error: 'current_password_required' };
      }
      const ok = await verifyPassword(body.current_password, row.password_hash!);
      if (!ok) {
        reply.code(401);
        return { error: 'invalid_current_password' };
      }
    }

    const hash = await hashPassword(body.password);
    db.prepare(
      'UPDATE users SET password_hash = ?, password_set_at = ? WHERE id = ?'
    ).run(hash, now(), user.id);
    return { ok: true };
  });

  app.delete('/password', async (req, reply) => {
    const user = await requireUser(req, reply);
    db.prepare(
      'UPDATE users SET password_hash = NULL, password_set_at = NULL WHERE id = ?'
    ).run(user.id);
    return { ok: true };
  });

  app.get('/me', async (req) => {
    const user = getUserFromRequest(req);
    if (!user) return { user: null, has_password: false };
    return { user, has_password: userHasPassword(user.id) };
  });

  app.post('/logout', async (req, reply) => {
    const sid = (req.cookies as Record<string, string | undefined>)?.fa_session;
    if (sid) destroySession(sid);
    clearSessionCookie(reply);
    return { ok: true };
  });
}
