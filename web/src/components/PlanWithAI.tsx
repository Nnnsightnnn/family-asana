import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { api } from '../api';
import { isAcceptedImage, resizeForUpload } from '../photos';
import type { PlanResult, PlanTask, Project, User } from '../types';
import { Icon, ProjectDot, RouteChip, AVATAR_COLORS, SwatchRow } from './atoms';

type Props = {
  projects: Project[];
  users: User[];
  defaultProjectId: string;
  onClose: () => void;
  /** Called with the created task IDs so the parent can refresh queries. */
  onCreated: (info: { taskIds: string[]; projectId: string }) => void;
};

const PLAN_DEBOUNCE_MS = 600;
const MAX_PHOTOS = 4;

const EXAMPLES = [
  'Kitchen sink is leaking — needs a plumber by Saturday',
  'Vacuum living room, take out trash, water the plants',
  'Plan a small backyard birthday for Sam — May 26',
];

// One staged photo. We keep the resized Blob in memory so we can re-upload
// it on commit when the user picks an existing project (task / task_list
// shapes don't get the server-side promote path).
type StagedPhoto = {
  localId: string;
  status: 'uploading' | 'ready' | 'error';
  serverId?: string;
  previewUrl: string;
  blob?: Blob;
  error?: string;
};

export default function PlanWithAI({
  projects,
  users: _users,
  defaultProjectId,
  onClose,
  onCreated,
}: Props) {
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [planning, setPlanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<StagedPhoto[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selection state — which proposed tasks are checked in. Indexed by array
  // position; for kind='task' this is just a boolean flag.
  const [includeSet, setIncludeSet] = useState<Set<number>>(new Set());

  // Project-kind editable fields (user can override the AI's suggestion).
  const [projectName, setProjectName] = useState('');
  const [projectColor, setProjectColor] = useState<string>(AVATAR_COLORS[0]);

  // task_list kind needs a destination project.
  const [destProjectId, setDestProjectId] = useState<string>(defaultProjectId);

  const textRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastPlannedRef = useRef<string>('');

  useEffect(() => {
    textRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // On unmount, best-effort delete any staged photos still hanging around
  // and revoke local object URLs. The server has a 24h TTL safety net.
  // Reads `photos` via a ref so this effect doesn't have to re-attach on
  // every photo change.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => {
    return () => {
      for (const p of photosRef.current) {
        URL.revokeObjectURL(p.previewUrl);
        if (p.serverId) {
          api.deleteStagedPhoto(p.serverId).catch(() => undefined);
        }
      }
    };
  }, []);

  // Photos that finished uploading and have a server id. Used both for the
  // plan call (so the AI sees them) and for the commit promotion path.
  const stagedIds = photos
    .filter((p) => p.status === 'ready' && p.serverId)
    .map((p) => p.serverId!) as string[];
  const stagedKey = stagedIds.join(',');

  // Debounced planning.
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed.length < 5) {
      setPlan(null);
      setPlanning(false);
      return;
    }
    // Re-plan when text OR the set of attached photos changes. The key
    // includes stagedKey so adding/removing a photo (with the same text)
    // still triggers a fresh AI call.
    const planKey = `${trimmed}::${stagedKey}`;
    if (planKey === lastPlannedRef.current) return;

    const timer = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;
      setPlanning(true);
      setError(null);
      api
        .plan({
          text: trimmed,
          project_id: defaultProjectId,
          staged_photo_ids: stagedIds.length > 0 ? stagedIds : undefined,
        })
        .then((result) => {
          if (controller.signal.aborted) return;
          setPlan(result);
          lastPlannedRef.current = planKey;
          // initialize include-set + project fields based on the new plan
          if (!result.disabled) {
            if (result.kind === 'task') {
              setIncludeSet(new Set([0]));
            } else {
              setIncludeSet(new Set(result.tasks.map((_, i) => i)));
            }
            if (result.kind === 'project') {
              setProjectName(result.project.name);
              setProjectColor(result.project.color);
            }
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError((e as Error).message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setPlanning(false);
        });
    }, PLAN_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // stagedKey covers stagedIds (string join); intentionally NOT including
    // stagedIds itself to avoid an infinite-loop on its array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, defaultProjectId, stagedKey]);

  function toggleInclude(i: number) {
    setIncludeSet((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function addPhotos(files: FileList | File[]) {
    const list = Array.from(files);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setError(`Up to ${MAX_PHOTOS} photos per plan.`);
      return;
    }
    const slice = list.slice(0, room);
    for (const file of slice) {
      if (!isAcceptedImage(file)) {
        setError('Photos must be JPEG, PNG, or WebP.');
        continue;
      }
      const localId = Math.random().toString(36).slice(2);
      let previewUrl: string;
      let blob: Blob;
      try {
        const resized = await resizeForUpload(file);
        previewUrl = resized.previewUrl;
        blob = resized.blob;
      } catch (e) {
        setError((e as Error).message);
        continue;
      }
      setPhotos((prev) => [
        ...prev,
        { localId, status: 'uploading', previewUrl, blob },
      ]);
      api
        .uploadStagedPhoto(blob)
        .then(({ id }) => {
          setPhotos((prev) =>
            prev.map((p) =>
              p.localId === localId ? { ...p, status: 'ready', serverId: id } : p
            )
          );
        })
        .catch((e) => {
          setPhotos((prev) =>
            prev.map((p) =>
              p.localId === localId
                ? { ...p, status: 'error', error: (e as Error).message }
                : p
            )
          );
        });
    }
  }

  function removePhoto(localId: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.localId === localId);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        if (target.serverId) {
          // best-effort cleanup on the server
          api.deleteStagedPhoto(target.serverId).catch(() => undefined);
        }
      }
      return prev.filter((p) => p.localId !== localId);
    });
  }

  async function submit() {
    if (!plan || plan.disabled) return;
    setSubmitting(true);
    setError(null);

    // Photos still uploading at commit time — wait briefly, then proceed
    // without them rather than block forever. (Server has a 24h TTL sweep.)
    const readyPhotoIds = photos
      .filter((p) => p.status === 'ready' && p.serverId)
      .map((p) => p.serverId!) as string[];
    const photoBlobs = photos
      .filter((p) => p.status === 'ready' && p.blob)
      .map((p) => p.blob!) as Blob[];

    try {
      if (plan.kind === 'task') {
        if (!includeSet.has(0)) {
          onClose();
          return;
        }
        const t = plan.task;
        const created = await api.createTask({
          project_id: destProjectId,
          title: t.title,
          route: t.route,
          next_action: t.next_action,
          service_url: t.service_url,
          scoped_model: plan.model || null,
        });
        await attachPhotosToProject(destProjectId, photoBlobs, readyPhotoIds);
        onCreated({ taskIds: [created.id], projectId: destProjectId });
      } else if (plan.kind === 'task_list') {
        const picks = plan.tasks
          .map((t, i) => ({ t, i }))
          .filter(({ i }) => includeSet.has(i));
        const created = await Promise.all(
          picks.map(({ t }) =>
            api.createTask({
              project_id: destProjectId,
              title: t.title,
              route: t.route,
              next_action: t.next_action,
              service_url: t.service_url,
              scoped_model: plan.model || null,
            })
          )
        );
        await attachPhotosToProject(destProjectId, photoBlobs, readyPhotoIds);
        onCreated({ taskIds: created.map((c) => c.id), projectId: destProjectId });
      } else {
        // kind === 'project' — server-side promote of staged photos.
        const proj = await api.createProject({
          name: projectName.trim() || plan.project.name,
          color: projectColor,
          staged_photo_ids: readyPhotoIds.length > 0 ? readyPhotoIds : undefined,
        });
        const picks = plan.tasks
          .map((t, i) => ({ t, i }))
          .filter(({ i }) => includeSet.has(i));
        const created = await Promise.all(
          picks.map(({ t }) =>
            api.createTask({
              project_id: proj.id,
              title: t.title,
              route: t.route,
              next_action: t.next_action,
              service_url: t.service_url,
              scoped_model: plan.model || null,
            })
          )
        );
        onCreated({ taskIds: created.map((c) => c.id), projectId: proj.id });
      }
      // Photos are persisted; clear local state so onClose doesn't try to delete
      // staged rows the server already promoted/consumed.
      setPhotos([]);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  // For the task / task_list shapes, the destination project already exists.
  // The simplest path is to re-upload the Blobs we already have in memory
  // rather than build a "promote staged-to-existing-project" server path.
  async function attachPhotosToProject(
    projectId: string,
    blobs: Blob[],
    stagedIds: string[]
  ) {
    if (blobs.length === 0) return;
    await Promise.all(blobs.map((b) => api.uploadProjectPhoto(projectId, b)));
    // Now that the photos are on the project, clean up staging.
    await Promise.all(
      stagedIds.map((id) => api.deleteStagedPhoto(id).catch(() => undefined))
    );
  }

  const disabled = !!plan?.disabled;
  const ready = !!plan && !disabled && !planning && includedCount(plan, includeSet) > 0;
  const summary = plan && !plan.disabled ? planSummary(plan, includeSet) : null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-stoop-ink/30 px-4 pt-[10vh] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[600px] rounded-card border border-stoop-hairline bg-stoop-panel shadow-soft"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Plan with AI"
      >
        <div className="flex items-center gap-2.5 border-b border-stoop-hairline px-5 py-3.5">
          <span className="display-italic text-stoop-accent-deep" aria-hidden>
            ✦
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
            Plan with AI
          </span>
          {planning && (
            <span className="text-[11px] text-stoop-muted">thinking…</span>
          )}
          <span className="flex-1" />
          <button
            type="button"
            className="rounded p-1.5 text-stoop-muted hover:bg-stoop-hairline"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon.X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto px-5 py-4">
          <p className="m-0 text-[13px] leading-relaxed text-stoop-muted">
            Type a single task, a quick list, or a whole project — the AI will
            figure out the shape and route each task.
          </p>

          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Kitchen renovation — new cabinets, find a tile installer, paint, replace flooring"
            rows={4}
            className="mt-3 w-full resize-y rounded-card border border-stoop-hairline bg-stoop-panel-warm/40 p-3 text-[14px] leading-relaxed text-stoop-ink outline-none placeholder:text-stoop-muted focus:border-stoop-hairline-2"
          />

          {/* Photo strip — multimodal input for the AI + persisted on the
              destination project after commit. */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  void addPhotos(e.target.files);
                }
                e.target.value = '';
              }}
            />
            {photos.map((p) => (
              <div
                key={p.localId}
                className="group relative h-14 w-14 overflow-hidden rounded-md border border-stoop-hairline bg-stoop-canvas"
              >
                <img
                  src={p.previewUrl}
                  alt=""
                  className={clsx(
                    'h-full w-full object-cover',
                    p.status !== 'ready' && 'opacity-60'
                  )}
                />
                {p.status === 'uploading' && (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] text-stoop-muted">
                    …
                  </span>
                )}
                {p.status === 'error' && (
                  <span className="absolute inset-0 flex items-center justify-center bg-stoop-canvas/80 text-[10px] text-stoop-accent-deep">
                    err
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(p.localId)}
                  aria-label="Remove photo"
                  className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-stoop-ink/70 text-[10px] leading-none text-white opacity-0 transition-opacity hover:bg-stoop-ink group-hover:opacity-100"
                >
                  ×
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-stoop-hairline-2 text-[11px] text-stoop-muted hover:border-stoop-accent hover:text-stoop-ink"
              >
                <span className="flex flex-col items-center leading-tight">
                  <Icon.Plus className="h-3 w-3" />
                  Photo
                </span>
              </button>
            )}
            {photos.length === 0 && (
              <span className="text-[11.5px] text-stoop-muted">
                Add photos of the area (optional) — the AI will use them.
              </span>
            )}
          </div>

          {text.trim().length === 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.08em] text-stoop-muted">
                Try
              </span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setText(ex);
                    textRef.current?.focus();
                  }}
                  className="rounded-full border border-stoop-hairline bg-stoop-panel-warm/60 px-2.5 py-1 text-[12px] text-stoop-muted hover:bg-stoop-panel-warm hover:text-stoop-ink"
                >
                  {ex.length > 38 ? ex.slice(0, 38) + '…' : ex}
                </button>
              ))}
            </div>
          )}

          {/* Preview */}
          {disabled && (
            <div className="mt-4 rounded-card border border-stoop-hairline bg-stoop-canvas px-4 py-3 text-[13px] text-stoop-ink-soft">
              {disabledMessage(plan)}
            </div>
          )}

          {plan && !plan.disabled && (
            <div className="mt-5">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
                <span>Preview</span>
                <span className="lowercase tracking-normal text-stoop-muted">
                  · {summary}
                </span>
              </div>

              {plan.kind === 'task' && (
                <SingleTaskPreview
                  task={plan.task}
                  destProjectId={destProjectId}
                  projects={projects}
                  onProjectChange={setDestProjectId}
                  included={includeSet.has(0)}
                  onToggle={() => toggleInclude(0)}
                />
              )}

              {plan.kind === 'task_list' && (
                <TaskListPreview
                  tasks={plan.tasks}
                  projects={projects}
                  destProjectId={destProjectId}
                  onProjectChange={setDestProjectId}
                  includeSet={includeSet}
                  onToggle={toggleInclude}
                />
              )}

              {plan.kind === 'project' && (
                <ProjectPreview
                  tasks={plan.tasks}
                  projectName={projectName}
                  onProjectName={setProjectName}
                  projectColor={projectColor}
                  onProjectColor={setProjectColor}
                  includeSet={includeSet}
                  onToggle={toggleInclude}
                />
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm" style={{ color: '#B36447' }}>{error}</p>}
        </div>

        <div className="flex items-center gap-2 border-t border-stoop-hairline px-4 py-3">
          <span className="text-[12px] text-stoop-muted">
            Esc to cancel · 5+ chars to plan
          </span>
          <span className="flex-1" />
          <button
            type="button"
            className="btn-ghost text-[12.5px]"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary text-[12.5px]"
            onClick={submit}
            disabled={!ready || submitting}
          >
            {submitting ? 'Creating…' : ctaLabel(plan, includeSet)}
          </button>
        </div>
      </div>
    </div>
  );
}

function disabledMessage(plan: PlanResult | null): string {
  if (!plan || !plan.disabled) return '';
  switch (plan.disabled_reason) {
    case 'no_key':
      return 'AI planning isn\'t configured on this server. Use the regular "+ Add task" button to create tasks without AI.';
    case 'api_error':
      return 'The AI service is unreachable right now. Try again in a moment, or use the regular "+ Add task" button.';
    case 'empty_response':
    case 'parse_error':
      return 'The AI returned a response we couldn\'t parse. Try rephrasing in a bit more detail, or use the regular "+ Add task" button.';
    default:
      return 'AI is unavailable right now. Use the regular "+ Add task" button.';
  }
}

function includedCount(plan: PlanResult, set: Set<number>): number {
  if (!plan || plan.disabled) return 0;
  if (plan.kind === 'task') return set.has(0) ? 1 : 0;
  return plan.tasks.filter((_, i) => set.has(i)).length;
}

function planSummary(plan: Exclude<PlanResult, { disabled: true }>, set: Set<number>): string {
  if (plan.kind === 'task') return 'a single task';
  const n = plan.tasks.filter((_, i) => set.has(i)).length;
  if (plan.kind === 'project') return `a new project + ${n} task${n === 1 ? '' : 's'}`;
  return `${n} task${n === 1 ? '' : 's'} in one project`;
}

function ctaLabel(plan: PlanResult | null, set: Set<number>): string {
  if (!plan || plan.disabled) return 'Create';
  if (plan.kind === 'task') return 'Create task';
  const n = plan.tasks.filter((_, i) => set.has(i)).length;
  if (plan.kind === 'project') return `Create project + ${n}`;
  return `Create ${n} task${n === 1 ? '' : 's'}`;
}

// ── Preview sub-views ───────────────────────────────────────────────

function TaskRow({
  task,
  included,
  onToggle,
}: {
  task: PlanTask;
  included: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex items-start gap-3 py-2">
      <input
        type="checkbox"
        className="mt-1.5 h-3.5 w-3.5 accent-stoop-accent"
        checked={included}
        onChange={onToggle}
        aria-label={`Include "${task.title}"`}
      />
      <div className="min-w-0 flex-1">
        <div className={clsx('flex items-center gap-2', !included && 'opacity-50')}>
          <RouteChip route={task.route} />
          <span className="truncate text-[14px] text-stoop-ink">{task.title}</span>
        </div>
        {task.next_action && (
          <p className={clsx('mt-1 text-[12.5px] leading-snug text-stoop-muted', !included && 'opacity-50')}>
            {task.next_action}
          </p>
        )}
        {task.service_url && included && (
          <a
            href={task.service_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-[12px] text-stoop-muted underline-offset-2 hover:text-stoop-ink hover:underline"
          >
            {hostnameOf(task.service_url)} ↗
          </a>
        )}
      </div>
    </li>
  );
}

function SingleTaskPreview({
  task,
  destProjectId,
  projects,
  onProjectChange,
  included,
  onToggle,
}: {
  task: PlanTask & { confidence: 'low' | 'medium' | 'high'; research_prompt?: string | null };
  destProjectId: string;
  projects: Project[];
  onProjectChange: (id: string) => void;
  included: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-card border border-stoop-hairline bg-stoop-panel-warm/40 px-3.5 py-2.5">
      <ul className="m-0 list-none p-0">
        <TaskRow task={task} included={included} onToggle={onToggle} />
      </ul>
      <ProjectPicker
        projects={projects}
        value={destProjectId}
        onChange={onProjectChange}
        label="Save in"
      />
    </div>
  );
}

function TaskListPreview({
  tasks,
  projects,
  destProjectId,
  onProjectChange,
  includeSet,
  onToggle,
}: {
  tasks: PlanTask[];
  projects: Project[];
  destProjectId: string;
  onProjectChange: (id: string) => void;
  includeSet: Set<number>;
  onToggle: (i: number) => void;
}) {
  return (
    <div className="rounded-card border border-stoop-hairline bg-stoop-panel-warm/40 px-3.5 py-2.5">
      <ul className="m-0 list-none divide-y divide-stoop-hairline p-0">
        {tasks.map((t, i) => (
          <TaskRow
            key={i}
            task={t}
            included={includeSet.has(i)}
            onToggle={() => onToggle(i)}
          />
        ))}
      </ul>
      <ProjectPicker
        projects={projects}
        value={destProjectId}
        onChange={onProjectChange}
        label="Save all in"
      />
    </div>
  );
}

function ProjectPreview({
  tasks,
  projectName,
  onProjectName,
  projectColor,
  onProjectColor,
  includeSet,
  onToggle,
}: {
  tasks: PlanTask[];
  projectName: string;
  onProjectName: (n: string) => void;
  projectColor: string;
  onProjectColor: (c: string) => void;
  includeSet: Set<number>;
  onToggle: (i: number) => void;
}) {
  return (
    <div className="rounded-card border border-stoop-hairline bg-stoop-panel-warm/40 px-3.5 py-3">
      <div className="mb-2 flex items-center gap-2.5">
        <span
          className="inline-block shrink-0 rounded"
          style={{ width: 12, height: 12, background: projectColor }}
        />
        <input
          type="text"
          value={projectName}
          onChange={(e) => onProjectName(e.target.value)}
          className="flex-1 bg-transparent text-[15px] font-medium outline-none"
          placeholder="Project name"
        />
      </div>
      <SwatchRow value={projectColor} onChange={onProjectColor} colors={AVATAR_COLORS} />
      <div className="mt-3 border-t border-stoop-hairline pt-2">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
          Initial tasks
        </div>
        <ul className="m-0 list-none divide-y divide-stoop-hairline p-0">
          {tasks.map((t, i) => (
            <TaskRow
              key={i}
              task={t}
              included={includeSet.has(i)}
              onToggle={() => onToggle(i)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function ProjectPicker({
  projects,
  value,
  onChange,
  label,
}: {
  projects: Project[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div className="mt-3 flex items-center gap-2 border-t border-stoop-hairline pt-2 text-[12.5px]">
      <span className="text-stoop-muted">{label}</span>
      {projects.find((p) => p.id === value) && (
        <ProjectDot project={projects.find((p) => p.id === value)!} size={9} />
      )}
      <select
        className="flex-1 bg-transparent text-[12.5px] outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}
