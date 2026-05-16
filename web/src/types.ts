export type User = {
  id: string;
  email: string;
  name: string;
  avatar_color: string;
};

export type Project = {
  id: string;
  name: string;
  color: string;
  archived_at: number | null;
  created_by: string;
  created_at: number;
  updated_at: number;
  task_count?: number;
  done_count?: number;
};

export type TaskStatus = 'todo' | 'doing' | 'done' | 'blocked';

export type Route =
  | 'unset'
  | 'diy'
  | 'delegate'
  | 'outsource'
  | 'buy'
  | 'schedule'
  | 'research'
  | 'drop';

export type MobilizationState = 'unscoped' | 'scoped' | 'dispatched' | 'resolved';

export type ScopeAlternate = { label: string; url?: string | null };

export type ScopeDisabledReason = 'no_key' | 'api_error' | 'empty_response' | 'parse_error';

export type ScopeResult = {
  route: Route;
  next_action: string | null;
  service_url: string | null;
  research_prompt: string | null;
  alternates: ScopeAlternate[];
  confidence: 'low' | 'medium' | 'high';
  model: string;
  disabled?: true;
  disabled_reason?: ScopeDisabledReason;
};

// Free-form planning ("Plan with AI" FAB). One of three shapes plus a
// disabled variant the server returns when AI isn't configured.
export type PlanTask = {
  title: string;
  route: Exclude<Route, 'unset'>;
  next_action: string | null;
  service_url: string | null;
};

export type PlanResult =
  | { disabled: true; disabled_reason: ScopeDisabledReason; model: string }
  | {
      disabled?: false;
      model: string;
      kind: 'task';
      task: PlanTask & {
        confidence: 'low' | 'medium' | 'high';
        research_prompt?: string | null;
      };
    }
  | { disabled?: false; model: string; kind: 'task_list'; tasks: PlanTask[] }
  | {
      disabled?: false;
      model: string;
      kind: 'project';
      project: { name: string; color: string };
      tasks: PlanTask[];
    };

export type ProjectPhoto = {
  id: string;
  project_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  caption: string | null;
  uploaded_by: string;
  created_at: number;
};

export type AdminStats = {
  users_total: number;
  tasks_total: number;
  tasks_last_7d: number;
  tasks_resolved_7d: number;
  projects_total: number;
};

export type AdminUser = User & {
  created_at: number;
  last_session_at: number | null;
  active_sessions: number;
};

export type RecurrenceRule =
  | { kind: 'daily' }
  | { kind: 'weekdays' }
  | { kind: 'weekly' }
  | { kind: 'monthly' }
  | { kind: 'yearly' }
  | { kind: 'every'; n: number; unit: 'day' };

export type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignee_id: string | null;
  due_date: number | null;
  position: number;
  parent_id: string | null;
  completed_at: number | null;
  route: Route;
  mobilization_state: MobilizationState;
  next_action: string | null;
  service_url: string | null;
  scoped_at: number | null;
  scoped_model: string | null;
  /** JSON-encoded RecurrenceRule, or null for one-shot tasks. */
  recurrence: string | null;
  created_by: string;
  created_at: number;
  updated_at: number;
};

export function parseRecurrence(raw: string | null): RecurrenceRule | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || typeof v.kind !== 'string') return null;
    if (v.kind === 'every') {
      if (typeof v.n !== 'number' || v.n < 1 || v.unit !== 'day') return null;
      return { kind: 'every', n: v.n, unit: 'day' };
    }
    if (['daily', 'weekdays', 'weekly', 'monthly', 'yearly'].includes(v.kind)) {
      return { kind: v.kind } as RecurrenceRule;
    }
    return null;
  } catch {
    return null;
  }
}

export function describeRecurrence(rule: RecurrenceRule): string {
  switch (rule.kind) {
    case 'daily':
      return 'Daily';
    case 'weekdays':
      return 'Weekdays';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    case 'yearly':
      return 'Yearly';
    case 'every':
      return `Every ${rule.n} days`;
  }
}
