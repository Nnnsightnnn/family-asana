import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authedFetch, bootTestServer } from './helpers.js';

test('admin route gating', async (t) => {
  // The admin allowlist is parsed at module init from process.env, so it must
  // be set before bootTestServer() dynamically imports src/.
  process.env.ADMIN_EMAILS = 'admin@example.com';
  const server = await bootTestServer();
  t.after(() => server.close());

  await t.test('non-admin → 403 on /api/admin/stats', async () => {
    const { fetch: af } = await authedFetch(server.base, 'notadmin@example.com');
    const res = await af('/api/admin/stats');
    assert.equal(res.status, 403);
  });

  await t.test('admin → 200 on /api/admin/stats with 5 numbers', async () => {
    const { fetch: af } = await authedFetch(server.base, 'admin@example.com');
    const res = await af('/api/admin/stats');
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, number>;
    for (const k of ['users_total', 'tasks_total', 'tasks_last_7d', 'tasks_resolved_7d', 'projects_total']) {
      assert.equal(typeof body[k], 'number', `${k} is a number`);
    }
  });

  await t.test('admin can revoke another user\'s sessions', async () => {
    const { fetch: af } = await authedFetch(server.base, 'admin@example.com');
    const target = await authedFetch(server.base, 'victim@example.com');
    // Target has an active session — confirm /me works first.
    const meBefore = await target.fetch('/api/auth/me');
    const meBody = (await meBefore.json()) as { user: { email: string } | null };
    assert.ok(meBody.user, 'target is logged in before revoke');

    // Look up the target user id via the admin users endpoint.
    const usersRes = await af('/api/admin/users');
    const users = (await usersRes.json()) as Array<{ id: string; email: string }>;
    const victim = users.find((u) => u.email === 'victim@example.com');
    assert.ok(victim, 'victim appears in /api/admin/users');

    const revokeRes = await af(`/api/admin/sessions/${victim!.id}/revoke`, { method: 'POST' });
    assert.equal(revokeRes.status, 200);
    const revokeBody = (await revokeRes.json()) as { revoked: number };
    assert.ok(revokeBody.revoked >= 1, 'at least one session was revoked');

    // Target's cookie should no longer authenticate.
    const meAfter = await target.fetch('/api/auth/me');
    const meAfterBody = (await meAfter.json()) as { user: { email: string } | null };
    assert.equal(meAfterBody.user, null, 'target is logged out after revoke');
  });
});
