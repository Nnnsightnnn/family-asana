import { FastifyInstance } from 'fastify';
import { readFile, writeFile } from 'node:fs/promises';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db, now } from '../db.js';
import { requireUser } from '../auth.js';
import { planFromText, scopeTask } from '../ai.js';
import {
  ensureDir,
  extForMime,
  fileExists,
  isAllowedMime,
  MAX_STAGED_PHOTOS_PER_PLAN,
  safeUnlink,
  stagedPhotoPath,
  STAGING_TTL_MS,
} from '../photos.js';
import { dirname } from 'node:path';

const ScopeInput = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(20000).optional(),
  due_date: z.number().int().nullable().optional(),
  tier: z.enum(['fast', 'smart']).optional(),
});

const ScopeTaskParams = z.object({
  tier: z.enum(['fast', 'smart']).optional(),
});

const PlanInput = z.object({
  text: z.string().min(5).max(2000),
  // Accept empty string and coerce to null — callers from contexts without
  // a current project (My Tasks, Calendar) send "" rather than omitting it.
  project_id: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  tier: z.enum(['fast', 'smart']).optional(),
  staged_photo_ids: z.array(z.string().min(1)).max(MAX_STAGED_PHOTOS_PER_PLAN).optional(),
});

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

// Drop staged rows + files older than the TTL. Cheap to call on every upload;
// keeps cruft from accumulating without a separate cron.
function sweepStaging(userId: string): void {
  const cutoff = now() - STAGING_TTL_MS;
  const rows = db
    .prepare('SELECT id, filename FROM staged_photos WHERE user_id = ? AND created_at < ?')
    .all(userId, cutoff) as Array<{ id: string; filename: string }>;
  for (const r of rows) {
    safeUnlink(stagedPhotoPath(userId, r.filename));
    db.prepare('DELETE FROM staged_photos WHERE id = ?').run(r.id);
  }
}

export async function scopeRoutes(app: FastifyInstance) {
  // Live scoping for the new-task form (no task exists yet).
  app.post('/', async (req, reply) => {
    await requireUser(req, reply);
    const body = ScopeInput.parse(req.body);
    const result = await scopeTask(
      { title: body.title, description: body.description, due_date: body.due_date ?? null },
      { tier: body.tier }
    );
    return result;
  });

  // Free-form planning. Takes a paragraph, returns either a single task,
  // a task list, or a whole project + tasks. Does NOT create rows — that's
  // the client's job once the user confirms the preview.
  app.post('/plan', async (req, reply) => {
    const user = await requireUser(req, reply);
    const body = PlanInput.parse(req.body);

    // Load any attached staged photos (caller-owned only) and pass them
    // to the model as multimodal inputs.
    let images: { mime_type: string; data_base64: string }[] | undefined;
    if (body.staged_photo_ids && body.staged_photo_ids.length > 0) {
      const placeholders = body.staged_photo_ids.map(() => '?').join(',');
      const rows = db
        .prepare(
          `SELECT * FROM staged_photos WHERE user_id = ? AND id IN (${placeholders})`
        )
        .all(user.id, ...body.staged_photo_ids) as StagedPhotoRow[];

      images = [];
      for (const r of rows) {
        const path = stagedPhotoPath(user.id, r.filename);
        if (!fileExists(path)) continue;
        try {
          const buf = await readFile(path);
          images.push({ mime_type: r.mime_type, data_base64: buf.toString('base64') });
        } catch {
          // skip unreadable file
        }
      }
      if (images.length === 0) images = undefined;
    }

    const result = await planFromText(
      { text: body.text, project_id: body.project_id ?? null, images },
      { tier: body.tier }
    );
    if ('disabled' in result && result.disabled) {
      reply.code(200); // surface disabled-ness in the body, not as an HTTP error
    }
    return result;
  });

  // Scope an existing task and persist the result.
  app.post('/tasks/:id', async (req, reply) => {
    await requireUser(req, reply);
    const { id } = req.params as { id: string };
    const body = ScopeTaskParams.parse(req.body ?? {});

    const row = db
      .prepare('SELECT id, title, description, due_date FROM tasks WHERE id = ?')
      .get(id) as
      | { id: string; title: string; description: string; due_date: number | null }
      | undefined;
    if (!row) {
      reply.code(404);
      return { error: 'not_found' };
    }

    const result = await scopeTask(
      {
        title: row.title,
        description: row.description,
        due_date: row.due_date,
      },
      { tier: body.tier }
    );

    if (result.disabled) {
      reply.code(503);
      return { error: 'scoping_disabled', result };
    }

    const ts = now();
    db.prepare(
      `UPDATE tasks SET
         route = ?,
         mobilization_state = CASE WHEN mobilization_state = 'unscoped' THEN 'scoped' ELSE mobilization_state END,
         next_action = ?,
         service_url = ?,
         scoped_at = ?,
         scoped_model = ?,
         updated_at = ?
       WHERE id = ?`
    ).run(
      result.route === 'unset' ? 'unset' : result.route,
      result.next_action,
      result.service_url,
      ts,
      result.model,
      ts,
      id
    );

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    return { task: updated, scope: result };
  });

  // ── Staged photos for the Plan-with-AI flow ───────────────────────

  app.post('/staged-photos', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!req.isMultipart()) {
      reply.code(415);
      return { error: 'expected_multipart' };
    }
    sweepStaging(user.id);

    // Cap of MAX_STAGED_PHOTOS_PER_PLAN concurrent staged photos per user.
    // (Client uploads one file per request, but enforce a ceiling regardless.)
    const existing = db
      .prepare('SELECT COUNT(*) as c FROM staged_photos WHERE user_id = ?')
      .get(user.id) as { c: number };
    if (existing.c >= MAX_STAGED_PHOTOS_PER_PLAN) {
      reply.code(413);
      return { error: 'staged_cap_reached', limit: MAX_STAGED_PHOTOS_PER_PLAN };
    }

    let saved: StagedPhotoRow | null = null;
    for await (const part of req.parts()) {
      if (part.type !== 'file') continue;
      if (saved) {
        // Only accept one file per request — drain the rest cleanly.
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
      const id = nanoid(14);
      const filename = `${id}.${ext}`;
      const dest = stagedPhotoPath(user.id, filename);
      ensureDir(dirname(dest));
      await writeFile(dest, buf);

      const ts = now();
      db.prepare(
        `INSERT INTO staged_photos
         (id, user_id, filename, mime_type, size_bytes, width, height, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`
      ).run(id, user.id, filename, mime, buf.length, ts);
      saved = {
        id,
        user_id: user.id,
        filename,
        mime_type: mime,
        size_bytes: buf.length,
        width: null,
        height: null,
        created_at: ts,
      };
    }

    if (!saved) {
      reply.code(400);
      return { error: 'no_valid_file' };
    }
    return { id: saved.id, mime_type: saved.mime_type, size_bytes: saved.size_bytes };
  });

  app.delete('/staged-photos/:id', async (req, reply) => {
    const user = await requireUser(req, reply);
    const { id } = req.params as { id: string };
    const row = db
      .prepare('SELECT filename FROM staged_photos WHERE id = ? AND user_id = ?')
      .get(id, user.id) as { filename: string } | undefined;
    if (!row) {
      reply.code(404);
      return { error: 'not_found' };
    }
    db.prepare('DELETE FROM staged_photos WHERE id = ?').run(id);
    safeUnlink(stagedPhotoPath(user.id, row.filename));
    return { ok: true };
  });
}
