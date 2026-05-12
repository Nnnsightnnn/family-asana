import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type {
  Project,
  RecurrenceRule,
  ScopeDisabledReason,
  ScopeResult,
  Task,
  TaskStatus,
  User,
} from '../types';
import { describeRecurrence, parseRecurrence } from '../types';
import type { TaskWrite } from '../api';
import {
  Avatar,
  DueLabel,
  Icon,
  MobilizationStateChip,
  ProjectDot,
  statusLabel,
} from './atoms';
import MobilizePanel from './MobilizePanel';

const RECURRENCE_PRESETS: { value: string; label: string; rule: RecurrenceRule | null }[] = [
  { value: 'off', label: 'Off', rule: null },
  { value: 'daily', label: 'Daily', rule: { kind: 'daily' } },
  { value: 'weekdays', label: 'Weekdays', rule: { kind: 'weekdays' } },
  { value: 'weekly', label: 'Weekly', rule: { kind: 'weekly' } },
  { value: 'monthly', label: 'Monthly', rule: { kind: 'monthly' } },
  { value: 'yearly', label: 'Yearly', rule: { kind: 'yearly' } },
];

function ruleToPresetValue(rule: RecurrenceRule | null): string {
  if (!rule) return 'off';
  if (rule.kind === 'every') return 'every';
  return rule.kind;
}

type Props = {
  task: Task;
  project: Project;
  users: User[];
  onClose: () => void;
  onUpdate: (data: TaskWrite) => void;
  onDelete: () => void;
  /** Triggers a fresh AI scope of this task; resolves with the disabled flag (+ reason) for UI feedback. */
  onScope: (
    tier?: 'fast' | 'smart'
  ) => Promise<{ disabled: boolean; disabled_reason?: ScopeDisabledReason }>;
};

const STATUSES: TaskStatus[] = ['todo', 'doing', 'blocked', 'done'];
const STATUS_BG: Record<TaskStatus, string> = {
  todo: '#F4EFE6',
  doing: '#E3ECF1',
  blocked: '#F1E0D6',
  done: '#E2EBE3',
};
const STATUS_FG: Record<TaskStatus, string> = {
  todo: '#6F6358',
  doing: '#5A7A8E',
  blocked: '#B36447',
  done: '#6B8A6E',
};

function scopeDisabledMessage(reason?: ScopeDisabledReason): string {
  switch (reason) {
    case 'no_key':
      return "AI scoping isn't configured on the server. Ask the admin to set OPENROUTER_API_KEY.";
    case 'parse_error':
      return 'AI returned an invalid response. Try again, or report this if it persists.';
    case 'api_error':
    case 'empty_response':
      return 'AI scoping is temporarily unavailable. Try again in a moment.';
    default:
      return 'AI scoping is unavailable. Try again, or check with the admin.';
  }
}

