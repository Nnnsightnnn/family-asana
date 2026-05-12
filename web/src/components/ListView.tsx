import { useState } from 'react';
import clsx from 'clsx';
import type { Task, TaskStatus, User } from '../types';
import { describeRecurrence, parseRecurrence } from '../types';
import type { TaskWrite } from '../api';
import {
  Avatar,
  DueLabel,
  Icon,
  StatusChip,
  StatusCheckbox,
} from './atoms';

type Props = {
  tasks: Task[];
  users: User[];
  /** Called with the typed title — opens the rich Add Task modal pre-filled, so scoping happens. */
  onStartAdd: (title: string) => void;
  onUpdate: (id: string, data: TaskWrite) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
};

const COLS = '24px minmax(0,1fr) 110px 130px 140px 40px';

export default function ListView({
  tasks,
  users,
  onStartAdd,
  onUpdate,
  onSelect,
  selectedId,
}: Props) {
  const [newTitle, setNewTitle] = useState('');
  const top = tasks.filter((t) => !t.parent_id);

  function submit() {
    const v = newTitle.trim();
    if (!v) return;
    onStartAdd(v);
    setNewTitle('');
  }

  return (
    <div className="px-5 py-6 md:px-10">
      <div className="mx-auto max-w-[880px]">
        {/* Column headers */}
        <div
          className="grid items-center gap-3.5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-stoop-muted"
          style={{ gridTemplateColumns: COLS }}
        >
          <span />
          <span>Task</span>
          <span>Status</span>
          <span>Due</span>
          <span>Who</span>
          <span />
        </div>

        <div className="overflow-hidden rounded-card border border-stoop-hairline bg-stoop-panel">
          {top.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-stoop-muted">
              No tasks yet — add the first one below.
            </div>
          )}
          {top.map((t, i) => (
            <Row
              key={t.id}
              task={t}
              users={users}
              selected={selectedId === t.id}
              last={i === top.length - 1}
              onSelect={() => onSelect(t.id)}
              onUpdate={(data) => onUpdate(t.id, data)}
            />
          ))}

          {/* Inline add row */}
          <div
            className="grid items-center gap-3.5 bg-stoop-panel-warm px-4 py-3.5 text-sm text-stoop-muted"
            style={{ gridTemplateColumns: COLS }}
          >
            <Icon.Plus className="h-3.5 w-3.5" />
            <input
              data-shortcut="new-task"
              className="bg-transparent text-sm outline-none placeholder:text-stoop-muted"
              placeholder="Add a task… (enter for the rich form)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              onBlur={submit}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  task,
  users,
  selected,
  last,
  onSelect,
  onUpdate,
}: {
  task: Task;
  users: User[];
  selected: boolean;
  last: boolean;
  onSelect: () => void;
  onUpdate: (data: TaskWrite) => void;
}) {
  const assignee = users.find((u) => u.id === task.assignee_id);
  const done = task.status === 'done';

  function toggleDone(e: React.MouseEvent) {
    e.stopPropagation();
    onUpdate({ status: done ? 'todo' : 'done' });
  }
  function cycleStatus(e: React.MouseEvent) {
    e.stopPropagation();
    const order: TaskStatus[] = ['todo', 'doing', 'blocked', 'done'];
    const next = order[(order.indexOf(task.status) + 1) % order.length];
    onUpdate({ status: next });
  }

  return (
    <div
      onClick={onSelect}
      className={clsx(
        'grid cursor-pointer items-center gap-3.5 px-4 py-3.5 text-sm transition-colors hover:bg-stoop-canvas',
        !last && 'border-b border-stoop-hairline',
        selected && 'bg-stoop-canvas',
        done && 'opacity-60'
      )}
      style={{ gridTemplateColumns: COLS }}
    >
      <span onClick={toggleDone}>
        <StatusCheckbox status={task.status} />
      </span>
      <div
        className={clsx(
          'flex min-w-0 items-center gap-1.5 text-sm',
          done && 'line-through'
        )}
      >
        <span className="min-w-0 truncate">{task.title}</span>
        <RepeatBadge recurrence={task.recurrence} />
      </div>
      <span onClick={cycleStatus} className="cursor-pointer">
        <StatusChip status={task.status} />
      </span>
      <DueLabel ts={task.due_date} />
      <div className="flex items-center gap-2">
        {assignee ? (
          <>
            <Avatar user={assignee} size={22} />
            <span className="truncate text-[13px]">{assignee.name}</span>
          </>
        ) : (
          <span className="text-[13px] text-stoop-muted">Unassigned</span>
        )}
      </div>
      <Icon.More className="h-4 w-4 text-stoop-muted" />
    </div>
  );
}

function RepeatBadge({ recurrence }: { recurrence: string | null }) {
  const rule = parseRecurrence(recurrence);
  if (!rule) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center text-stoop-muted"
      title={`Repeats: ${describeRecurrence(rule)}`}
      aria-label={`Repeats: ${describeRecurrence(rule)}`}
    >
      <Icon.Repeat className="h-3 w-3" />
    </span>
  );
}
