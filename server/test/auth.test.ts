import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootTestServer } from './helpers.js';

test('auth flow', async (t) => {
  const server = await bootTestServer();
  t.after(() => server.close());

  await t.test('GET /health returns ok=true', async () => {
    const res = await fetch(`${server.base}/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; ts: number };
    assert.equal(body.ok, true);
    assert.equal(typeof body.ts, 'number');
  });

  await t.test('POST /api/auth/request-link inserts a magic_links row', async () => {
    const email = 'alice@example.com';
    const res = await fetch(`${server.base}/api/auth/request-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    assert.equal(res.status, 200);

    const { db } = await import('../src/db.js');
    const row = db
      .prepare('SELECT * FROM magic_links WHERE email = ?')
      .get(email) as { token: string; email: string; expires_at: number } | undefined;
    assert.ok(row, 'magic_links row was inserted');
    assert.equal(row!.email, email);
    assert.ok(row!.expires_at > Date.now(), 'expires_at is in the future');
    assert.ok(row!.token && row!.token.length >= 10);
  });

  await t.test('magic-link round-trip: verify sets cookie, /me returns user', async () => {
    const email = 'bob@example.com';
    await fetch(`${server.base}/api/auth/request-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const { db } = await import('../src/db.js');
    const row = db
      .prepare('SELECT token FROM magic_links WHERE email = ? ORDER BY expires_at DESC LIMIT 1')
      .get(email) as { token: string } | undefined;
    assert.ok(row, 'token row exists');

    const verifyRes = await fetch(`${server.base}/api/auth/verify?token=${row!.token}`);
    assert.equal(verifyRes.status, 200);
    const setCookie = verifyRes.headers.get('set-cookie');
    assert.ok(setCookie, 'session cookie was set');
    assert.match(setCookie!, /fa_session=/);

    const cookie = setCookie!.split(';')[0];
    const meRes = await fetch(`${server.base}/api/auth/me`, {
      headers: { cookie },
    });
    assert.equal(meRes.status, 200);
    const me = (await meRes.json()) as { user: { email: string } | null };
    assert.ok(me.user, '/me returns a user when authed');
    assert.equal(me.user!.email, email);
  });
});