export default function TaskDetail({
  task,
  project,
  users,
  onClose,
  onUpdate,
  onDelete,
  onScope,
}: Props) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [scoping, setScoping] = useState(false);
  const [scopeError, setScopeError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setSavedAt(null);
    setScopeError(null);
  }, [task.id]);

  async function runScope(tier?: 'fast' | 'smart') {
    setScoping(true);
    setScopeError(null);
    try {
      const { disabled, disabled_reason } = await onScope(tier);
      if (disabled) setScopeError(scopeDisabledMessage(disabled_reason));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setScopeError(msg);
    } finally {
      setScoping(false);
    }
  }

  // Reconstruct a panel-shaped scope from the task's persisted fields. The
  // "Re-scope ↻" link can call onScope to refresh against the server.
  const persistedScope: ScopeResult | null =
    task.mobilization_state === 'unscoped' || task.route === 'unset'
      ? null
      : {
          route: task.route,
          next_action: task.next_action,
          service_url: task.service_url,
          research_prompt: null, // not persisted; will appear on re-scope only
          alternates: [],         // not persisted; same
          confidence: 'medium',
          model: task.scoped_model ?? '',
        };

  function commitTitle() {
    const v = title.trim();
    if (v && v !== task.title) {
      onUpdate({ title: v });
      setSavedAt(Date.now());
    }
  }
  function commitDescription() {
    if (description !== task.description) {
      onUpdate({ description });
      setSavedAt(Date.now());
    }
  }

  const dueValue = task.due_date
    ? new Date(task.due_date).toISOString().slice(0, 10)
    : '';
  const assignee = users.find((u) => u.id === task.assignee_id) ?? null;

  return (
    <aside className="flex w-full max-w-[460px] shrink-0 flex-col border-l border-stoop-hairline bg-stoop-panel shadow-drawer">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-stoop-hairline px-5 py-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
          Task
        </span>
        <span className="flex items-center gap-1.5 text-xs text-stoop-muted">
          <span>·</span>
          <ProjectDot project={project} size={8} />
          {project.name}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          className="rounded p-1.5 text-stoop-muted hover:bg-stoop-hairline"
          aria-label="More"
        >
          <Icon.More className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="rounded p-1.5 text-stoop-muted hover:bg-stoop-hairline"
          onClick={onClose}
          aria-label="Close"
        >
          <Icon.X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-5 pb-3.5 pt-5">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-1 shrink-0"
            onClick={() => {
              const order: TaskStatus[] = ['todo', 'doing', 'blocked', 'done'];
              const next = order[(order.indexOf(task.status) + 1) % order.length];
              onUpdate({ status: next });
            }}
            aria-label="Cycle status"
          >
            <span className="block">
              <StatusDot status={task.status} />
            </span>
          </button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) =>
              e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()
            }
            className="display flex-1 bg-transparent text-[22px] leading-[1.25] outline-none"
          />
        </div>

        {/* Metadata grid */}
        <div className="mt-5 grid grid-cols-[100px_1fr] gap-x-4 gap-y-3.5 text-[13.5px]">
          <span className="text-stoop-muted">Who</span>
          <select
            className="bg-transparent text-[13.5px] outline-none"
            value={task.assignee_id ?? ''}
            onChange={(e) =>
              onUpdate({ assignee_id: e.target.value || null })
            }
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>

          <span className="text-stoop-muted">Due</span>
          <div className="flex items-center gap-2">
            <Icon.Calendar className="h-3.5 w-3.5 text-stoop-muted" />
            <input
              type="date"
              className="bg-transparent text-[13px] outline-none tabular-nums"
              value={dueValue}
              onChange={(e) => {
                if (!e.target.value) return onUpdate({ due_date: null });
                const [y, m, d] = e.target.value.split('-').map(Number);
                const local = new Date(y, m - 1, d, 12, 0, 0); // noon-local to dodge tz drift
                onUpdate({ due_date: local.getTime() });
              }}
            />
            {task.due_date && (
              <span className="text-xs text-stoop-muted">
                · <DueLabel ts={task.due_date} />
              </span>
            )}
          </div>

          <span className="text-stoop-muted">Repeat</span>
          <div className="flex items-center gap-2">
            <Icon.Repeat className="h-3.5 w-3.5 text-stoop-muted" />
            <RecurrencePicker
              task={task}
              onChange={(rule) => onUpdate({ recurrence: rule })}
            />
          </div>

          <span className="text-stoop-muted">Status</span>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => {
              const active = task.status === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onUpdate({ status: s })}
                  className={clsx(
                    'chip cursor-pointer transition-colors',
                    !active && 'hover:bg-stoop-canvas'
                  )}
                  style={{
                    background: active ? STATUS_BG[s] : 'transparent',
                    color: active ? STATUS_FG[s] : '#7A7066',
                    borderColor: active ? STATUS_BG[s] : '#EFE7DA',
                  }}
                >
                  {statusLabel(s)}
                </button>
              );
            })}
          </div>

          <span className="text-stoop-muted">Added</span>
          <span className="text-[12.5px] text-stoop-muted">
            {new Date(task.created_at).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>

        {/* Mobilization */}
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
            <span>Mobilization</span>
            <MobilizationStateChip state={task.mobilization_state} />
            <span className="flex-1" />
            {task.mobilization_state === 'scoped' && (
              <button
                type="button"
                className="text-[11px] font-medium normal-case tracking-normal text-stoop-muted hover:text-stoop-ink hover:underline"
                onClick={() => onUpdate({ mobilization_state: 'dispatched' })}
              >
                Mark dispatched
              </button>
            )}
            {task.mobilization_state === 'dispatched' && (
              <button
                type="button"
                className="text-[11px] font-medium normal-case tracking-normal text-stoop-muted hover:text-stoop-ink hover:underline"
                onClick={() => onUpdate({ mobilization_state: 'scoped' })}
              >
                Un-dispatch
              </button>
            )}
          </div>

          {task.mobilization_state === 'unscoped' ? (
            <div className="rounded-card border border-dashed border-stoop-hairline px-4 py-3.5">
              <p className="mb-2 text-[13px] text-stoop-muted">
                This task hasn't been routed yet. Ask the AI to suggest a next move.
              </p>
              <button
                type="button"
                className="btn-primary text-[12.5px]"
                onClick={() => runScope('fast')}
                disabled={scoping}
              >
                {scoping ? '✦ Reading task…' : '✦ Scope this task'}
              </button>
              {scopeError && (
                <p className="mt-2 text-[12px]" style={{ color: '#B36447' }}>
                  {scopeError}
                </p>
              )}
            </div>
          ) : persistedScope ? (
            <>
              <MobilizePanel
                scope={persistedScope}
                onThinkHarder={() => runScope('smart')}
                thinking={scoping}
              />
              {scopeError && (
                <p className="mt-2 text-[12px]" style={{ color: '#B36447' }}>
                  {scopeError}
                </p>
              )}
            </>
          ) : null}
        </div>

        {/* Notes */}
        <div className="mt-6">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
            Notes
          </div>
          <textarea
            className="min-h-[120px] w-full resize-none bg-transparent text-[14px] leading-relaxed text-stoop-ink-soft outline-none placeholder:text-stoop-muted"
            placeholder="Add some context, links, anything worth remembering."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={commitDescription}
          />
        </div>

        {assignee && (
          <div className="mt-4 flex items-center gap-2 text-xs text-stoop-muted">
            <Avatar user={assignee} size={18} />
            On {assignee.name.split(' ')[0]}.
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-stoop-hairline px-4 py-3">
        <span className="text-[12px] text-stoop-muted">
          {savedAt ? 'Saved.' : ' '}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          className="btn-ghost text-[12.5px]"
          style={{ color: '#B36447' }}
          onClick={() => {
            if (confirm('Delete this task?')) onDelete();
          }}
        >
          <Icon.Trash className="h-3 w-3" /> Delete
        </button>
      </div>
    </aside>
  );
}

function StatusDot({ status }: { status: TaskStatus }) {
  // Slightly larger checkbox-style dot used at the top of the drawer
  const size = 22;
  const fg = STATUS_FG[status];
  let inner: React.ReactNode = null;
  if (status === 'done')
    inner = (
      <Icon.Check
        className="text-white"
        style={{
          width: size * 0.65,
          height: size * 0.65,
          strokeWidth: 2.5,
        }}
      />
    );
  else if (status === 'doing')
    inner = (
      <span
        style={{
          width: size * 0.4,
          height: size * 0.4,
          background: fg,
          borderRadius: 999,
        }}
      />
    );
  else if (status === 'blocked')
    inner = <span style={{ width: size * 0.55, height: 2, background: fg }} />;

  return (
    <span
      className="inline-flex items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        border: `1.5px solid ${status === 'todo' ? '#E4DBCB' : fg}`,
        background: status === 'done' ? fg : 'transparent',
      }}
    >
      {inner}
    </span>
  );
}

