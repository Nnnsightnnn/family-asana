import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authedFetch, bootTestServer } from './helpers.js';

const DAY = 86_400_000;

type TaskRow = {
  id: string;
  title: string;
  status: string;
  due_date: number | null;
  recurrence: string | null;
  completed_at: number | null;
};

test('recurring tasks: complete materializes next instance', async (t) => {
  const server = await bootTestServer();
  t.after(() => server.close());

  const { fetch: af } = await authedFetch(server.base);

  // Project to hold the recurring task
  const proj = (await (
    await af('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Household' }),
    })
  ).json()) as { id: string };

  // Create a weekly task with a due date last week so the next instance is
  // deterministic relative to "now".
  const lastMonday = new Date();
  lastMonday.setHours(12, 0, 0, 0);
  // back up to most-recent Monday at noon, then go one more week back
  const dow = lastMonday.getDay();
  const daysSinceMonday = (dow + 6) % 7;
  lastMonday.setTime(lastMonday.getTime() - (daysSinceMonday + 7) * DAY);
  const dueLastWeek = lastMonday.getTime();

  await t.test('rejects recurrence without due_date', async () => {
    const res = await af('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project_id: proj.id,
        title: 'No due',
        recurrence: { kind: 'weekly' },
      }),
    });
    assert.equal(res.status, 400);
  });

  let weekly: TaskRow;
  await t.test('creates a weekly recurring task', async () => {
    const res = await af('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project_id: proj.id,
        title: 'Take out trash',
        due_date: dueLastWeek,
        recurrence: { kind: 'weekly' },
      }),
    });
    assert.equal(res.status, 200);
    weekly = (await res.json()) as TaskRow;
    assert.equal(weekly.title, 'Take out trash');
    assert.equal(weekly.recurrence, JSON.stringify({ kind: 'weekly' }));
    assert.equal(weekly.due_date, dueLastWeek);
  });

  await t.test('marking done materializes the next instance', async () => {
    const patchRes = await af(`/api/tasks/${weekly.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    assert.equal(patchRes.status, 200);
    const patched = (await patchRes.json()) as TaskRow;
    assert.equal(patched.status, 'done');
    assert.ok(patched.completed_at, 'completed_at set on done');

    const list = (await (
      await af(`/api/tasks?project_id=${proj.id}`)
    ).json()) as TaskRow[];

    // We should now see two tasks: the original (done) and a fresh todo with
    // the same title and a due date one week later than the original.
    const sameTitle = list.filter((row) => row.title === 'Take out trash');
    assert.equal(sameTitle.length, 2, 'next instance was inserted');
    const next = sameTitle.find((row) => row.id !== weekly.id);
    assert.ok(next, 'a different row exists alongside the completed one');
    assert.equal(next!.status, 'todo');
    assert.equal(next!.completed_at, null);
    assert.equal(
      next!.recurrence,
      JSON.stringify({ kind: 'weekly' }),
      'recurrence carries forward'
    );
    assert.ok(
      next!.due_date && next!.due_date > Date.now() - DAY,
      'next due is in the near future, not in the past'
    );
  });

  await t.test('completing a non-recurring task does NOT spawn anything', async () => {
    const oneShot = (await (
      await af('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          project_id: proj.id,
          title: 'Buy lightbulbs',
          due_date: dueLastWeek,
        }),
      })
    ).json()) as TaskRow;

    await af(`/api/tasks/${oneShot.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });

    const list = (await (
      await af(`/api/tasks?project_id=${proj.id}`)
    ).json()) as TaskRow[];
    const sameTitle = list.filter((row) => row.title === 'Buy lightbulbs');
    assert.equal(sameTitle.length, 1, 'no clone for one-shot tasks');
  });

  await t.test('clearing recurrence stops the chain', async () => {
    // Find the active "Take out trash" instance, clear its recurrence, complete it.
    const list = (await (
      await af(`/api/tasks?project_id=${proj.id}`)
    ).json()) as TaskRow[];
    const active = list.find(
      (row) => row.title === 'Take out trash' && row.status === 'todo'
    );
    assert.ok(active, 'an active recurring instance exists from earlier');

    await af(`/api/tasks/${active!.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recurrence: null }),
    });
    await af(`/api/tasks/${active!.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });

    const after = (await (
      await af(`/api/tasks?project_id=${proj.id}`)
    ).json()) as TaskRow[];
    const trashRows = after.filter((row) => row.title === 'Take out trash');
    // The chain so far: original (done) + materialized #1 (now done) — total 2.
    // No new instance should have appeared after clearing recurrence.
    assert.equal(trashRows.length, 2, 'no new instance after clearing recurrence');
    assert.ok(trashRows.every((row) => row.status === 'done'));
  });
});
