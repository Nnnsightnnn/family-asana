import { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db, now } from '../db.js';
import { requireUser } from '../auth.js';
import {
  ensureDir,
  extForMime,
  fileExists,
  isAllowedMime,
  MAX_PHOTOS_PER_PROJECT,
  moveFile,
  projectPhotoDir,
  projectPhotoPath,
  safeUnlink,
  stagedPhotoPath,
} from '../photos.js';

const ProjectInput = z.object({
  name: z.string().min(1).max(120),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  // Optional list of staged photos (uploaded via /api/scope/staged-photos)
  // to promote into the new project on creation. Only the caller's own
  // staged rows can be promoted.
  staged_photo_ids: z.array(z.string().min(1)).max(MAX_PHOTOS_PER_PROJECT).optional(),
});

type ProjectPhotoRow = {
  id: string;
  project_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  caption: string | null;
  uploaded_by: string;
  created_at: number;
};

type StagedPhotoRow = {
  id: string;
  user_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_at: number;
};

function countProjectPhotos(projectId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) as c FROM project_photos WHERE project_id = ?')
    .get(projectId) as { c: number };
  return row.c;
}

export async function projectRoutes(app: FastifyInstance) {
  app.get('/', async (req, reply) => {
    await requireUser(req, reply);
    return db
      .prepare(
        `SELECT p.*,
                (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.parent_id IS NULL) as task_count,
                (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.parent_id IS NULL AND t.status = 'done') as done_count
           FROM projects p
          WHERE p.archived_at IS NULL
          ORDER BY p.created_at DESC`
      )
      .all();
  });

  app.post('/', async (req, reply) => {
    const user = await requireUser(req, reply);
    const body = ProjectInput.parse(req.body);
    const id = nanoid(12);
    const ts = now();
    db.prepare(
      `INSERT INTO projects (id, name, color, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, body.name, body.color ?? '#4573D2', user.id, ts, ts);

    // Promote any staged photos the caller owns into this fresh project.
    // Silently skips IDs that don't exist or aren't owned by the caller —
    // a stale client retry shouldn't blow up project creation.
    if (body.staged_photo_ids && body.staged_photo_ids.length > 0) {
      const placeholders = body.staged_photo_ids.map(() => '?').join(',');
      const staged = db
        .prepare(
          `SELECT * FROM staged_photos WHERE user_id = ? AND id IN (${placeholders})`
        )
        .all(user.id, ...body.staged_photo_ids) as StagedPhotoRow[];

      const promote = db.transaction((rows: StagedPhotoRow[]) => {
        ensureDir(projectPhotoDir(id));
        for (const s of rows) {
          const from = stagedPhotoPath(user.id, s.filename);
          const to = projectPhotoPath(id, s.filename);
          try {
            moveFile(from, to);
          } catch {
            // If the file is missing (already swept or never landed), drop the row and skip.
            db.prepare('DELETE FROM staged_photos WHERE id = ?').run(s.id);
            continue;
          }
          db.prepare(
            `INSERT INTO project_photos
             (id, project_id, filename, mime_type, size_bytes, width, height, caption, uploaded_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
          ).run(s.id, id, s.filename, s.mime_type, s.size_bytes, s.width, s.height, user.id, ts);
          db.prepare('DELETE FROM staged_photos WHERE id = ?').run(s.id);
        }
      });
      promote(staged);
    }

    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  });

  app.get('/:id', async (req, reply) => {
    await requireUser(req, reply);
    const { id } = req.params as { id: string };
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!row) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return row;
  });

  app.patch('/:id', async (req, reply) => {
    await requireUser(req, reply);
    const { id } = req.params as { id: string };
    const body = ProjectInput.partial().parse(req.body);

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (body.name !== undefined) {
      sets.push('name = ?');
      vals.push(body.name);
    }
    if (body.color !== undefined) {
      sets.push('color = ?');
      vals.push(body.color);
    }
    if (sets.length === 0) {
      return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    }
    sets.push('updated_at = ?');
    vals.push(now(), id);
    db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  });

  app.delete('/:id', async (req, reply) => {
    await requireUser(req, reply);
    const { id } = req.params as { id: string };
    db.prepare('UPDATE projects SET archived_at = ? WHERE id = ?').run(now(), id);
    return { ok: true };
  });

  // ── Photos ────────────────────────────────────────────────────────

  app.get('/:id/photos', async (req, reply) => {
    await requireUser(req, reply);
    const { id } = req.params as { id: string };
    return db
      .prepare(
        `SELECT id, project_id, filename, mime_type, size_bytes, width, height, caption, uploaded_by, created_at
           FROM project_photos
          WHERE project_id = ?
          ORDER BY created_at DESC`
      )
      .all(id);
  });

  app.post('/:id/photos', async (req, reply) => {
    const user = await requireUser(req, reply);
    const { id } = req.params as { id: string };

    const projectExists = db
      .prepare('SELECT 1 FROM projects WHERE id = ?')
      .get(id) as { 1: number } | undefined;
    if (!projectExists) {
      reply.code(404);
      return { error: 'project_not_found' };
    }

    if (!req.isMultipart()) {
      reply.code(415);
      return { error: 'expected_multipart' };
    }

    const existingCount = countProjectPhotos(id);
    if (existingCount >= MAX_PHOTOS_PER_PROJECT) {
      reply.code(413);
      return { error: 'photo_cap_reached', limit: MAX_PHOTOS_PER_PROJECT };
    }

    const created: ProjectPhotoRow[] = [];
    let room = MAX_PHOTOS_PER_PROJECT - existingCount;

    for await (const part of req.parts()) {
      if (part.type !== 'file') continue;
      if (room <= 0) {
        // Drain the rest so the upload completes cleanly.
        await part.toBuffer().catch(() => undefined);
        continue;
      }
      const mime = part.mimetype || '';
      if (!isAllowedMime(mime)) {
        await part.toBuffer().catch(() => undefined);
        continue;
      }

      const buf = await part.toBuffer();
      const ext = extForMime(mime);
      const photoId = nanoid(14);
      const filename = `${photoId}.${ext}`;
      const dest = projectPhotoPath(id, filename);
      ensureDir(projectPhotoDir(id));
      await writeFile(dest, buf);

      const ts = now();
      db.prepare(
        `INSERT INTO project_photos
         (id, project_id, filename, mime_type, size_bytes, width, height, caption, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`
      ).run(photoId, id, filename, mime, buf.length, user.id, ts);

      const row = db
        .prepare('SELECT * FROM project_photos WHERE id = ?')
        .get(photoId) as ProjectPhotoRow;
      created.push(row);
      room -= 1;
    }

    if (created.length === 0) {
      reply.code(400);
      return { error: 'no_valid_files' };
    }
    return { photos: created };
  });

  app.delete('/:projectId/photos/:photoId', async (req, reply) => {
    await requireUser(req, reply);
    const { projectId, photoId } = req.params as { projectId: string; photoId: string };
    const row = db
      .prepare('SELECT * FROM project_photos WHERE id = ? AND project_id = ?')
      .get(photoId, projectId) as ProjectPhotoRow | undefined;
    if (!row) {
      reply.code(404);
      return { error: 'not_found' };
    }
    db.prepare('DELETE FROM project_photos WHERE id = ?').run(photoId);
    safeUnlink(projectPhotoPath(projectId, row.filename));
    return { ok: true };
  });

  // Auth-gated file stream. Filenames are content-addressed by nanoid so they
  // never change for a given photo — cache aggressively in the browser.
  app.get('/:projectId/photos/:photoId/file', async (req, reply) => {
    await requireUser(req, reply);
    const { projectId, photoId } = req.params as { projectId: string; photoId: string };
    const row = db
      .prepare('SELECT mime_type, filename FROM project_photos WHERE id = ? AND project_id = ?')
      .get(photoId, projectId) as
      | { mime_type: string; filename: string }
      | undefined;
    if (!row) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const path = projectPhotoPath(projectId, row.filename);
    if (!fileExists(path)) {
      reply.code(404);
      return { error: 'file_missing' };
    }
    reply.header('Content-Type', row.mime_type);
    reply.header('Cache-Control', 'private, max-age=31536000, immutable');
    return reply.send(createReadStream(path));
  });
}

