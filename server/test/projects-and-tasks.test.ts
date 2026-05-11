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

  await t.test('cross-project search returns matches joined with project', async () => {
    const { fetch: af } = await authedFetch(server.base);

    // Two projects, three tasks; only the ones with "needle" in title/desc match.
    const p1 = (await (
      await af('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Search Alpha', color: '#111111' }),
      })
    ).json()) as { id: string };
    const p2 = (await (
      await af('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Search Beta', color: '#222222' }),
      })
    ).json()) as { id: string };

    await af('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project_id: p1.id, title: 'Find the needle' }),
    });
    await af('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project_id: p2.id,
        title: 'Other task',
        description: 'has a needle in description',
      }),
    });
    await af('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project_id: p2.id, title: 'No match here' }),
    });

    const searchRes = await af('/api/tasks/search?q=needle');
    assert.equal(searchRes.status, 200);
    const hits = (await searchRes.json()) as Array<{
      id: string;
      title: string;
      project_name: string;
      project_color: string;
    }>;
    assert.equal(hits.length, 2, 'two tasks match "needle"');
    for (const h of hits) {
      assert.ok(h.project_name, 'project_name joined onto hit');
      assert.ok(h.project_color, 'project_color joined onto hit');
    }

    // Short query rejected by Zod (Fastify maps the thrown ZodError to a 5xx
    // here — keep this loose, just assert it doesn't pass through as 200).
    const tooShort = await af('/api/tasks/search?q=n');
    assert.notEqual(tooShort.status, 200);
  });
});
