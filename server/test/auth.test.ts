import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootTestServer, authedFetch } from './helpers.js';

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
    const me = (await meRes.json()) as {
      user: { email: string } | null;
      has_password: boolean;
    };
    assert.ok(me.user, '/me returns a user when authed');
    assert.equal(me.user!.email, email);
    assert.equal(me.has_password, false, 'new user has no password yet');
  });

  await t.test('password flow: set, login, /me reports has_password', async () => {
    const email = `carol-${Date.now()}@example.com`;
    const { fetch: authed, cookie } = await authedFetch(server.base, email);

    // set-password without auth → 401
    const unauth = await fetch(`${server.base}/api/auth/set-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery' }),
    });
    assert.equal(unauth.status, 401);

    // set-password while authed → 200
    const setRes = await authed('/api/auth/set-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery' }),
    });
    assert.equal(setRes.status, 200);

    // /me now reports has_password: true and must NOT leak the hash
    const meRes = await authed('/api/auth/me');
    const meRaw = await meRes.text();
    assert.ok(!/password_hash/.test(meRaw), '/me must not leak password_hash');
    assert.ok(!/argon2/.test(meRaw), '/me must not leak the argon2 hash');
    const me = JSON.parse(meRaw) as { has_password: boolean };
    assert.equal(me.has_password, true);

    // login with correct credentials → 200 + new session cookie
    const loginOk = await fetch(`${server.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'correct horse battery' }),
    });
    assert.equal(loginOk.status, 200);
    const newCookie = loginOk.headers.get('set-cookie');
    assert.ok(newCookie, 'login sets a fa_session cookie');
    assert.match(newCookie!, /fa_session=/);
    const loginRaw = await loginOk.text();
    assert.ok(!/password_hash/.test(loginRaw), 'login response must not leak password_hash');
    assert.ok(!/argon2/.test(loginRaw), 'login response must not leak the argon2 hash');

    // The new cookie is independent — /me works with it
    const meWithNew = await fetch(`${server.base}/api/auth/me`, {
      headers: { cookie: newCookie!.split(';')[0] },
    });
    const meBody = (await meWithNew.json()) as { user: { email: string } | null };
    assert.equal(meBody.user!.email, email);

    // wrong password → 401 invalid_credentials
    const badPw = await fetch(`${server.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrong' }),
    });
    assert.equal(badPw.status, 401);
    const badPwBody = (await badPw.json()) as { error: string };
    assert.equal(badPwBody.error, 'invalid_credentials');

    // unknown email → same 401 shape (no enumeration)
    const unknown = await fetch(`${server.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `nobody-${Date.now()}@example.com`, password: 'whatever' }),
    });
    assert.equal(unknown.status, 401);
    const unknownBody = (await unknown.json()) as { error: string };
    assert.equal(unknownBody.error, 'invalid_credentials');

    // user with no password set → login returns 401 (no leak)
    const otherEmail = `dave-${Date.now()}@example.com`;
    await authedFetch(server.base, otherEmail); // creates the user, no password
    const noPw = await fetch(`${server.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: otherEmail, password: 'anything' }),
    });
    assert.equal(noPw.status, 401);

    // DELETE /password reverts to magic-link only
    const removeRes = await authed('/api/auth/password', { method: 'DELETE' });
    assert.equal(removeRes.status, 200);
    const afterRemove = await fetch(`${server.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'correct horse battery' }),
    });
    assert.equal(afterRemove.status, 401, 'login fails after password removed');

    // Cookie is consumed silently to keep TS happy on unused vars
    void cookie;
  });
});
