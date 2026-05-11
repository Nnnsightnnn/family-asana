import type { AdminStats, AdminUser, Project, ScopeResult, Task, User } from './types';

export type TaskSearchHit = Task & {
  project_name: string;
  project_color: string;
};

async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // auth
  me: () => http<{ user: User | null }>('GET', '/api/auth/me'),
  requestLink: (email: string) =>
    http<{ ok: true }>('POST', '/api/auth/request-link', { email }),
  verify: (token: string) =>
    http<{ ok: true; user: User }>('GET', `/api/auth/verify?token=${encodeURIComponent(token)}`),
  logout: () => http<{ ok: true }>('POST', '/api/auth/logout'),

  // users
  users: () => http<User[]>('GET', '/api/users'),

  // projects
  projects: () => http<Project[]>('GET', '/api/projects'),
  createProject: (data: { name: string; color?: string }) =>
    http<Project>('POST', '/api/projects', data),
  updateProject: (id: string, data: Partial<Project>) =>
    http<Project>('PATCH', `/api/projects/${id}`, data),
  deleteProject: (id: string) => http<{ ok: true }>('DELETE', `/api/projects/${id}`),

  // tasks
  tasks: (params: { project_id?: string; mine?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (params.project_id) qs.set('project_id', params.project_id);
    if (params.mine) qs.set('mine', '1');
    return http<Task[]>('GET', `/api/tasks?${qs.toString()}`);
  },
  searchTasks: (q: string, limit?: number) => {
    const qs = new URLSearchParams({ q });
    if (limit != null) qs.set('limit', String(limit));
    return http<TaskSearchHit[]>('GET', `/api/tasks/search?${qs.toString()}`);
  },
  createTask: (data: Partial<Task> & { project_id: string; title: string }) =>
    http<Task>('POST', '/api/tasks', data),
  updateTask: (id: string, data: Partial<Task>) =>
    http<Task>('PATCH', `/api/tasks/${id}`, data),
  deleteTask: (id: string) => http<{ ok: true }>('DELETE', `/api/tasks/${id}`),

  // scoping
  scope: (input: {
    title: string;
    description?: string;
    due_date?: number | null;
    tier?: 'fast' | 'smart';
  }) => http<ScopeResult>('POST', '/api/scope', input),
  scopeTask: async (
    id: string,
    tier?: 'fast' | 'smart'
  ): Promise<{ task: Task | null; scope: ScopeResult; disabled: boolean }> => {
    // Custom fetch — the server returns 503 when scoping is disabled, with a
    // structured body we want to surface as state rather than as a thrown error.
    const res = await fetch(`/api/scope/tasks/${id}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tier ? { tier } : {}),
    });
    if (res.status === 503) {
      const body = (await res.json()) as { result: ScopeResult };
      return { task: null, scope: body.result, disabled: true };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}: ${text}`);
    }
    const body = (await res.json()) as { task: Task; scope: ScopeResult };
    return { task: body.task, scope: body.scope, disabled: false };
  },

  // admin
  adminStats: () => http<AdminStats>('GET', '/api/admin/stats'),
  adminUsers: () => http<AdminUser[]>('GET', '/api/admin/users'),
  adminRevokeSessions: (userId: string) =>
    http<{ revoked: number }>('POST', `/api/admin/sessions/${userId}/revoke`),
};
