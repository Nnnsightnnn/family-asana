import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { Project, TaskStatus, User } from '../types';
import { Icon, ProjectDot, statusLabel } from './atoms';

type Defaults = {
  project_id?: string;
  due_date?: number | null;
  status?: TaskStatus;
  assignee_id?: string | null;
};

type Input = {
  project_id: string;
  title: string;
  due_date: number | null;
  assignee_id: string | null;
  status: TaskStatus;
};

type Props = {
  projects: Project[];
  users: User[];
  defaults?: Defaults;
  onClose: () => void;
  onCreate: (input: Input) => void;
};

const STATUSES: TaskStatus[] = ['todo', 'doing', 'blocked', 'done'];

function tsToDateInput(ts: number | null | undefined): string {
  if (!ts) return '';
  return new Date(ts).toISOString().slice(0, 10);
}

// Noon-local to dodge TZ drift, matching TaskDetail.tsx's pattern.
function dateInputToTs(value: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

export default function QuickAddTask({
  projects,
  users,
  defaults,
  onClose,
  onCreate,
}: Props) {
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState(
    defaults?.project_id ?? projects[0]?.id ?? ''
  );
  const [dueValue, setDueValue] = useState(tsToDateInput(defaults?.due_date));
  const [assigneeId, setAssigneeId] = useState<string>(defaults?.assignee_id ?? '');
  const [status, setStatus] = useState<TaskStatus>(defaults?.status ?? 'todo');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function submit() {
    const v = title.trim();
    if (!v || !projectId) return;
    onCreate({
      project_id: projectId,
      title: v,
      due_date: dateInputToTs(dueValue),
      assignee_id: assigneeId || null,
      status,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-stoop-ink/30 px-4 pt-[14vh] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-card border border-stoop-hairline bg-stoop-panel shadow-soft"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Add task"
      >
        <div className="flex items-center gap-2.5 border-b border-stoop-hairline px-5 py-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
            New task
          </span>
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

        <div className="px-5 py-4">
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="What needs doing?"
            className="display w-full bg-transparent text-[20px] leading-[1.25] outline-none placeholder:text-stoop-muted"
          />

          <div className="mt-4 grid grid-cols-[90px_1fr] gap-x-4 gap-y-3 text-[13.5px]">
            <span className="self-center text-stoop-muted">Project</span>
            <div className="flex items-center gap-2">
              {projects.find((p) => p.id === projectId) && (
                <ProjectDot
                  project={projects.find((p) => p.id === projectId)!}
                  size={9}
                />
              )}
              <select
                className="flex-1 bg-transparent text-[13.5px] outline-none"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                {projects.length === 0 && (
                  <option value="">No projects yet</option>
                )}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <span className="self-center text-stoop-muted">Due</span>
            <div className="flex items-center gap-2">
              <Icon.Calendar className="h-3.5 w-3.5 text-stoop-muted" />
              <input
                type="date"
                className="bg-transparent text-[13px] outline-none tabular-nums"
                value={dueValue}
                onChange={(e) => setDueValue(e.target.value)}
              />
              {dueValue && (
                <button
                  type="button"
                  className="text-[12px] text-stoop-muted hover:underline"
                  onClick={() => setDueValue('')}
                >
                  clear
                </button>
              )}
            </div>

            <span className="self-center text-stoop-muted">Who</span>
            <select
              className="bg-transparent text-[13.5px] outline-none"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>

            <span className="self-center text-stoop-muted">Status</span>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => {
                const active = status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={clsx(
                      'chip cursor-pointer border transition-colors',
                      active
                        ? 'border-stoop-hairline-2 bg-stoop-panel-warm text-stoop-ink'
                        : 'border-stoop-hairline text-stoop-muted hover:bg-stoop-canvas'
                    )}
                  >
                    {statusLabel(s)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-stoop-hairline px-4 py-3">
          <span className="text-[12px] text-stoop-muted">
            Enter to save · Esc to cancel
          </span>
          <span className="flex-1" />
          <button
            type="button"
            className="btn-ghost text-[12.5px]"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary text-[12.5px]"
            onClick={submit}
            disabled={!title.trim() || !projectId}
          >
            Add task
          </button>
        </div>
      </div>
    </div>
  );
}
