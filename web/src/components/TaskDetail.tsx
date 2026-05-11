import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { Task, TaskStatus, User } from '../types';

type Props = {
  task: Task;
  users: User[];
  onClose: () => void;
  onUpdate: (data: Partial<Task>) => void;
  onDelete: () => void;
};

const STATUSES: TaskStatus[] = ['todo', 'doing', 'blocked', 'done'];

export default function TaskDetail({ task, users, onClose, onUpdate, onDelete }: Props) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);

  // Sync local edits when switching to a different task
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
  }, [task.id]);

  function commitTitle() {
    const v = title.trim();
    if (v && v !== task.title) onUpdate({ title: v });
  }
  function commitDescription() {
    if (description !== task.description) onUpdate({ description });
  }

  const dueValue = task.due_date
    ? new Date(task.due_date).toISOString().slice(0, 10)
    : '';

  return (
    <aside className="flex w-full max-w-md shrink-0 flex-col border-l border-asana-line bg-white">
      <div className="flex items-center border-b border-asana-line px-4 py-3">
        <span className="text-xs uppercase tracking-wide text-asana-slate">Task</span>
        <button className="btn-ghost ml-auto" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-auto p-4">
        <input
          className="w-full bg-transparent text-lg font-semibold outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />

        <Row label="Assignee">
          <select
            className="input"
            value={task.assignee_id ?? ''}
            onChange={(e) => onUpdate({ assignee_id: e.target.value || null })}
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Due date">
          <input
            type="date"
            className="input"
            value={dueValue}
            onChange={(e) => {
              if (!e.target.value) return onUpdate({ due_date: null });
              const d = new Date(e.target.value);
              onUpdate({ due_date: d.getTime() });
            }}
          />
        </Row>

        <Row label="Status">
          <div className="flex flex-wrap gap-1">
            {STATUSES.map((s) => (
              <button
                key={s}
                className={clsx(
                  'rounded-full px-2.5 py-1 text-xs font-medium capitalize',
                  task.status === s
                    ? s === 'done'
                      ? 'bg-asana-green/15 text-asana-green'
                      : s === 'blocked'
                        ? 'bg-asana-coral/15 text-asana-coral'
                        : s === 'doing'
                          ? 'bg-asana-blue/15 text-asana-blue'
                          : 'bg-asana-line text-asana-ink'
                    : 'text-asana-slate hover:bg-asana-stone'
                )}
                onClick={() => onUpdate({ status: s })}
              >
                {s}
              </button>
            ))}
          </div>
        </Row>

        <Row label="Description">
          <textarea
            className="input min-h-[120px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={commitDescription}
            placeholder="What's this task about?"
          />
        </Row>
      </div>

      <div className="border-t border-asana-line p-3">
        <button
          className="btn-ghost w-full text-asana-coral hover:bg-asana-coral/10"
          onClick={() => {
            if (confirm('Delete this task?')) onDelete();
          }}
        >
          Delete task
        </button>
      </div>
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-asana-slate">
        {label}
      </div>
      {children}
    </div>
  );
}
