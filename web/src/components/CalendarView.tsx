import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { api } from '../api';
import type { Project, ScopeDisabledReason, Task, User } from '../types';
import { Avatar, Icon, ProjectDot } from './atoms';
import { SurfaceTopBar } from './MyTasks';
import TaskDetail from './TaskDetail';
import QuickAddTask from './QuickAddTask';

type Props = { projects: Project[]; users: User[] };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
// Noon-local matches TaskDetail / QuickAddTask convention.
function dayToNoonTs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).getTime();
}

export default function CalendarView({ projects, users }: Props) {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('task');
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [addDefaults, setAddDefaults] = useState<{
    open: boolean;
    due_date?: number | null;
  }>({ open: false });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', 'all'],
    queryFn: () => api.tasks(),
  });

  const createTask = useMutation({
    mutationFn: (input: {
      project_id: string;
      title: string;
      due_date: number | null;
      assignee_id: string | null;
      status: Task['status'];
    }) => api.createTask(input),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['tasks', 'all'] });
      qc.invalidateQueries({ queryKey: ['tasks', created.project_id] });
      qc.invalidateQueries({ queryKey: ['my-tasks'] });
    },
  });

  const updateTask = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) =>
      api.updateTask(id, data),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['tasks', 'all'] });
      qc.invalidateQueries({ queryKey: ['tasks', updated.project_id] });
      qc.invalidateQueries({ queryKey: ['my-tasks'] });
    },
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', 'all'] });
      qc.invalidateQueries({ queryKey: ['my-tasks'] });
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
      qc.setQueryData<Task[]>(['tasks', 'all'], (prev) =>
        (prev ?? []).map((t) => (t.id === id ? result.task! : t))
      );
      qc.invalidateQueries({ queryKey: ['tasks', 'all'] });
      qc.invalidateQueries({ queryKey: ['tasks', result.task.project_id] });
    }
    return { disabled: result.disabled, disabled_reason: result.scope.disabled_reason };
  }

  function selectTask(id: string | null) {
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (id) next.set('task', id);
      else next.delete('task');
      return next;
    });
  }

  // Build the 6×7 grid (Sun-start). Always 42 cells so layout stays stable.
  const grid = useMemo(() => {
    const first = startOfMonth(cursor);
    const lead = first.getDay(); // 0..6, Sun=0
    const gridStart = addDays(first, -lead);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  // Bucket tasks by yyyy-mm-dd of their due_date (local).
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    const undated: Task[] = [];
    for (const t of tasks) {
      if (t.due_date == null) {
        undated.push(t);
        continue;
      }
      const d = new Date(t.due_date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return { map, undated };
  }, [tasks]);

  const selected = selectedId ? tasks.find((t) => t.id === selectedId) ?? null : null;
  const selectedProject = selected
    ? projects.find((p) => p.id === selected.project_id) ?? null
    : null;

  const today = startOfDay(new Date());
  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="paper flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <SurfaceTopBar greeting="Calendar" subtle={monthLabel} />

        <header className="border-b border-stoop-hairline bg-stoop-canvas px-5 pb-4 pt-5 md:px-10 md:pt-6">
          <div className="flex items-center gap-2.5 text-[12.5px] text-stoop-muted">
            <Icon.Calendar className="h-3 w-3" />
            <span className="text-stoop-ink-soft">Calendar</span>
          </div>

          <div className="mt-2.5 flex flex-wrap items-end gap-3 md:gap-4">
            <h1 className="display m-0 text-[26px] leading-[1.05] md:text-[30px]">
              {monthLabel}
            </h1>
            <span className="flex-1" />
            <div className="flex items-center gap-1 rounded-[10px] bg-stoop-panel-warm p-[3px]">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() =>
                  setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))
                }
                className="inline-flex items-center justify-center rounded-lg px-2 py-1.5 text-stoop-muted hover:text-stoop-ink"
              >
                <Icon.Chevron className="h-3.5 w-3.5 rotate-180" />
              </button>
              <button
                type="button"
                onClick={() => setCursor(startOfMonth(new Date()))}
                className="inline-flex items-center rounded-lg px-3 py-1.5 text-[13px] text-stoop-muted hover:text-stoop-ink"
              >
                Today
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() =>
                  setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))
                }
                className="inline-flex items-center justify-center rounded-lg px-2 py-1.5 text-stoop-muted hover:text-stoop-ink"
              >
                <Icon.Chevron className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              className="btn-primary text-[13px]"
              type="button"
              onClick={() => setAddDefaults({ open: true })}
            >
              <Icon.Plus className="h-3 w-3" /> Add task
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-3 py-4 md:px-6">
          <div className="mx-auto max-w-[1100px]">
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-card border border-stoop-hairline bg-stoop-hairline">
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  className="bg-stoop-panel-warm px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-stoop-muted"
                >
                  {w}
                </div>
              ))}
              {grid.map((d) => {
                const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                const items = byDay.map.get(key) ?? [];
                const isOtherMonth = d.getMonth() !== cursor.getMonth();
                const isToday = sameDay(d, today);
                return (
                  <DayCell
                    key={key}
                    date={d}
                    items={items}
                    projects={projects}
                    users={users}
                    isOtherMonth={isOtherMonth}
                    isToday={isToday}
                    onPickTask={(id) => selectTask(id)}
                    onPickDay={() =>
                      setAddDefaults({ open: true, due_date: dayToNoonTs(d) })
                    }
                  />
                );
              })}
            </div>

            {byDay.undated.length > 0 && (
              <section className="mt-6">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
                  No date · {byDay.undated.length}
                </div>
                <div className="overflow-hidden rounded-card border border-stoop-hairline bg-stoop-panel">
                  {byDay.undated.map((t, i) => {
                    const project = projects.find((p) => p.id === t.project_id);
                    const assignee = users.find((u) => u.id === t.assignee_id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => selectTask(t.id)}
                        className={clsx(
                          'flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-stoop-canvas',
                          i !== byDay.undated.length - 1 &&
                            'border-b border-stoop-hairline'
                        )}
                      >
                        {project && <ProjectDot project={project} size={8} />}
                        <span className="min-w-0 flex-1 truncate text-[13.5px]">
                          {t.title}
                        </span>
                        {assignee && <Avatar user={assignee} size={20} />}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {selected && selectedProject && (
        <TaskDetail
          task={selected}
          project={selectedProject}
          users={users}
          onClose={() => selectTask(null)}
          onUpdate={(data) => updateTask.mutate({ id: selected.id, data })}
          onDelete={() => deleteTask.mutate(selected.id)}
          onScope={(tier) => scopeTaskOnServer(selected.id, tier)}
        />
      )}

      {addDefaults.open && (
        <QuickAddTask
          projects={projects}
          users={users}
          defaults={{ due_date: addDefaults.due_date ?? null }}
          onClose={() => setAddDefaults({ open: false })}
          onCreate={(input) => createTask.mutate(input)}
        />
      )}
    </div>
  );
}

function DayCell({
  date,
  items,
  projects,
  users,
  isOtherMonth,
  isToday,
  onPickTask,
  onPickDay,
}: {
  date: Date;
  items: Task[];
  projects: Project[];
  users: User[];
  isOtherMonth: boolean;
  isToday: boolean;
  onPickTask: (id: string) => void;
  onPickDay: () => void;
}) {
  const maxVisible = 3;
  const visible = items.slice(0, maxVisible);
  const overflow = items.length - visible.length;

  return (
    <div
      className={clsx(
        'group relative flex min-h-[112px] cursor-pointer flex-col gap-1 bg-stoop-panel p-1.5 transition-colors hover:bg-stoop-canvas',
        isOtherMonth && 'bg-stoop-panel-warm/70 text-stoop-muted'
      )}
      onClick={onPickDay}
    >
      <div className="flex items-center justify-between px-1 pt-0.5">
        <span
          className={clsx(
            'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11.5px] tabular-nums',
            isToday
              ? 'bg-stoop-accent text-white'
              : isOtherMonth
                ? 'text-stoop-muted'
                : 'text-stoop-ink-soft'
          )}
        >
          {date.getDate()}
        </span>
        <span className="opacity-0 transition-opacity group-hover:opacity-100">
          <Icon.Plus className="h-3 w-3 text-stoop-muted" />
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {visible.map((t) => {
          const project = projects.find((p) => p.id === t.project_id);
          const assignee = users.find((u) => u.id === t.assignee_id);
          const done = t.status === 'done';
          return (
            <button
              key={t.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPickTask(t.id);
              }}
              className={clsx(
                'flex items-center gap-1.5 rounded-md border border-stoop-hairline bg-stoop-panel-warm px-1.5 py-1 text-left text-[11.5px] leading-tight hover:border-stoop-hairline-2',
                done && 'opacity-60'
              )}
            >
              {project && <ProjectDot project={project} size={6} />}
              <span
                className={clsx('min-w-0 flex-1 truncate', done && 'line-through')}
              >
                {t.title}
              </span>
              {assignee && <Avatar user={assignee} size={14} />}
            </button>
          );
        })}
        {overflow > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPickTask(items[maxVisible].id);
            }}
            className="px-1.5 text-left text-[11px] text-stoop-muted hover:underline"
          >
            +{overflow} more
          </button>
        )}
      </div>
    </div>
  );
}
