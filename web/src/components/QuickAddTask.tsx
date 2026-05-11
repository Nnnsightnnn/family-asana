import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { api } from '../api';
import type { Project, Route, ScopeResult, TaskStatus, User } from '../types';
import { Icon, ProjectDot, RouteChip, statusLabel } from './atoms';
import MobilizePanel from './MobilizePanel';

type Defaults = {
  project_id?: string;
  due_date?: number | null;
  status?: TaskStatus;
  assignee_id?: string | null;
  title?: string;
};

type Input = {
  project_id: string;
  title: string;
  due_date: number | null;
  assignee_id: string | null;
  status: TaskStatus;
  // Mobilization fields, present only when "Save & mobilize" is used.
  route?: Route;
  next_action?: string | null;
  service_url?: string | null;
  scoped_model?: string | null;
};

type Props = {
  projects: Project[];
  users: User[];
  defaults?: Defaults;
  onClose: () => void;
  onCreate: (input: Input) => void;
};

const STATUSES: TaskStatus[] = ['todo', 'doing', 'blocked', 'done'];
const SCOPE_DEBOUNCE_MS = 450;

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

/**
 * A scope result is a "DIY collapse" (chip only, no panel) when the AI is
 * confident it's a routine self-do task with nothing useful to add.
 */
function isDiyCollapse(scope: ScopeResult | null): boolean {
  if (!scope) return false;
  return scope.route === 'diy' && scope.confidence !== 'low' && !scope.next_action;
}

export default function QuickAddTask({
  projects,
  users,
  defaults,
  onClose,
  onCreate,
}: Props) {
  const [title, setTitle] = useState(defaults?.title ?? '');
  const [projectId, setProjectId] = useState(
    defaults?.project_id ?? projects[0]?.id ?? ''
  );
  const [dueValue, setDueValue] = useState(tsToDateInput(defaults?.due_date));
  const [assigneeId, setAssigneeId] = useState<string>(defaults?.assignee_id ?? '');
  const [status, setStatus] = useState<TaskStatus>(defaults?.status ?? 'todo');
  const [scope, setScope] = useState<ScopeResult | null>(null);
  const [scoping, setScoping] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastScopedTitleRef = useRef<string>('');

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Debounced live scoping. Refires on every meaningful title edit.
  useEffect(() => {
    const trimmed = title.trim();
    if (trimmed.length < 3) {
      setScope(null);
      setScoping(false);
      return;
    }
    // Skip if we already scoped this exact title.
    if (trimmed === lastScopedTitleRef.current) return;

    const timer = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;
      setScoping(true);
      api
        .scope({
          title: trimmed,
          due_date: dateInputToTs(dueValue),
        })
        .then((result) => {
          if (controller.signal.aborted) return;
          if (result.disabled || result.route === 'unset') {
            setScope(null);
          } else {
            setScope(result);
          }
          lastScopedTitleRef.current = trimmed;
        })
        .catch(() => {
          // Network or server error — degrade silently.
          if (!controller.signal.aborted) setScope(null);
        })
        .finally(() => {
          if (!controller.signal.aborted) setScoping(false);
        });
    }, SCOPE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // We deliberately don't depend on dueValue — re-scoping on date alone
    // would be noisy. The next title edit will pick up the new date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  function rescopeSmart() {
    const trimmed = title.trim();
    if (trimmed.length < 3) return;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setScoping(true);
    api
      .scope({
        title: trimmed,
        due_date: dateInputToTs(dueValue),
        tier: 'smart',
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.disabled || result.route === 'unset') setScope(null);
        else setScope(result);
        lastScopedTitleRef.current = trimmed;
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setScoping(false);
      });
  }

  function submit(mobilize: boolean) {
    const v = title.trim();
    if (!v || !projectId) return;
    const base: Input = {
      project_id: projectId,
      title: v,
      due_date: dateInputToTs(dueValue),
      assignee_id: assigneeId || null,
      status,
    };
    if (mobilize && scope && scope.route !== 'unset') {
      onCreate({
        ...base,
        route: scope.route,
        next_action: scope.next_action,
        service_url: scope.service_url,
        scoped_model: scope.model || null,
      });
    } else {
      onCreate(base);
    }
    onClose();
  }

  const canMobilize = !!scope && scope.route !== 'unset' && !isDiyCollapse(scope);
  const showCollapsedChip = isDiyCollapse(scope);
  const showPanel = !!scope && !isDiyCollapse(scope);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-stoop-ink/30 px-4 pt-[14vh] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] rounded-card border border-stoop-hairline bg-stoop-panel shadow-soft"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Add task"
      >
        <div className="flex items-center gap-2.5 border-b border-stoop-hairline px-5 py-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
            New task
          </span>
          {scoping && (
            <span className="text-[11px] text-stoop-muted">✦ scoping…</span>
          )}
          {showCollapsedChip && scope && !scoping && (
            <span className="ml-1">
              <RouteChip route={scope.route} />
            </span>
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

        <div className="px-5 py-4">
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit(canMobilize);
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

          {showPanel && scope && (
            <MobilizePanel
              scope={scope}
              onThinkHarder={rescopeSmart}
              thinking={scoping}
            />
          )}
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
          {canMobilize ? (
            <>
              <button
                type="button"
                className="btn-outline text-[12.5px]"
                onClick={() => submit(false)}
                disabled={!title.trim() || !projectId}
              >
                Just save
              </button>
              <button
                type="button"
                className="btn-primary text-[12.5px]"
                onClick={() => submit(true)}
                disabled={!title.trim() || !projectId}
              >
                Save & mobilize
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-primary text-[12.5px]"
              onClick={() => submit(false)}
              disabled={!title.trim() || !projectId}
            >
              Add task
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
