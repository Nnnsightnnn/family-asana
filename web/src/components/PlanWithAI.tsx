import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { api } from '../api';
import type { PlanResult, PlanTask, Project, User } from '../types';
import { Icon, ProjectDot, RouteChip, AVATAR_COLORS, SwatchRow } from './atoms';

type Props = {
  projects: Project[];
  users: User[];
  defaultProjectId: string;
  onClose: () => void;
  /** Called with the created task IDs so the parent can refresh queries. */
  onCreated: (info: { taskIds: string[]; projectId: string }) => void;
};

const PLAN_DEBOUNCE_MS = 600;

const EXAMPLES = [
  'Kitchen sink is leaking — needs a plumber by Saturday',
  'Vacuum living room, take out trash, water the plants',
  'Plan a small backyard birthday for Sam — May 26',
];

export default function PlanWithAI({
  projects,
  users: _users,
  defaultProjectId,
  onClose,
  onCreated,
}: Props) {
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [planning, setPlanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selection state — which proposed tasks are checked in. Indexed by array
  // position; for kind='task' this is just a boolean flag.
  const [includeSet, setIncludeSet] = useState<Set<number>>(new Set());

  // Project-kind editable fields (user can override the AI's suggestion).
  const [projectName, setProjectName] = useState('');
  const [projectColor, setProjectColor] = useState<string>(AVATAR_COLORS[0]);

  // task_list kind needs a destination project.
  const [destProjectId, setDestProjectId] = useState<string>(defaultProjectId);

  const textRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastPlannedRef = useRef<string>('');

  useEffect(() => {
    textRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Debounced planning.
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed.length < 5) {
      setPlan(null);
      setPlanning(false);
      return;
    }
    if (trimmed === lastPlannedRef.current) return;

    const timer = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;
      setPlanning(true);
      setError(null);
      api
        .plan({ text: trimmed, project_id: defaultProjectId })
        .then((result) => {
          if (controller.signal.aborted) return;
          setPlan(result);
          lastPlannedRef.current = trimmed;
          // initialize include-set + project fields based on the new plan
          if (!result.disabled) {
            if (result.kind === 'task') {
              setIncludeSet(new Set([0]));
            } else {
              setIncludeSet(new Set(result.tasks.map((_, i) => i)));
            }
            if (result.kind === 'project') {
              setProjectName(result.project.name);
              setProjectColor(result.project.color);
            }
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError((e as Error).message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setPlanning(false);
        });
    }, PLAN_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [text, defaultProjectId]);

  function toggleInclude(i: number) {
    setIncludeSet((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function submit() {
    if (!plan || plan.disabled) return;
    setSubmitting(true);
    setError(null);
    try {
      if (plan.kind === 'task') {
        if (!includeSet.has(0)) {
          // shouldn't happen but bail rather than create a phantom task
          onClose();
          return;
        }
        const t = plan.task;
        const created = await api.createTask({
          project_id: destProjectId,
          title: t.title,
          route: t.route,
          next_action: t.next_action,
          service_url: t.service_url,
          scoped_model: plan.model || null,
        });
        onCreated({ taskIds: [created.id], projectId: destProjectId });
      } else if (plan.kind === 'task_list') {
        const picks = plan.tasks
          .map((t, i) => ({ t, i }))
          .filter(({ i }) => includeSet.has(i));
        const created = await Promise.all(
          picks.map(({ t }) =>
            api.createTask({
              project_id: destProjectId,
              title: t.title,
              route: t.route,
              next_action: t.next_action,
              service_url: t.service_url,
              scoped_model: plan.model || null,
            })
          )
        );
        onCreated({ taskIds: created.map((c) => c.id), projectId: destProjectId });
      } else {
        // kind === 'project'
        const proj = await api.createProject({
          name: projectName.trim() || plan.project.name,
          color: projectColor,
        });
        const picks = plan.tasks
          .map((t, i) => ({ t, i }))
          .filter(({ i }) => includeSet.has(i));
        const created = await Promise.all(
          picks.map(({ t }) =>
            api.createTask({
              project_id: proj.id,
              title: t.title,
              route: t.route,
              next_action: t.next_action,
              service_url: t.service_url,
              scoped_model: plan.model || null,
            })
          )
        );
        onCreated({ taskIds: created.map((c) => c.id), projectId: proj.id });
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  const disabled = !!plan?.disabled;
  const ready = !!plan && !disabled && !planning && includedCount(plan, includeSet) > 0;
  const summary = plan && !plan.disabled ? planSummary(plan, includeSet) : null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-stoop-ink/30 px-4 pt-[10vh] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[600px] rounded-card border border-stoop-hairline bg-stoop-panel shadow-soft"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Plan with AI"
      >
        <div className="flex items-center gap-2.5 border-b border-stoop-hairline px-5 py-3.5">
          <span className="display-italic text-stoop-accent-deep" aria-hidden>
            ✦
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
            Plan with AI
          </span>
          {planning && (
            <span className="text-[11px] text-stoop-muted">thinking…</span>
          )}
          <span className="flex-1" />
          <button
            type="button"
            className="rounded p-1.5 text-stoop-muted hover:bg-stoop-hairline"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon.X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto px-5 py-4">
          <p className="m-0 text-[13px] leading-relaxed text-stoop-muted">
            Type a single task, a quick list, or a whole project — the AI will
            figure out the shape and route each task.
          </p>

          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Kitchen renovation — new cabinets, find a tile installer, paint, replace flooring"
            rows={4}
            className="mt-3 w-full resize-y rounded-card border border-stoop-hairline bg-stoop-panel-warm/40 p-3 text-[14px] leading-relaxed text-stoop-ink outline-none placeholder:text-stoop-muted focus:border-stoop-hairline-2"
          />

          {text.trim().length === 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.08em] text-stoop-muted">
                Try
              </span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setText(ex);
                    textRef.current?.focus();
                  }}
                  className="rounded-full border border-stoop-hairline bg-stoop-panel-warm/60 px-2.5 py-1 text-[12px] text-stoop-muted hover:bg-stoop-panel-warm hover:text-stoop-ink"
                >
                  {ex.length > 38 ? ex.slice(0, 38) + '…' : ex}
                </button>
              ))}
            </div>
          )}

          {/* Preview */}
          {disabled && (
            <div className="mt-4 rounded-card border border-stoop-hairline bg-stoop-canvas px-4 py-3 text-[13px] text-stoop-ink-soft">
              {disabledMessage(plan)}
            </div>
          )}

          {plan && !plan.disabled && (
            <div className="mt-5">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
                <span>Preview</span>
                <span className="lowercase tracking-normal text-stoop-muted">
                  · {summary}
                </span>
              </div>

              {plan.kind === 'task' && (
                <SingleTaskPreview
                  task={plan.task}
                  destProjectId={destProjectId}
                  projects={projects}
                  onProjectChange={setDestProjectId}
                  included={includeSet.has(0)}
                  onToggle={() => toggleInclude(0)}
                />
              )}

              {plan.kind === 'task_list' && (
                <TaskListPreview
                  tasks={plan.tasks}
                  projects={projects}
                  destProjectId={destProjectId}
                  onProjectChange={setDestProjectId}
                  includeSet={includeSet}
                  onToggle={toggleInclude}
                />
              )}

              {plan.kind === 'project' && (
                <ProjectPreview
                  tasks={plan.tasks}
                  projectName={projectName}
                  onProjectName={setProjectName}
                  projectColor={projectColor}
                  onProjectColor={setProjectColor}
                  includeSet={includeSet}
                  onToggle={toggleInclude}
                />
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm" style={{ color: '#B36447' }}>{error}</p>}
        </div>

        <div className="flex items-center gap-2 border-t border-stoop-hairline px-4 py-3">
          <span className="text-[12px] text-stoop-muted">
            Esc to cancel · 5+ chars to plan
          </span>
          <span className="flex-1" />
          <button
            type="button"
            className="btn-ghost text-[12.5px]"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary text-[12.5px]"
            onClick={submit}
            disabled={!ready || submitting}
          >
            {submitting ? 'Creating…' : ctaLabel(plan, includeSet)}
          </button>
        </div>
      </div>
    </div>
  );
}

function disabledMessage(plan: PlanResult | null): string {
  if (!plan || !plan.disabled) return '';
  switch (plan.disabled_reason) {
    case 'no_key':
      return 'AI planning isn\'t configured on this server. Use the regular "+ Add task" button to create tasks without AI.';
    case 'api_error':
      return 'The AI service is unreachable right now. Try again in a moment, or use the regular "+ Add task" button.';
    case 'empty_response':
    case 'parse_error':
      return 'The AI returned a response we couldn\'t parse. Try rephrasing in a bit more detail, or use the regular "+ Add task" button.';
    default:
      return 'AI is unavailable right now. Use the regular "+ Add task" button.';
  }
}

function includedCount(plan: PlanResult, set: Set<number>): number {
  if (!plan || plan.disabled) return 0;
  if (plan.kind === 'task') return set.has(0) ? 1 : 0;
  return plan.tasks.filter((_, i) => set.has(i)).length;
}

function planSummary(plan: Exclude<PlanResult, { disabled: true }>, set: Set<number>): string {
  if (plan.kind === 'task') return 'a single task';
  const n = plan.tasks.filter((_, i) => set.has(i)).length;
  if (plan.kind === 'project') return `a new project + ${n} task${n === 1 ? '' : 's'}`;
  return `${n} task${n === 1 ? '' : 's'} in one project`;
}

function ctaLabel(plan: PlanResult | null, set: Set<number>): string {
  if (!plan || plan.disabled) return 'Create';
  if (plan.kind === 'task') return 'Create task';
  const n = plan.tasks.filter((_, i) => set.has(i)).length;
  if (plan.kind === 'project') return `Create project + ${n}`;
  return `Create ${n} task${n === 1 ? '' : 's'}`;
}

// ── Preview sub-views ───────────────────────────────────────────────

function TaskRow({
  task,
  included,
  onToggle,
}: {
  task: PlanTask;
  included: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex items-start gap-3 py-2">
      <input
        type="checkbox"
        className="mt-1.5 h-3.5 w-3.5 accent-stoop-accent"
        checked={included}
        onChange={onToggle}
        aria-label={`Include "${task.title}"`}
      />
      <div className="min-w-0 flex-1">
        <div className={clsx('flex items-center gap-2', !included && 'opacity-50')}>
          <RouteChip route={task.route} />
          <span className="truncate text-[14px] text-stoop-ink">{task.title}</span>
        </div>
        {task.next_action && (
          <p className={clsx('mt-1 text-[12.5px] leading-snug text-stoop-muted', !included && 'opacity-50')}>
            {task.next_action}
          </p>
        )}
        {task.service_url && included && (
          <a
            href={task.service_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-[12px] text-stoop-muted underline-offset-2 hover:text-stoop-ink hover:underline"
          >
            {hostnameOf(task.service_url)} ↗
          </a>
        )}
      </div>
    </li>
  );
}

function SingleTaskPreview({
  task,
  destProjectId,
  projects,
  onProjectChange,
  included,
  onToggle,
}: {
  task: PlanTask & { confidence: 'low' | 'medium' | 'high'; research_prompt?: string | null };
  destProjectId: string;
  projects: Project[];
  onProjectChange: (id: string) => void;
  included: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-card border border-stoop-hairline bg-stoop-panel-warm/40 px-3.5 py-2.5">
      <ul className="m-0 list-none p-0">
        <TaskRow task={task} included={included} onToggle={onToggle} />
      </ul>
      <ProjectPicker
        projects={projects}
        value={destProjectId}
        onChange={onProjectChange}
        label="Save in"
      />
    </div>
  );
}

function TaskListPreview({
  tasks,
  projects,
  destProjectId,
  onProjectChange,
  includeSet,
  onToggle,
}: {
  tasks: PlanTask[];
  projects: Project[];
  destProjectId: string;
  onProjectChange: (id: string) => void;
  includeSet: Set<number>;
  onToggle: (i: number) => void;
}) {
  return (
    <div className="rounded-card border border-stoop-hairline bg-stoop-panel-warm/40 px-3.5 py-2.5">
      <ul className="m-0 list-none divide-y divide-stoop-hairline p-0">
        {tasks.map((t, i) => (
          <TaskRow
            key={i}
            task={t}
            included={includeSet.has(i)}
            onToggle={() => onToggle(i)}
          />
        ))}
      </ul>
      <ProjectPicker
        projects={projects}
        value={destProjectId}
        onChange={onProjectChange}
        label="Save all in"
      />
    </div>
  );
}

function ProjectPreview({
  tasks,
  projectName,
  onProjectName,
  projectColor,
  onProjectColor,
  includeSet,
  onToggle,
}: {
  tasks: PlanTask[];
  projectName: string;
  onProjectName: (n: string) => void;
  projectColor: string;
  onProjectColor: (c: string) => void;
  includeSet: Set<number>;
  onToggle: (i: number) => void;
}) {
  return (
    <div className="rounded-card border border-stoop-hairline bg-stoop-panel-warm/40 px-3.5 py-3">
      <div className="mb-2 flex items-center gap-2.5">
        <span
          className="inline-block shrink-0 rounded"
          style={{ width: 12, height: 12, background: projectColor }}
        />
        <input
          type="text"
          value={projectName}
          onChange={(e) => onProjectName(e.target.value)}
          className="flex-1 bg-transparent text-[15px] font-medium outline-none"
          placeholder="Project name"
        />
      </div>
      <SwatchRow value={projectColor} onChange={onProjectColor} colors={AVATAR_COLORS} />
      <div className="mt-3 border-t border-stoop-hairline pt-2">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
          Initial tasks
        </div>
        <ul className="m-0 list-none divide-y divide-stoop-hairline p-0">
          {tasks.map((t, i) => (
            <TaskRow
              key={i}
              task={t}
              included={includeSet.has(i)}
              onToggle={() => onToggle(i)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function ProjectPicker({
  projects,
  value,
  onChange,
  label,
}: {
  projects: Project[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div className="mt-3 flex items-center gap-2 border-t border-stoop-hairline pt-2 text-[12.5px]">
      <span className="text-stoop-muted">{label}</span>
      {projects.find((p) => p.id === value) && (
        <ProjectDot project={projects.find((p) => p.id === value)!} size={9} />
      )}
      <select
        className="flex-1 bg-transparent text-[12.5px] outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}
