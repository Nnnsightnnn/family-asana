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
  created_by: string;
  created_at: number;
  updated_at: number;
};