function RecurrencePicker({
  task,
  onChange,
}: {
  task: Task;
  onChange: (rule: RecurrenceRule | null) => void;
}) {
  const current = parseRecurrence(task.recurrence);
  const value = ruleToPresetValue(current);
  const noDueDate = task.due_date == null;

  // "every:N" isn't selectable from the preset list (no UI for choosing N yet),
  // but if a task already has it we render its description as a disabled hint
  // so the user sees what's set rather than an empty Off.
  if (current && current.kind === 'every') {
    return (
      <span className="text-[13px] text-stoop-ink-soft">
        {describeRecurrence(current)}{' '}
        <button
          type="button"
          className="ml-1 text-[12px] text-stoop-muted underline-offset-2 hover:text-stoop-ink hover:underline"
          onClick={() => onChange(null)}
        >
          Turn off
        </button>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className="bg-transparent text-[13.5px] outline-none disabled:text-stoop-muted"
        value={value}
        disabled={noDueDate && value === 'off'}
        onChange={(e) => {
          const preset = RECURRENCE_PRESETS.find((p) => p.value === e.target.value);
          onChange(preset?.rule ?? null);
        }}
      >
        {RECURRENCE_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      {noDueDate && value === 'off' && (
        <span className="text-[11.5px] text-stoop-muted">Set a due date first</span>
      )}
    </div>
  );
}
