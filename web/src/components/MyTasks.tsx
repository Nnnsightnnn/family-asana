import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Project, Task, User } from '../types';
import { describeRecurrence, parseRecurrence } from '../types';
import {
  Avatar,
  DueLabel,
  Icon,
  ProjectDot,
  StatusCheckbox,
  timeGreeting,
} from './atoms';

type Props = { user: User; users: User[]; projects: Project[] };

export default function MyTasks({ user, projects }: Props) {
  const qc = useQueryClient();
  const { data: tasks = [] } = useQuery({
    queryKey: ['my-tasks', user.id],
    queryFn: () => api.tasks({ mine: true }),
  });
  const deleteTask = useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-tasks', user.id] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const open = tasks.filter((t) => t.status !== 'done');
  const todayCount = countDueToday(open);

  const byProject = new Map<string, Task[]>();
  for (const t of open) {
    const arr = byProject.get(t.project_id) ?? [];
    arr.push(t);
    byProject.set(t.project_id, arr);
  }

  const firstName = user.name.split(' ')[0];
  const dateLine = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="paper flex h-full flex-col">
      <SurfaceTopBar
        greeting={
          <>
            {dateLine.split(',')[0]},{' '}
            <span className="display-italic">slow start.</span>
          </>
        }
        subtle={dateLine}
      />

      <div className="min-h-0 flex-1 overflow-auto px-5 py-8 md:px-14 md:py-10">
        <div className="mx-auto max-w-[740px]">
          {/* Greeting */}
          <div>
            <h1 className="display m-0 text-[36px] leading-[1.05] md:text-[44px]">
              {timeGreeting()}, {firstName}.
            </h1>
            <p className="mt-2.5 text-[16px] leading-relaxed text-stoop-ink-soft md:text-[17px]">
              {open.length === 0 ? (
                <>Nothing on your plate. Enjoy the quiet.</>
              ) : (
                <>
                  <span className="tabular-nums text-stoop-accent-deep">
                    {todayCount === 0
                      ? `${open.length} things`
                      : `${todayCount} things`}
                  </span>{' '}
                  {todayCount === 0
                    ? 'on your list — none due today.'
                    : 'on your plate for today, and a couple more drifting in this week.'}
                </>
              )}
            </p>
          </div>

          {open.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="mt-9">
              <div className="mb-3.5 flex items-baseline gap-3">
                <h2 className="display m-0 text-[22px]">Today</h2>
                <span className="text-[13px] text-stoop-muted">
                  {open.length} {open.length === 1 ? 'task' : 'tasks'}, across{' '}
                  {byProject.size}{' '}
                  {byProject.size === 1 ? 'project' : 'projects'}
                </span>
              </div>

              <div className="flex flex-col gap-[22px]">
                {[...byProject.entries()].map(([pid, items]) => {
                  const project = projects.find((p) => p.id === pid);
                  const label = project?.name ?? '(archived project)';
                  return (
                    <section key={pid}>
                      <Link
                        to={project ? `/projects/${pid}` : '#'}
                        className="mb-2 flex items-center gap-2 hover:underline"
                      >
                        {project ? (
                          <ProjectDot project={project} size={9} />
                        ) : (
                          <span className="inline-block h-[9px] w-[9px] rounded-full bg-stoop-muted/40" />
                        )}
                        <span className="text-[13px] font-medium">{label}</span>
                        <span className="text-xs text-stoop-muted">
                          · {items.length}
                        </span>
                      </Link>
                      <div className="overflow-hidden rounded-card border border-stoop-hairline bg-stoop-panel">
                        {items.map((t, i) => (
                          <div
                            key={t.id}
                            className="group relative"
                            style={{
                              borderBottom:
                                i === items.length - 1
                                  ? 'none'
                                  : '1px solid #EFE7DA',
                            }}
                          >
                            <Link
                              to={project ? `/projects/${pid}?task=${t.id}` : '#'}
                              className="flex items-center gap-3 px-4 py-3 hover:bg-stoop-canvas"
                            >
                              <StatusCheckbox status={t.status} />
                              <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
                                <span className="min-w-0 truncate">{t.title}</span>
                                {(() => {
                                  const rule = parseRecurrence(t.recurrence);
                                  if (!rule) return null;
                                  return (
                                    <Icon.Repeat
                                      className="h-3 w-3 shrink-0 text-stoop-muted"
                                      aria-label={`Repeats: ${describeRecurrence(rule)}`}
                                    />
                                  );
                                })()}
                              </div>
                              <DueLabel ts={t.due_date} />
                              <span className="inline-flex h-[22px] w-[22px] items-center justify-center transition-opacity group-hover:opacity-0">
                                <Avatar user={user} size={22} />
                              </span>
                            </Link>
                            <button
                              type="button"
                              aria-label={`Delete "${t.title}"`}
                              className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1.5 text-stoop-muted opacity-0 transition-opacity hover:bg-stoop-hairline hover:text-stoop-ink focus:opacity-100 group-hover:opacity-100"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (confirm(`Delete "${t.title}"?`))
                                  deleteTask.mutate(t.id);
                              }}
                            >
                              <Icon.Trash className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>

              <p className="mt-10 text-center text-[12.5px] text-stoop-muted">
                That’s the lot. Have a good morning.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-12 flex flex-col items-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-stoop-accent-soft text-stoop-accent-deep">
        <Icon.CheckCircle className="h-7 w-7" />
      </div>
      <h2 className="display mt-5 mb-1.5 text-[26px]">
        Nothing on your <span className="display-italic">plate.</span>
      </h2>
      <p className="m-0 max-w-[320px] text-[14px] leading-relaxed text-stoop-muted">
        Enjoy the quiet.
      </p>
    </div>
  );
}

export function SurfaceTopBar({
  greeting,
  subtle,
}: {
  greeting?: React.ReactNode;
  subtle?: string;
}) {
  return (
    <header className="hidden h-16 shrink-0 items-center gap-4 border-b border-stoop-hairline bg-stoop-canvas px-6 md:flex">
      <div className="min-w-0">
        {greeting && (
          <div className="display text-[18px] leading-tight">{greeting}</div>
        )}
        {subtle && (
          <div className="mt-0.5 text-xs text-stoop-muted">{subtle}</div>
        )}
      </div>
    </header>
  );
}

function countDueToday(tasks: Task[]): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = start.getTime() + 86_400_000;
  return tasks.filter(
    (t) => t.due_date != null && t.due_date >= start.getTime() && t.due_date < end
  ).length;
}
