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
import type { Task, TaskStatus, User } from '../types';

type Props = {
  tasks: Task[];
  users: User[];
  onAdd: (title: string) => void;
  onUpdate: (id: string, data: Partial<Task>) => void;
  onSelect: (id: string) => void;
};

const COLUMNS: { status: TaskStatus; label: string; accent: string }[] = [
  { status: 'todo', label: 'To do', accent: 'border-t-asana-slate' },
  { status: 'doing', label: 'Doing', accent: 'border-t-asana-blue' },
  { status: 'blocked', label: 'Blocked', accent: 'border-t-asana-coral' },
  { status: 'done', label: 'Done', accent: 'border-t-asana-green' },
];

export default function BoardView({ tasks, users, onAdd, onUpdate, onSelect }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const newStatus = e.over?.id as TaskStatus | undefined;
    if (!newStatus) return;
    const task = tasks.find((t) => t.id === id);
    if (task && task.status !== newStatus) onUpdate(id, { status: newStatus });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex h-full gap-3 overflow-x-auto p-4 md:p-6">
        {COLUMNS.map((col) => (
          <Column
            key={col.status}
            label={col.label}
            accent={col.accent}
            status={col.status}
            tasks={tasks.filter((t) => !t.parent_id && t.status === col.status)}
            users={users}
            onAdd={onAdd}
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
  accent,
  tasks,
  users,
  onAdd,
  onSelect,
}: {
  status: TaskStatus;
  label: string;
  accent: string;
  tasks: Task[];
  users: User[];
  onAdd: (title: string) => void;
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
        'flex w-72 shrink-0 flex-col rounded-lg border-t-4 bg-white shadow-sm',
        accent,
        isOver && 'ring-2 ring-asana-blue/40'
      )}
    >
      <div className="flex items-center justify-between px-3 pt-2">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xs text-asana-slate">{tasks.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2">
        {tasks.map((t) => (
          <Card key={t.id} task={t} users={users} onSelect={() => onSelect(t.id)} />
        ))}
        {adding ? (
          <input
            autoFocus
            className="input py-1.5 text-sm"
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
        ) : (
          <button
            className="rounded-md py-1.5 text-left text-sm text-asana-slate hover:bg-asana-stone"
            onClick={() => setAdding(true)}
          >
            + Add task
          </button>
        )}
      </div>
    </div>
  );
}

function Card({ task, users, onSelect }: { task: Task; users: User[]; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const assignee = users.find((u) => u.id === task.assignee_id);
  const due = task.due_date ? new Date(task.due_date) : null;
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // Avoid firing select on accidental drag clicks
        if (!isDragging) onSelect();
        e.stopPropagation();
      }}
      className={clsx(
        'cursor-grab rounded-md border border-asana-line bg-white p-2 text-sm shadow-sm hover:border-asana-blue/50',
        isDragging && 'opacity-50'
      )}
    >
      <div className="font-medium">{task.title}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-asana-slate">
        {assignee && (
          <span
            className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-white"
            style={{ background: assignee.avatar_color }}
            title={assignee.name}
          >
            {assignee.name.charAt(0)}
          </span>
        )}
        {due && <span>{due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
      </div>
    </div>
  );
}
