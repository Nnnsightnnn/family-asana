import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { api, type TaskWrite } from '../api';
import { isAcceptedImage, resizeForUpload } from '../photos';
import type { ProjectPhoto, ScopeDisabledReason, Task, User } from '../types';
import { parseRecurrence } from '../types';
import { Icon } from './atoms';
import ListView from './ListView';
import BoardView from './BoardView';
import TaskDetail from './TaskDetail';
import ErrorBoundary from './ErrorBoundary';
import QuickAddTask from './QuickAddTask';

type Props = { projectId: string; users: User[] };
type ViewMode = 'list' | 'board';

export default function ProjectView({ projectId, users }: Props) {
  const qc = useQueryClient();
  const [view, setView] = useState<ViewMode>('list');
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [prefillTitle, setPrefillTitle] = useState<string | undefined>(undefined);
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('task');

  function openQuickAdd(title?: string) {
    setPrefillTitle(title);
    setQuickAddOpen(true);
  }
  function closeQuickAdd() {
    setQuickAddOpen(false);
    setPrefillTitle(undefined);
  }

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: api.projects,
  });

  const project = projects.find((p) => p.id === projectId) ?? null;

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => api.tasks({ project_id: projectId }),
  });

  const createTask = useMutation({
    mutationFn: (input: TaskWrite & { project_id: string; title: string }) =>
      api.createTask(input),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['tasks', created.project_id] });
      qc.invalidateQueries({ queryKey: ['tasks', 'all'] });
    },
  });

  const updateTask = useMutation({
    mutationFn: ({ id, data }: { id: string; data: TaskWrite }) =>
      api.updateTask(id, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: ['tasks', projectId] });
      const previous = qc.getQueryData<Task[]>(['tasks', projectId]);
      if (previous) {
        qc.setQueryData<Task[]>(
          ['tasks', projectId],
          previous.map((t) => {
            if (t.id !== id) return t;
            // recurrence is parsed-rule on the wire but stringified-JSON on the
            // cached row, so re-encode it to keep the cache consistent during
            // the optimistic window.
            const { recurrence, ...rest } = data;
            const merged = { ...t, ...rest } as Task;
            if ('recurrence' in data) {
              merged.recurrence = recurrence ? JSON.stringify(recurrence) : null;
            }
            return merged;
          })
        );
      }
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      console.error('[updateTask] failed, rolling back', err);
      if (ctx?.previous) {
        qc.setQueryData(['tasks', projectId], ctx.previous);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.delete('task');
        return next;
      });
    },
  });

  async function scopeTaskOnServer(
    id: string,
    tier?: 'fast' | 'smart'
  ): Promise<{ disabled: boolean; disabled_reason?: ScopeDisabledReason }> {
    const result = await api.scopeTask(id, tier);
    if (!result.disabled && result.task) {
      // Patch the cache so the drawer updates without a network round-trip.
      qc.setQueryData<Task[]>(['tasks', projectId], (prev) =>
        (prev ?? []).map((t) => (t.id === id ? result.task! : t))
      );
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
    }
    return { disabled: result.disabled, disabled_reason: result.scope.disabled_reason };
  }

  function select(id: string | null) {
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (id) next.set('task', id);
      else next.delete('task');
      return next;
    });
  }

  // Clear stale selection when switching projects
  useEffect(() => {
    if (selectedId && !tasks.find((t) => t.id === selectedId)) select(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, tasks]);

  // Close the task drawer when the global Escape shortcut fires
  useEffect(() => {
    function onClose() {
      if (selectedId) select(null);
    }
    window.addEventListener('fa:close-drawer', onClose);
    return () => window.removeEventListener('fa:close-drawer', onClose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  if (!project)
    return (
      <div className="paper flex h-full items-center justify-center text-stoop-muted">
        Loading…
      </div>
    );

  const selected = selectedId
    ? tasks.find((t) => t.id === selectedId) ?? null
    : null;

  const done = tasks.filter((t) => t.status === 'done').length;

  return (
    <div className="paper flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <ProjectHeader
          project={project}
          view={view}
          onView={setView}
          done={done}
          total={tasks.length}
          memberCount={users.length}
          onAdd={() => openQuickAdd()}
        />
        <ProjectPhotoStrip projectId={projectId} />
        <div className="min-h-0 flex-1 overflow-auto">
          {view === 'list' ? (
            <ListView
              tasks={tasks}
              users={users}
              onStartAdd={(title) => openQuickAdd(title)}
              onUpdate={(id, data) => updateTask.mutate({ id, data })}
              onSelect={select}
              selectedId={selectedId}
            />
          ) : (
            <BoardView
              tasks={tasks}
              users={users}
              project={project}
              onAdd={(title) =>
                createTask.mutate({ project_id: projectId, title })
              }
              onUpdate={(id, data) => updateTask.mutate({ id, data })}
              onSelect={select}
            />
          )}
        </div>
      </div>

      {selected && (
        <ErrorBoundary
          key={selected.id}
          fallback={
            <aside className="flex w-full max-w-[460px] shrink-0 flex-col items-start gap-3 border-l border-stoop-hairline bg-stoop-panel p-6 text-stoop-ink shadow-drawer">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
                Task
              </div>
              <p className="text-[14px] text-stoop-ink-soft">
                Couldn't render this task — try another, or refresh.
              </p>
              <button
                type="button"
                className="btn-outline text-[13px]"
                onClick={() => select(null)}
              >
                Close
              </button>
            </aside>
          }
        >
          <TaskDetail
            task={selected}
            project={project}
            projects={projects}
            users={users}
            onClose={() => select(null)}
            onUpdate={(data) => updateTask.mutate({ id: selected.id, data })}
            onDelete={() => deleteTask.mutate(selected.id)}
            onDuplicate={() =>
              createTask.mutate({
                project_id: selected.project_id,
                title: `Copy of ${selected.title}`,
                description: selected.description,
                status: selected.status,
                assignee_id: selected.assignee_id,
                due_date: selected.due_date,
                recurrence: parseRecurrence(selected.recurrence),
                route: selected.route,
                next_action: selected.next_action,
                service_url: selected.service_url,
                scoped_model: selected.scoped_model,
              })
            }
            onScope={(tier) => scopeTaskOnServer(selected.id, tier)}
          />
        </ErrorBoundary>
      )}

      {quickAddOpen && (
        <QuickAddTask
          projects={projects.length ? projects : [project]}
          users={users}
          defaults={{ project_id: projectId, title: prefillTitle }}
          onClose={closeQuickAdd}
          onCreate={(input) => createTask.mutate(input)}
        />
      )}
    </div>
  );
}

function ProjectHeader({
  project,
  view,
  onView,
  done,
  total,
  memberCount,
  onAdd,
}: {
  project: { id: string; name: string; color: string };
  view: ViewMode;
  onView: (v: ViewMode) => void;
  done: number;
  total: number;
  memberCount: number;
  onAdd: () => void;
}) {
  return (
    <header className="border-b border-stoop-hairline bg-stoop-canvas px-5 pb-4 pt-5 md:px-10 md:pt-6">
      <div className="flex items-center gap-2.5 text-[12.5px] text-stoop-muted">
        <Icon.Home className="h-3 w-3" />
        <Link to="/my-tasks" className="hover:underline">
          Projects
        </Link>
        <Icon.Chevron className="h-[11px] w-[11px]" />
        <span className="text-stoop-ink-soft">{project.name}</span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-end gap-3 md:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="mb-1.5 h-3.5 w-3.5 rounded shrink-0"
            style={{ background: project.color }}
          />
          <h1 className="display m-0 truncate text-[26px] leading-[1.05] md:text-[30px]">
            {project.name}
          </h1>
        </div>
        <span className="pb-2 text-[13px] text-stoop-muted">
          {done} of {total} done · {memberCount} of us on this
        </span>
        <span className="flex-1" />
        <div className="flex items-center gap-1 rounded-[10px] bg-stoop-panel-warm p-[3px]">
          <ViewToggle
            icon={<Icon.List className="h-3.5 w-3.5" />}
            label="List"
            active={view === 'list'}
            onClick={() => onView('list')}
          />
          <ViewToggle
            icon={<Icon.Board className="h-3.5 w-3.5" />}
            label="Board"
            active={view === 'board'}
            onClick={() => onView('board')}
          />
        </div>
        <button className="btn-outline text-[13px]" type="button">
          <Icon.Filter className="h-3 w-3" /> Filter
        </button>
        <button
          className="btn-primary text-[13px]"
          type="button"
          onClick={onAdd}
        >
          <Icon.Plus className="h-3 w-3" /> Add task
        </button>
      </div>
    </header>
  );
}

function ProjectPhotoStrip({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: photos = [] } = useQuery({
    queryKey: ['project-photos', projectId],
    queryFn: () => api.listProjectPhotos(projectId),
  });

  async function onFiles(files: FileList | File[]) {
    setErr(null);
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (!isAcceptedImage(file)) {
          setErr('JPEG, PNG, or WebP only.');
          continue;
        }
        const { blob } = await resizeForUpload(file);
        await api.uploadProjectPhoto(projectId, blob);
      }
      qc.invalidateQueries({ queryKey: ['project-photos', projectId] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(photo: ProjectPhoto) {
    if (!window.confirm('Delete this photo?')) return;
    try {
      await api.deleteProjectPhoto(projectId, photo.id);
      qc.invalidateQueries({ queryKey: ['project-photos', projectId] });
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (photos.length === 0 && !busy && !err) {
    // Compact empty state — no full strip, just a small "Add photos" button.
    return (
      <div className="border-b border-stoop-hairline bg-stoop-canvas px-5 py-2 md:px-10">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              void onFiles(e.target.files);
            }
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 text-[12.5px] text-stoop-muted hover:text-stoop-ink"
        >
          <Icon.Plus className="h-3 w-3" /> Add photos of this area
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-stoop-hairline bg-stoop-canvas px-5 py-3 md:px-10">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void onFiles(e.target.files);
          }
          e.target.value = '';
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        {photos.map((p) => (
          <div
            key={p.id}
            className="group relative h-16 w-16 overflow-hidden rounded-md border border-stoop-hairline bg-stoop-panel"
          >
            <a
              href={api.projectPhotoUrl(projectId, p.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="block h-full w-full"
            >
              <img
                src={api.projectPhotoUrl(projectId, p.id)}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </a>
            <button
              type="button"
              onClick={() => onDelete(p)}
              aria-label="Delete photo"
              className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-stoop-ink/70 text-[11px] leading-none text-white opacity-0 transition-opacity hover:bg-stoop-ink group-hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-stoop-hairline-2 text-[11px] text-stoop-muted hover:border-stoop-accent hover:text-stoop-ink disabled:opacity-50"
        >
          <span className="flex flex-col items-center leading-tight">
            <Icon.Plus className="h-3 w-3" />
            {busy ? '…' : 'Photo'}
          </span>
        </button>
      </div>
      {err && (
        <p className="mt-2 text-[12px]" style={{ color: '#B36447' }}>
          {err}
        </p>
      )}
    </div>
  );
}

function ViewToggle({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors',
        active
          ? 'bg-stoop-panel font-medium shadow-[0_0_0_1px_theme(colors.stoop.hairline)] text-stoop-ink'
          : 'text-stoop-muted hover:text-stoop-ink'
      )}
    >
      {icon}
      {label}
    </button>
  );
}
