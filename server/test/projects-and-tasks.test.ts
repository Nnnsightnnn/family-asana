import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authedFetch, bootTestServer } from './helpers.js';

test('projects & tasks happy path', async (t) => {
  const server = await bootTestServer();
  t.after(() => server.close());

  await t.test('unauthenticated GET /api/projects returns 401', async () => {
    const res = await fetch(`${server.base}/api/projects`);
    assert.equal(res.status, 401);
  });

  await t.test('authed user can CRUD projects and tasks', async () => {
    const { fetch: af } = await authedFetch(server.base);

    // create project
    const createProj = await af('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Test Project', color: '#4573D2' }),
    });
    assert.equal(createProj.status, 200);
    const project = (await createProj.json()) as { id: string; name: string };
    assert.ok(project.id);
    assert.equal(project.name, 'Test Project');

    // create task
    const createTask = await af('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project_id: project.id, title: 'First task' }),
    });
    assert.equal(createTask.status, 200);
    const task = (await createTask.json()) as { id: string; status: string };
    assert.ok(task.id);
    assert.equal(task.status, 'todo');

    // patch task -> done
    const patchTask = await af(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    assert.equal(patchTask.status, 200);
    const patched = (await patchTask.json()) as { status: string; completed_at: number | null };
    assert.equal(patched.status, 'done');
    assert.ok(patched.completed_at, 'completed_at is set when status=done');

    // list tasks (filter by project), should include our done task
    const listRes = await af(`/api/tasks?project_id=${project.id}`);
    assert.equal(listRes.status, 200);
    const list = (await listRes.json()) as Array<{ id: string; status: string }>;
    const found = list.find((t) => t.id === task.id);
    assert.ok(found, 'created task appears in list');
    assert.equal(found!.status, 'done');

    // delete task
    const delRes = await af(`/api/tasks/${task.id}`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);

    const listAfter = await af(`/api/tasks?project_id=${project.id}`);
    const listAfterJson = (await listAfter.json()) as Array<{ id: string }>;
    assert.ok(
      !listAfterJson.find((t) => t.id === task.id),
      'deleted task is gone'
    );
  });
});
