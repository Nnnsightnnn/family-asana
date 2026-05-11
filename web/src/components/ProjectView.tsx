import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '../api';
import type { Task, User } from '../types';
import ListView from './ListView';
import BoardView from './BoardView';
import TaskDetail from './TaskDetail';

type Props = { projectId: string; users: User[] };
type ViewMode = 'list' | 'board';

export default function ProjectView({ projectId, users }: Props) {
  const qc = useQueryClient();
  const [view, setView] = useState<ViewMode>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => (await api.projects()).find((p) => p.id === projectId) ?? null,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => api.tasks({ project_id: projectId }),
  });

  const createTask = useMutation({
    mutationFn: (title: string) => api.createTask({ project_id: projectId, title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });

  const updateTask = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) => api.updateTask(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      setSelectedId(null);
    },
  });

  if (!project) return <div className="p-6 text-asana-slate">Loading…</div>;

  const selected = selectedId ? tasks.find((t) => t.id === selectedId) ?? null : null;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-asana-line bg-white px-4 py-3 md:px-6">
          <span className="h-4 w-4 rounded-sm" style={{ background: project.color }} />
          <h1 className="truncate text-lg font-semibold">{project.name}</h1>
          <div className="ml-auto flex rounded-md border border-asana-line bg-white p-0.5 text-sm">
            <button
              className={clsx(
                'rounded px-2 py-1',
                view === 'list' ? 'bg-asana-line font-medium' : 'text-asana-slate'
              )}
              onClick={() => setView('list')}
            >
              List
            </button>
            <button
              className={clsx(
                'rounded px-2 py-1',
                view === 'board' ? 'bg-asana-line font-medium' : 'text-asana-slate'
              )}
              onClick={() => setView('board')}
            >
              Board
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-asana-stone">
          {view === 'list' ? (
            <ListView
              tasks={tasks}
              users={users}
              onAdd={(title) => createTask.mutate(title)}
              onUpdate={(id, data) => updateTask.mutate({ id, data })}
              onSelect={setSelectedId}
              selectedId={selectedId}
            />
          ) : (
            <BoardView
              tasks={tasks}
              users={users}
              onAdd={(title) => createTask.mutate(title)}
              onUpdate={(id, data) => updateTask.mutate({ id, data })}
              onSelect={setSelectedId}
            />
          )}
        </div>
      </div>

      {selected && (
        <TaskDetail
          task={selected}
          users={users}
          onClose={() => setSelectedId(null)}
          onUpdate={(data) => updateTask.mutate({ id: selected.id, data })}
          onDelete={() => deleteTask.mutate(selected.id)}
        />
      )}
    </div>
  );
}
