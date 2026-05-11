import { useMemo, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { User } from '../types';
import Sidebar from '../components/Sidebar';
import ProjectView from '../components/ProjectView';
import MyTasks from '../components/MyTasks';
import CalendarView from '../components/CalendarView';
import { Icon } from '../components/atoms';
import SearchBar from '../components/SearchBar';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';

export default function Dashboard({ user }: { user: User }) {
  const qc = useQueryClient();
  // Global shortcuts: `n` focuses the add-task input; `/` focuses search if present;
  // `Escape` asks any open drawer to close via a custom event.
  // j/k row navigation is deferred (see hook for TODO).
  const shortcuts = useMemo(
    () => [
      {
        key: 'n',
        handler: (e: KeyboardEvent) => {
          const el = document.querySelector<HTMLElement>(
            '[data-shortcut="new-task"]'
          );
          if (el) {
            e.preventDefault();
            el.focus();
          }
        },
      },
      {
        key: '/',
        handler: (e: KeyboardEvent) => {
          const el = document.querySelector<HTMLElement>(
            '[data-shortcut="search"]'
          );
          if (el) {
            e.preventDefault();
            el.focus();
          }
        },
      },
      {
        key: 'Escape',
        whenInput: true,
        handler: () => {
          window.dispatchEvent(new CustomEvent('fa:close-drawer'));
        },
      },
    ],
    []
  );
  useKeyboardShortcuts(shortcuts);
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: api.projects,
  });
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: api.users,
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function logout() {
    await api.logout();
    qc.clear();
    window.location.href = '/login';
  }

  return (
    <div className="flex h-full">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-stoop-ink/30 backdrop-blur-[2px] md:hidden"
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
        {/* Mobile-only quick bar — surfaces render their own headers underneath */}
        <div className="flex h-12 items-center gap-3 border-b border-stoop-hairline bg-stoop-canvas px-4 md:hidden">
          <button
            className="btn-ghost px-2 py-1"
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
          >
            <Icon.Menu className="h-5 w-5" />
          </button>
          <span className="display text-base">Family</span>
          <span className="flex-1" />
          <div className="min-w-0 flex-1">
            <SearchBar />
          </div>
        </div>

        {/* Desktop top bar — holds the cross-project search input */}
        <div className="hidden h-12 items-center gap-3 border-b border-stoop-hairline bg-stoop-canvas px-6 md:flex">
          <span className="flex-1" />
          <SearchBar />
        </div>

        <div className="min-h-0 flex-1">
          <Routes>
            <Route path="/" element={<Navigate to="/my-tasks" replace />} />
            <Route
              path="/my-tasks"
              element={<MyTasks user={user} users={users} projects={projects} />}
            />
            <Route
              path="/calendar"
              element={<CalendarView projects={projects} users={users} />}
            />
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
