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

export type ScopeResult = {
  route: Route;
  next_action: string | null;
  service_url: string | null;
  research_prompt: string | null;
  alternates: ScopeAlternate[];
  confidence: 'low' | 'medium' | 'high';
  model: string;
  disabled?: true;
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
  created_by: string;
  created_at: number;
  updated_at: number;
};
