import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authedFetch, bootTestServer } from './helpers.js';

type Task = {
  id: string;
  title: string;
  status: string;
  route: string;
  mobilization_state: string;
  next_action: string | null;
  service_url: string | null;
  scoped_at: number | null;
  scoped_model: string | null;
  completed_at: number | null;
};

test('mobilization: scoping disabled + storage round-trip', async (t) => {
  const server = await bootTestServer();
  t.after(() => server.close());

  const { fetch: af } = await authedFetch(server.base);

  // Create a project for the rest of this suite.
  const projRes = await af('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Mobilization', color: '#9C6ADE' }),
  });
  const project = (await projRes.json()) as { id: string };

  await t.test('POST /api/scope returns disabled when no OPENROUTER_API_KEY', async () => {
    const res = await af('/api/scope', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Kitchen sink is leaking' }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      disabled?: boolean;
      disabled_reason?: string;
      route: string;
    };
    assert.equal(body.disabled, true);
    assert.equal(body.disabled_reason, 'no_key');
    assert.equal(body.route, 'unset');
  });

  await t.test('POST /api/tasks accepts mobilization fields and stores them', async () => {
    const res = await af('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project_id: project.id,
        title: 'Deep clean kitchen by Saturday',
        route: 'outsource',
        next_action: 'Book a TaskRabbit cleaner for Sat',
        service_url: 'https://www.taskrabbit.com/services/cleaning-services',
        scoped_model: 'anthropic/claude-haiku-4.5',
      }),
    });
    assert.equal(res.status, 200);
    const task = (await res.json()) as Task;
    assert.equal(task.route, 'outsource');
    assert.equal(task.mobilization_state, 'scoped', 'created with route auto-flips to scoped');
    assert.equal(task.next_action, 'Book a TaskRabbit cleaner for Sat');
    assert.equal(task.service_url, 'https://www.taskrabbit.com/services/cleaning-services');
    assert.ok(task.scoped_at, 'scoped_at is set server-side when route is provided on create');
    assert.equal(task.scoped_model, 'anthropic/claude-haiku-4.5');
  });

  await t.test('POST /api/tasks without route defaults to unscoped', async () => {
    const res = await af('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project_id: project.id, title: 'Vacuum living room' }),
    });
    const task = (await res.json()) as Task;
    assert.equal(task.route, 'unset');
    assert.equal(task.mobilization_state, 'unscoped');
    assert.equal(task.scoped_at, null);
  });

  await t.test('PATCH applies mobilization fields and "Mark dispatched"', async () => {
    const createRes = await af('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project_id: project.id, title: 'Fix porch light' }),
    });
    const task = (await createRes.json()) as Task;

    const patch1 = await af(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        route: 'outsource',
        mobilization_state: 'scoped',
        next_action: 'Find a handyman',
        service_url: 'https://www.taskrabbit.com/services/handyman',
      }),
    });
    assert.equal(patch1.status, 200);
    const patched = (await patch1.json()) as Task;
    assert.equal(patched.route, 'outsource');
    assert.equal(patched.mobilization_state, 'scoped');

    const patch2 = await af(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mobilization_state: 'dispatched' }),
    });
    const dispatched = (await patch2.json()) as Task;
    assert.equal(dispatched.mobilization_state, 'dispatched');
  });

  await t.test('PATCH status=done implicitly flips mobilization_state to resolved', async () => {
    const createRes = await af('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project_id: project.id,
        title: 'Order air filters',
        route: 'buy',
        next_action: 'Order from Amazon',
      }),
    });
    const task = (await createRes.json()) as Task;
    assert.equal(task.mobilization_state, 'scoped');

    const patch = await af(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    const done = (await patch.json()) as Task;
    assert.equal(done.status, 'done');
    assert.equal(done.mobilization_state, 'resolved');
    assert.ok(done.completed_at);
  });

  await t.test('POST /api/scope/plan returns disabled body when no key', async () => {
    const res = await af('/api/scope/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Kitchen renovation — new cabinets, tile, paint',
        project_id: project.id,
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      disabled?: boolean;
      disabled_reason?: string;
      kind?: string;
    };
    assert.equal(body.disabled, true);
    assert.equal(body.disabled_reason, 'no_key');
    assert.equal(body.kind, undefined, 'no kind discriminator on a disabled plan');
  });

  await t.test('POST /api/scope/tasks/:id returns 503 when scoping is disabled', async () => {
    const createRes = await af('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project_id: project.id, title: 'Plan a birthday party' }),
    });
    const task = (await createRes.json()) as Task;

    const res = await af(`/api/scope/tasks/${task.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 503);
    const body = (await res.json()) as {
      error: string;
      result: { disabled: boolean; disabled_reason?: string };
    };
    assert.equal(body.error, 'scoping_disabled');
    assert.equal(body.result.disabled, true);
    assert.equal(body.result.disabled_reason, 'no_key');

    // Task should remain unscoped because we refused to persist a disabled result.
    const getRes = await af(`/api/tasks/${task.id}`);
    const fresh = (await getRes.json()) as Task;
    assert.equal(fresh.mobilization_state, 'unscoped');
  });
});
