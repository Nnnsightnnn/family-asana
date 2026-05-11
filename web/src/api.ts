import type { Project, Task, User } from './types';

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
  createTask: (data: Partial<Task> & { project_id: string; title: string }) =>
    http<Task>('POST', '/api/tasks', data),
  updateTask: (id: string, data: Partial<Task>) =>
    http<Task>('PATCH', `/api/tasks/${id}`, data),
  deleteTask: (id: string) => http<{ ok: true }>('DELETE', `/api/tasks/${id}`),
};
