import { useState } from 'react';
import clsx from 'clsx';
import type { Task, TaskStatus, User } from '../types';

type Props = {
  tasks: Task[];
  users: User[];
  onAdd: (title: string) => void;
  onUpdate: (id: string, data: Partial<Task>) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
};

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'Doing' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
];

export default function ListView({ tasks, users, onAdd, onUpdate, onSelect, selectedId }: Props) {
  const [newTitle, setNewTitle] = useState('');

  const top = tasks.filter((t) => !t.parent_id);

  function submit() {
    const v = newTitle.trim();
    if (!v) return;
    onAdd(v);
    setNewTitle('');
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="overflow-hidden rounded-lg border border-asana-line bg-white">
        <div className="grid grid-cols-[1fr_120px_120px_120px] gap-2 border-b border-asana-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-asana-slate">
          <span>Task</span>
          <span>Assignee</span>
          <span>Due date</span>
          <span>Status</span>
        </div>
        <ul>
          {top.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              users={users}
              selected={selectedId === t.id}
              onSelect={() => onSelect(t.id)}
              onUpdate={(data) => onUpdate(t.id, data)}
            />
          ))}
          <li className="grid grid-cols-[1fr_120px_120px_120px] items-center gap-2 px-4 py-2">
            <input
              className="bg-transparent text-sm outline-none placeholder:text-asana-slate"
              placeholder="+ Add task"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              onBlur={submit}
            />
          </li>
        </ul>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  users,
  selected,
  onSelect,
  onUpdate,
}: {
  task: Task;
  users: User[];
  selected: boolean;
  onSelect: () => void;
  onUpdate: (data: Partial<Task>) => void;
}) {
  const assignee = users.find((u) => u.id === task.assignee_id);
  const due = task.due_date ? new Date(task.due_date) : null;

  return (
    <li
      className={clsx(
        'grid cursor-pointer grid-cols-[1fr_120px_120px_120px] items-center gap-2 border-b border-asana-line px-4 py-2 last:border-b-0 hover:bg-asana-stone',
        selected && 'bg-asana-stone'
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <button
          aria-label="Toggle complete"
          onClick={(e) => {
            e.stopPropagation();
            onUpdate({ status: task.status === 'done' ? 'todo' : 'done' });
          }}
          className={clsx(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
            task.status === 'done'
              ? 'border-asana-green bg-asana-green text-white'
              : 'border-asana-line'
          )}
        >
          {task.status === 'done' && <span className="text-[10px]">✓</span>}
        </button>
        <span className={clsx('truncate text-sm', task.status === 'done' && 'text-asana-slate line-through')}>
          {task.title}
        </span>
      </div>

      <span className="text-sm text-asana-slate">
        {assignee ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              style={{ background: assignee.avatar_color }}
            >
              {assignee.name.charAt(0)}
            </span>
            <span className="truncate">{assignee.name.split(' ')[0]}</span>
          </span>
        ) : (
          <span className="text-asana-slate">—</span>
        )}
      </span>

      <span className="text-sm text-asana-slate">
        {due
          ? due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : '—'}
      </span>

      <StatusPill
        status={task.status}
        onChange={(s) => onUpdate({ status: s })}
      />
    </li>
  );
}

function StatusPill({
  status,
  onChange,
}: {
  status: TaskStatus;
  onChange: (s: TaskStatus) => void;
}) {
  const styles: Record<TaskStatus, string> = {
    todo: 'bg-asana-stone text-asana-slate',
    doing: 'bg-asana-blue/10 text-asana-blue',
    blocked: 'bg-asana-coral/10 text-asana-coral',
    done: 'bg-asana-green/10 text-asana-green',
  };
  return (
    <select
      className={clsx('rounded-full border-none px-2 py-1 text-xs font-medium outline-none', styles[status])}
      value={status}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value as TaskStatus)}
    >
      {STATUSES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
