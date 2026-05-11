import { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import clsx from 'clsx';
import type { Project, Task, TaskStatus, User } from '../types';
import { Avatar, DueLabel, Icon, ProjectDot } from './atoms';

type Props = {
  tasks: Task[];
  users: User[];
  project: Project;
  onAdd: (title: string) => void;
  onUpdate: (id: string, data: Partial<Task>) => void;
  onSelect: (id: string) => void;
};

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: 'To do' },
  { status: 'doing', label: 'Doing' },
  { status: 'blocked', label: 'Held' },
  { status: 'done', label: 'Done' },
];

export default function BoardView({
  tasks,
  users,
  project,
  onAdd,
  onUpdate,
  onSelect,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const newStatus = e.over?.id as TaskStatus | undefined;
    if (!newStatus) return;
    const task = tasks.find((t) => t.id === id);
    if (task && task.status !== newStatus) onUpdate(id, { status: newStatus });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex h-full gap-3.5 overflow-x-auto px-5 py-5 md:px-7">
        {COLUMNS.map((col) => (
          <Column
            key={col.status}
            label={col.label}
            status={col.status}
            tasks={tasks.filter((t) => !t.parent_id && t.status === col.status)}
            users={users}
            project={project}
            onAdd={(title) => onAdd(title)}
            onUpdateStatus={() => onAdd('')}
            onSelect={onSelect}
          />
        ))}
      </div>
    </DndContext>
  );
}

function Column({
  status,
  label,
  tasks,
  users,
  project,
  onAdd,
  onSelect,
}: {
  status: TaskStatus;
  label: string;
  tasks: Task[];
  users: User[];
  project: Project;
  onAdd: (title: string) => void;
  onUpdateStatus: () => void;
  onSelect: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');

  function submit() {
    const v = title.trim();
    if (v) onAdd(v);
    setTitle('');
    setAdding(false);
  }

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'flex h-full w-[268px] shrink-0 flex-col rounded-card bg-stoop-panel-warm p-2.5 transition-shadow',
        isOver && 'shadow-[0_0_0_2px_theme(colors.stoop.accent-soft-2)]'
      )}
    >
      <div className="flex items-center gap-2 px-2 pb-2.5 pt-1.5">
        <span className="display text-[15px] font-medium">{label}</span>
        <span className="text-[12px] tabular-nums text-stoop-muted">
          {tasks.length}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label={`Add to ${label}`}
          className="rounded p-1 text-stoop-muted hover:bg-stoop-hairline"
        >
          <Icon.Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-auto">
        {tasks.map((t) => (
          <Card
            key={t.id}
            task={t}
            users={users}
            project={project}
            onSelect={() => onSelect(t.id)}
          />
        ))}
        {tasks.length === 0 && !adding && (
          <div className="px-3 py-3 text-center text-xs text-stoop-muted">
            —
          </div>
        )}
        {adding && (
          <input
            autoFocus
            className="input-shell py-1.5 text-sm"
            placeholder="Task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') {
                setAdding(false);
                setTitle('');
              }
            }}
            onBlur={submit}
          />
        )}
      </div>
    </div>
  );
}

function Card({
  task,
  users,
  project,
  onSelect,
}: {
  task: Task;
  users: User[];
  project: Project;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });
  const assignee = users.find((u) => u.id === task.assignee_id);
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const done = task.status === 'done';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (!isDragging) onSelect();
        e.stopPropagation();
      }}
      className={clsx(
        'cursor-grab rounded-[12px] border border-stoop-hairline bg-stoop-panel px-[13px] py-3 transition-colors hover:border-stoop-hairline-2',
        isDragging && 'opacity-50',
        done && 'opacity-70'
      )}
    >
      <div
        className={clsx(
          'text-[13.5px] leading-snug text-stoop-ink',
          done && 'line-through'
        )}
      >
        {task.title}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5">
          <ProjectDot project={project} size={7} />
          <span className="truncate text-[11.5px] text-stoop-muted">
            {project.name}
          </span>
        </span>
        <span className="flex-1" />
        <DueLabel ts={task.due_date} />
        {assignee && <Avatar user={assignee} size={20} />}
      </div>
    </div>
  );
}
