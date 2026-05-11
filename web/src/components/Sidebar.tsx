import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '../api';
import type { Project, User } from '../types';

type Props = {
  projects: Project[];
  currentUser: User;
  onLogout: () => void;
  open: boolean;
  onClose: () => void;
};

export default function Sidebar({ projects, currentUser, onLogout, open, onClose }: Props) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const createProject = useMutation({
    mutationFn: (n: string) => api.createProject({ name: n }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setName('');
      setAdding(false);
    },
  });

  return (
    <aside
      className={clsx(
        'fixed z-30 flex h-full w-64 shrink-0 flex-col border-r border-asana-line bg-white p-3 transition-transform md:static md:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <div className="mb-4 flex items-center gap-2 px-2 pt-1">
        <div className="h-6 w-6 rounded-md bg-asana-blue" />
        <span className="font-semibold">Family Asana</span>
        <button className="ml-auto btn-ghost md:hidden" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <nav className="space-y-0.5 px-1">
        <SidebarLink to="/my-tasks" label="My tasks" icon="✓" />
      </nav>

      <div className="mt-5 flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wide text-asana-slate">
        <span>Projects</span>
        <button
          className="rounded p-1 text-asana-slate hover:bg-asana-line"
          onClick={() => setAdding(true)}
          aria-label="Add project"
        >
          +
        </button>
      </div>

      <ul className="mt-1 flex-1 space-y-0.5 overflow-auto px-1">
        {projects.map((p) => (
          <li key={p.id}>
            <NavLink
              to={`/projects/${p.id}`}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-asana-line',
                  isActive && 'bg-asana-line font-medium'
                )
              }
            >
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-sm"
                style={{ background: p.color }}
              />
              <span className="truncate">{p.name}</span>
            </NavLink>
          </li>
        ))}
        {adding && (
          <li className="px-2 py-1">
            <input
              autoFocus
              className="input py-1 text-sm"
              placeholder="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) createProject.mutate(name.trim());
                if (e.key === 'Escape') {
                  setAdding(false);
                  setName('');
                }
              }}
              onBlur={() => {
                if (name.trim()) createProject.mutate(name.trim());
                else setAdding(false);
              }}
            />
          </li>
        )}
      </ul>

      <div className="mt-3 border-t border-asana-line pt-3">
        <div className="flex items-center gap-2 px-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ background: currentUser.avatar_color }}
          >
            {currentUser.name.charAt(0).toUpperCase()}
          </span>
          <span className="truncate text-sm">{currentUser.name}</span>
          <button className="ml-auto btn-ghost text-xs" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-asana-line',
          isActive && 'bg-asana-line font-medium'
        )
      }
    >
      <span className="text-asana-slate">{icon}</span>
      {label}
    </NavLink>
  );
}
