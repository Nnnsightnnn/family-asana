import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authedFetch, bootTestServer } from './helpers.js';

// A tiny but valid JPEG (1x1 pixel) — enough to satisfy the mime check.
// Source: well-known minimal JPEG bytes.
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AB//Z',
  'base64'
);

function jpegFormDataBody(bytes: Buffer, boundary: string, filename = 'p.jpg'): Buffer {
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: image/jpeg\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return Buffer.concat([head, bytes, tail]);
}

test('project photos: upload, list, get-file, delete', async (t) => {
  const server = await bootTestServer();
  t.after(() => server.close());

  const { fetch: af } = await authedFetch(server.base);

  // Create a project to hold photos.
  const projRes = await af('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Photo Test', color: '#4573D2' }),
  });
  assert.equal(projRes.status, 200);
  const project = (await projRes.json()) as { id: string };

  // Upload a photo (multipart).
  const boundary = '----faTestBoundary' + Math.random().toString(36).slice(2);
  const body = jpegFormDataBody(TINY_JPEG, boundary);
  const upRes = await af(`/api/projects/${project.id}/photos`, {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  assert.equal(upRes.status, 200, `upload should succeed, got ${upRes.status}`);
  const upJson = (await upRes.json()) as { photos: Array<{ id: string; mime_type: string; size_bytes: number }> };
  assert.equal(upJson.photos.length, 1);
  const photo = upJson.photos[0];
  assert.equal(photo.mime_type, 'image/jpeg');
  assert.ok(photo.size_bytes > 0);

  // List.
  const listRes = await af(`/api/projects/${project.id}/photos`);
  assert.equal(listRes.status, 200);
  const list = (await listRes.json()) as Array<{ id: string }>;
  assert.equal(list.length, 1);
  assert.equal(list[0].id, photo.id);

  // Get file — should return the bytes with the right content-type.
  const fileRes = await af(`/api/projects/${project.id}/photos/${photo.id}/file`);
  assert.equal(fileRes.status, 200);
  assert.equal(fileRes.headers.get('content-type'), 'image/jpeg');
  const buf = Buffer.from(await fileRes.arrayBuffer());
  assert.equal(buf.length, TINY_JPEG.length, 'served file matches uploaded bytes');

  // Delete.
  const delRes = await af(`/api/projects/${project.id}/photos/${photo.id}`, {
    method: 'DELETE',
  });
  assert.equal(delRes.status, 200);

  // List is now empty.
  const list2Res = await af(`/api/projects/${project.id}/photos`);
  const list2 = (await list2Res.json()) as unknown[];
  assert.equal(list2.length, 0);

  // GET file 404s after delete.
  const file404 = await af(`/api/projects/${project.id}/photos/${photo.id}/file`);
  assert.equal(file404.status, 404);
});

test('project photos: reject unsupported mime', async (t) => {
  const server = await bootTestServer();
  t.after(() => server.close());

  const { fetch: af } = await authedFetch(server.base);
  const projRes = await af('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Reject Test' }),
  });
  const project = (await projRes.json()) as { id: string };

  const boundary = '----faRejectBoundary' + Math.random().toString(36).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="evil.svg"\r\n` +
      `Content-Type: image/svg+xml\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, Buffer.from('<svg/>'), tail]);

  const upRes = await af(`/api/projects/${project.id}/photos`, {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  // SVGs are skipped silently — no valid files results in a 400.
  assert.equal(upRes.status, 400);
});

test('staged photos: upload, promote on project create, original is gone', async (t) => {
  const server = await bootTestServer();
  t.after(() => server.close());
  const { fetch: af } = await authedFetch(server.base);

  // Stage a photo via the AI flow endpoint.
  const boundary = '----faStagedBoundary' + Math.random().toString(36).slice(2);
  const body = jpegFormDataBody(TINY_JPEG, boundary, 'kitchen.jpg');
  const stageRes = await af('/api/scope/staged-photos', {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  assert.equal(stageRes.status, 200);
  const staged = (await stageRes.json()) as { id: string };
  assert.ok(staged.id);

  // Create a project with this staged photo id — server should promote it.
  const createRes = await af('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Staged Promote',
      color: '#4573D2',
      staged_photo_ids: [staged.id],
    }),
  });
  assert.equal(createRes.status, 200);
  const project = (await createRes.json()) as { id: string };

  // The promoted photo should show up under the project.
  const listRes = await af(`/api/projects/${project.id}/photos`);
  const list = (await listRes.json()) as Array<{ id: string; size_bytes: number }>;
  assert.equal(list.length, 1);
  assert.equal(list[0].id, staged.id, 'staged id is reused as the project_photo id');
  assert.ok(list[0].size_bytes > 0);

  // The staged-photo delete endpoint should now 404 — promotion deleted the row.
  const delStaged = await af(`/api/scope/staged-photos/${staged.id}`, {
    method: 'DELETE',
  });
  assert.equal(delStaged.status, 404);
});
