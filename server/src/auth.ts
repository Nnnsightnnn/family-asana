import { FastifyReply, FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';
import { db, now } from './db.js';
import { env } from './env.js';

const SESSION_COOKIE = 'fa_session';

export type User = {
  id: string;
  email: string;
  name: string;
  avatar_color: string;
  created_at: number;
};

export function createSession(userId: string): string {
  const id = nanoid(32);
  const created = now();
  const expires = created + env.SESSION_DAYS * 24 * 60 * 60 * 1000;
  db.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(id, userId, created, expires);
  return id;
}

export function destroySession(sessionId: string) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function setSessionCookie(reply: FastifyReply, sessionId: string) {
  reply.setCookie(SESSION_COOKIE, sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    // Browsers refuse to store Secure cookies on http:// origins. Tie this
    // to the actual URL scheme (HTTPS) rather than NODE_ENV so a same-origin
    // HTTP deployment (e.g. behind Tailscale only) still works.
    secure: env.APP_URL.startsWith('https://'),
    maxAge: env.SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function getUserFromRequest(req: FastifyRequest): User | null {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (!sid) return null;
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > ?`
    )
    .get(sid, now()) as User | undefined;
  return row ?? null;
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<User> {
  const user = getUserFromRequest(req);
  if (!user) {
    reply.code(401).send({ error: 'unauthorized' });
    throw new Error('unauthorized');
  }
  return user;
}

/** Get-or-create a user by email. Email must already be validated/allowed. */
export function upsertUserByEmail(email: string): User {
  const normalized = email.trim().toLowerCase();
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(normalized) as
    | User
    | undefined;
  if (existing) return existing;

  const id = nanoid(16);
  const name = normalized.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const colors = ['#4573D2', '#F06A6A', '#5DAB6E', '#EBA63F', '#9C6ADE', '#26B5CE'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const created = now();
  db.prepare(
    'INSERT INTO users (id, email, name, avatar_color, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, normalized, name, color, created);
  return { id, email: normalized, name, avatar_color: color, created_at: created };
}

export function emailIsAllowed(email: string): boolean {
  if (env.ALLOWED_EMAILS.length === 0) return true;
  return env.ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}
