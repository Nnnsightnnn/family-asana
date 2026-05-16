import { mkdirSync, rmSync, renameSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// Same root used by the SQLite file — keeps the "everything on disk" story
// in a single directory that the existing backup story already covers
// (with the offsite-push extension flagged in the plan).
const DATA_ROOT = resolve(process.env.DB_PATH ? dirname(process.env.DB_PATH) : join(process.cwd(), 'data'));

export const UPLOAD_ROOT = join(DATA_ROOT, 'uploads');
const PROJECT_ROOT = join(UPLOAD_ROOT, 'project');
const STAGING_ROOT = join(UPLOAD_ROOT, 'staging');

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_PHOTOS_PER_REQUEST = 8;
export const MAX_PHOTOS_PER_PROJECT = 8;
export const MAX_STAGED_PHOTOS_PER_PLAN = 4;
export const STAGING_TTL_MS = 24 * 60 * 60 * 1000;

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function isAllowedMime(mime: string): boolean {
  return mime in ALLOWED_MIME;
}

export function extForMime(mime: string): string {
  const ext = ALLOWED_MIME[mime];
  if (!ext) throw new Error(`unsupported mime: ${mime}`);
  return ext;
}

export function projectPhotoPath(projectId: string, filename: string): string {
  return join(PROJECT_ROOT, projectId, filename);
}

export function projectPhotoDir(projectId: string): string {
  return join(PROJECT_ROOT, projectId);
}

export function stagedPhotoPath(userId: string, filename: string): string {
  return join(STAGING_ROOT, userId, filename);
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function moveFile(from: string, to: string): void {
  ensureDir(dirname(to));
  renameSync(from, to);
}

export function safeUnlink(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch {
    // best-effort
  }
}

export function fileSize(path: string): number {
  return statSync(path).size;
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}
