import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authedFetch, bootTestServer } from './helpers.js';

test('installation status & complete round-trip', async (t) => {
  const server = await bootTestServer();
  t.after(() => server.close());

  await t.test('fresh install: setup_required=true, no auth needed', async () => {
    const res = await fetch(`${server.base}/api/installation/status`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      setup_required: boolean;
      setup_completed_at: number | null;
    };
    assert.equal(body.setup_required, true);
    assert.equal(body.setup_completed_at, null);
  });

  await t.test('POST /complete requires auth', async () => {
    const res = await fetch(`${server.base}/api/installation/complete`, {
      method: 'POST',
    });
    assert.equal(res.status, 401);
  });

  await t.test('authed user can complete; subsequent status flips & call is idempotent', async () => {
    const { fetch: af } = await authedFetch(server.base);

    const done = await af('/api/installation/complete', { method: 'POST' });
    assert.equal(done.status, 200);
    const first = (await done.json()) as {
      setup_required: boolean;
      setup_completed_at: number;
    };
    assert.equal(first.setup_required, false);
    assert.ok(first.setup_completed_at > 0);

    // status is public — should now report not-required
    const statusRes = await fetch(`${server.base}/api/installation/status`);
    const status = (await statusRes.json()) as {
      setup_required: boolean;
      setup_completed_at: number | null;
    };
    assert.equal(status.setup_required, false);
    assert.equal(status.setup_completed_at, first.setup_completed_at);

    // idempotent — second call returns the same timestamp
    const again = await af('/api/installation/complete', { method: 'POST' });
    const second = (await again.json()) as { setup_completed_at: number };
    assert.equal(second.setup_completed_at, first.setup_completed_at);
  });

  await t.test('PATCH /api/users/me updates name + avatar_color', async () => {
    const { fetch: af } = await authedFetch(server.base);
    const res = await af('/api/users/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Alice Test', avatar_color: '#6B8A6E' }),
    });
    assert.equal(res.status, 200);
    const user = (await res.json()) as { name: string; avatar_color: string };
    assert.equal(user.name, 'Alice Test');
    assert.equal(user.avatar_color, '#6B8A6E');
  });
});
