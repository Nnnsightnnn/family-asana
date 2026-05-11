import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import { nanoid } from 'nanoid';

export type TestServer = {
  base: string;
  dbPath: string;
  close: () => Promise<void>;
};

/**
 * Boot a Fastify app instance against a fresh tmp SQLite DB on an ephemeral
 * port. Sets DB_PATH and SESSION_SECRET BEFORE importing src so module init
 * picks them up.
 */
export async function bootTestServer(): Promise<TestServer> {
  const dbPath = join(tmpdir(), `fa-test-${Date.now()}-${nanoid(8)}.db`);
  process.env.DB_PATH = dbPath;
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'test-secret-' + nanoid(16);
  process.env.NODE_ENV = 'development';
  process.env.RESEND_API_KEY = ''; // force console-log mailer

  const { buildApp } = await import('../src/app.js');
  const app = await buildApp();
  const address = await app.listen({ port: 0, host: '127.0.0.1' });

  return {
    base: address,
    dbPath,
    close: async () => {
      await app.close();
      for (const suffix of ['', '-wal', '-shm']) {
        const f = dbPath + suffix;
        if (existsSync(f)) {
          try {
            unlinkSync(f);
          } catch {
            // best-effort cleanup
          }
        }
      }
    },
  };
}

type FetchLike = (
  path: string,
  init?: RequestInit
) => Promise<Response>;

/**
 * Sign in via magic-link round-trip for the given email and return a
 * fetch-like helper that includes the session cookie on every call.
 */
export async function authedFetch(
  base: string,
  email = `tester-${nanoid(8)}@example.com`
): Promise<{ fetch: FetchLike; cookie: string; email: string }> {
  // 1. Request a magic link
  const reqRes = await fetch(`${base}/api/auth/request-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!reqRes.ok) throw new Error(`request-link failed: ${reqRes.status}`);

  // 2. Pull the token directly from the DB (mailer just logs it in dev)
  const { db } = await import('../src/db.js');
  const row = db
    .prepare('SELECT token FROM magic_links WHERE email = ? ORDER BY expires_at DESC LIMIT 1')
    .get(email.toLowerCase()) as { token: string } | undefined;
  if (!row) throw new Error('no magic-link row found');

  // 3. Verify the token
  const verifyRes = await fetch(`${base}/api/auth/verify?token=${row.token}`);
  if (!verifyRes.ok) throw new Error(`verify failed: ${verifyRes.status}`);
  const setCookie = verifyRes.headers.get('set-cookie');
  if (!setCookie) throw new Error('no Set-Cookie on verify response');

  // Extract just the name=value pair (drop attrs like Path=, HttpOnly, ...)
  const cookie = setCookie.split(';')[0];

  const wrapped: FetchLike = (path, init = {}) => {
    const headers = new Headers(init.headers ?? {});
    headers.set('cookie', cookie);
    return fetch(`${base}${path}`, { ...init, headers });
  };

  return { fetch: wrapped, cookie, email };
}
