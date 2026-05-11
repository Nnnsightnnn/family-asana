import { useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { User } from '../types';
import Sidebar from '../components/Sidebar';
import ProjectView from '../components/ProjectView';
import MyTasks from '../components/MyTasks';

export default function Dashboard({ user }: { user: User }) {
  const qc = useQueryClient();
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: api.projects });
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: api.users });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function logout() {
    await api.logout();
    qc.clear();
    window.location.href = '/login';
  }

  return (
    <div className="flex h-full">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar
        projects={projects}
        currentUser={user}
        onLogout={logout}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center gap-3 border-b border-asana-line bg-white px-4 md:px-6">
          <button
            className="btn-ghost md:hidden"
            aria-label="Open sidebar"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <span className="text-sm text-asana-slate">Family Asana</span>
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/my-tasks" replace />} />
            <Route path="/my-tasks" element={<MyTasks user={user} users={users} projects={projects} />} />
            <Route
              path="/projects/:projectId"
              element={<ProjectRoute users={users} />}
            />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function ProjectRoute({ users }: { users: User[] }) {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) return null;
  return <ProjectView projectId={projectId} users={users} />;
}
