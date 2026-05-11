import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Project, User } from '../types';

type Props = { user: User; users: User[]; projects: Project[] };

export default function MyTasks({ user, users, projects }: Props) {
  const { data: tasks = [] } = useQuery({
    queryKey: ['my-tasks', user.id],
    queryFn: () => api.tasks({ mine: true }),
  });

  const open = tasks.filter((t) => t.status !== 'done');
  const byProject = new Map<string, typeof open>();
  for (const t of open) {
    const arr = byProject.get(t.project_id) ?? [];
    arr.push(t);
    byProject.set(t.project_id, arr);
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <header className="mb-4">
        <h1 className="text-lg font-semibold">My tasks</h1>
        <p className="text-sm text-asana-slate">
          {open.length === 0
            ? 'Nothing assigned to you. Nice.'
            : `${open.length} open ${open.length === 1 ? 'task' : 'tasks'}`}
        </p>
      </header>

      {open.length === 0 ? (
        <div className="rounded-lg border border-dashed border-asana-line bg-white p-10 text-center text-asana-slate">
          🎉 You're all caught up.
        </div>
      ) : (
        <div className="space-y-5">
          {[...byProject.entries()].map(([pid, items]) => {
            const project = projects.find((p) => p.id === pid);
            return (
              <section key={pid}>
                <Link
                  to={`/projects/${pid}`}
                  className="mb-2 flex items-center gap-2 text-sm font-semibold hover:underline"
                >
                  <span
                    className="h-3 w-3 rounded-sm"
                    style={{ background: project?.color ?? '#ccc' }}
                  />
                  {project?.name ?? 'Project'}
                </Link>
                <ul className="overflow-hidden rounded-lg border border-asana-line bg-white">
                  {items.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between border-b border-asana-line px-4 py-2 text-sm last:border-b-0"
                    >
                      <span className="truncate">{t.title}</span>
                      <span className="text-xs text-asana-slate">
                        {t.due_date
                          ? new Date(t.due_date).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })
                          : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {/* Hint about other family members */}
      {users.length > 1 && (
        <p className="mt-6 text-xs text-asana-slate">
          {users.length} family members on this server.
        </p>
      )}
    </div>
  );
}
