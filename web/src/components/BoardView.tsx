import { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import type { Project, Task, TaskStatus, User } from '../types';
import type { TaskWrite } from '../api';
import { Avatar, DueLabel, Icon, ProjectDot } from './atoms';

type Props = {
  tasks: Task[];
  users: User[];
  project: Project;
  onAdd: (title: string) => void;
  onUpdate: (id: string, data: TaskWrite) => void;
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

  // Bucket once, sorted by position so dnd-kit/sortable indices line up with what the user sees.
  const byColumn = COLUMNS.reduce<Record<TaskStatus, Task[]>>(
    (acc, col) => {
      acc[col.status] = tasks
        .filter((t) => !t.parent_id && t.status === col.status)
        .sort((a, b) => a.position - b.position);
      return acc;
    },
    { todo: [], doing: [], blocked: [], done: [] }
  );

  function onDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    if (!e.over) return;

    const task = tasks.find((t) => t.id === activeId);
    if (!task) return;

    const overId = String(e.over.id);
    const overTask = tasks.find((t) => t.id === overId);

    // Resolve the destination column. The `over` target can be either another
    // sortable card or the column droppable itself (when the column is empty
    // or the pointer is past the last card).
    const destStatus: TaskStatus = overTask
      ? overTask.status
      : (overId as TaskStatus);

    // Cross-column drop → status change (legacy behavior).
    if (task.status !== destStatus) {
      onUpdate(activeId, { status: destStatus });
      return;
    }

    // Same column reorder → compute a fractional position between neighbors.
    const column = byColumn[destStatus];
    const fromIdx = column.findIndex((t) => t.id === activeId);
    if (fromIdx === -1) return;

    // Where would the card land? If `over` is a card, use its index;
    // if `over` is the column itself, drop at the end.
    let toIdx = overTask ? column.findIndex((t) => t.id === overId) : column.length - 1;
    if (toIdx === -1 || toIdx === fromIdx) return;

    // Build the post-move ordering of *other* tasks, then look at the
    // neighbors of the slot the dragged task will occupy. `insertAt` is the
    // dragged card's new index in `others`:
    //   - moving down (toIdx > fromIdx): target's index in `others` is
    //     (toIdx - 1); we land *after* it → toIdx - 1 + 1 = toIdx.
    //   - moving up   (toIdx < fromIdx): target's index in `others` is still
    //     toIdx; we land *before* it → toIdx.
    // Either way, insertAt === toIdx.
    const others = column.filter((t) => t.id !== activeId);
    const insertAt = toIdx;
    const prev = others[insertAt - 1];
    const next = others[insertAt];

    let newPosition: number;
    if (!prev && next) {
      newPosition = next.position - 1;
    } else if (prev && !next) {
      newPosition = prev.position + 1;
    } else if (prev && next) {
      newPosition = (prev.position + next.position) / 2;
    } else {
      return; // nothing to sort against
    }

    if (newPosition === task.position) return;
    onUpdate(activeId, { position: newPosition });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex h-full gap-3.5 overflow-x-auto px-5 py-5 md:px-7">
        {COLUMNS.map((col) => (
          <Column
            key={col.status}
            label={col.label}
            status={col.status}
            tasks={byColumn[col.status]}
            users={users}
            project={project}
            onAdd={(title) => onAdd(title)}
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
  onSelect: (id: string) => void;
}) {
  // Column-level droppable so empty columns (and drops past the last card)
  // still resolve to a destination status.
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

      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
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
      </SortableContext>
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });
  const assignee = users.find((u) => u.id === task.assignee_id);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
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
