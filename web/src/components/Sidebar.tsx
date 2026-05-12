import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '../api';
import type { Project, User } from '../types';
import { Avatar, Icon, ProjectDot } from './atoms';
import HouseholdMenu from './HouseholdMenu';
import ProjectMenu from './ProjectMenu';
import ProfileModal from './ProfileModal';
import UserMenu from './UserMenu';
import HelpModal from './HelpModal';

type Props = {
  projects: Project[];
  users: User[];
  currentUser: User;
  onLogout: () => void;
  open: boolean;
  onClose: () => void;
};

export default function Sidebar({
  projects,
  users,
  currentUser,
  onLogout,
  open,
  onClose,
}: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [householdMenuOpen, setHouseholdMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const createProject = useMutation({
    mutationFn: (n: string) => api.createProject({ name: n }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setName('');
      setAdding(false);
    },
  });

  const renameProject = useMutation({
    mutationFn: ({ id, n }: { id: string; n: string }) =>
      api.updateProject(id, { name: n }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setRenamingId(null);
    },
  });

  const recolorProject = useMutation({
    mutationFn: ({ id, color }: { id: string; color: string }) =>
      api.updateProject(id, { color }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setMenuId(null);
      if (location.pathname === `/projects/${id}`) navigate('/my-tasks');
    },
  });

  return (
    <aside
      className={clsx(
        'fixed z-30 flex h-full w-[248px] shrink-0 flex-col border-r border-stoop-hairline bg-stoop-panel-warm p-[18px] transition-transform md:static md:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      {/* House identity */}
      <div className="relative pb-2.5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setHouseholdMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={householdMenuOpen}
            className="-mx-1 flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-1 py-1 text-left transition-colors hover:bg-stoop-hairline/50"
          >
            <span className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-stoop-accent text-white">
              <Icon.Home className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium leading-tight">Family</div>
              <div className="text-[11.5px] text-stoop-muted">
                {users.length} of us
              </div>
            </div>
          </button>
          <button
            className="text-stoop-muted hover:text-stoop-ink md:hidden"
            onClick={onClose}
            aria-label="Close menu"
          >
            <Icon.X className="h-4 w-4" />
          </button>
        </div>
        {householdMenuOpen && (
          <HouseholdMenu
            users={users}
            currentUser={currentUser}
            onClose={() => setHouseholdMenuOpen(false)}
            onNavigate={() => {
              setHouseholdMenuOpen(false);
              onClose();
            }}
          />
        )}
      </div>

      {/* Top nav */}
      <nav className="mt-4 flex flex-col gap-0.5">
        <SidebarLink
          to="/my-tasks"
          icon={<Icon.CheckCircle className="h-4 w-4" />}
          label="My tasks"
        />
        <SidebarLink
          to="/calendar"
          icon={<Icon.Calendar className="h-4 w-4" />}
          label="Calendar"
        />
      </nav>

      {/* Projects */}
      <div className="mt-5 flex items-center justify-between px-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
          Projects
        </span>
        <button
          className="rounded p-1 text-stoop-muted hover:bg-stoop-hairline"
          onClick={() => setAdding(true)}
          aria-label="Add project"
        >
          <Icon.Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <ul className="mt-1.5 flex-1 space-y-0.5 overflow-auto">
        {projects.map((p) => (
          <li key={p.id}>
            {renamingId === p.id ? (
              <RenameRow
                initial={p.name}
                onCommit={(v) => {
                  const trimmed = v.trim();
                  if (trimmed && trimmed !== p.name)
                    renameProject.mutate({ id: p.id, n: trimmed });
                  else setRenamingId(null);
                }}
                onCancel={() => setRenamingId(null)}
              />
            ) : (
              <ProjectRow
                project={p}
                menuOpen={menuId === p.id}
                onOpenMenu={() => setMenuId(p.id)}
                onCloseMenu={() => setMenuId(null)}
                onNavClick={onClose}
                onRename={() => {
                  setMenuId(null);
                  setRenamingId(p.id);
                }}
                onChangeColor={(color) => {
                  recolorProject.mutate({ id: p.id, color });
                }}
                onArchive={() => {
                  if (
                    confirm(
                      `Archive "${p.name}"? It will be hidden from the sidebar; tasks stay in the database.`
                    )
                  ) {
                    deleteProject.mutate(p.id);
                  }
                }}
              />
            )}
          </li>
        ))}
        {adding && (
          <li className="px-1 py-1">
            <input
              autoFocus
              className="input-shell py-1.5 text-sm"
              placeholder="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim())
                  createProject.mutate(name.trim());
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
        <li>
          <button
            type="button"
            className="mt-0.5 flex w-full items-center gap-1.5 rounded-[10px] px-2.5 py-[7px] text-left text-[13.5px] text-stoop-muted hover:bg-stoop-hairline/60"
            onClick={() => setAdding(true)}
          >
            <Icon.Plus className="h-3 w-3" />
            Add a project
          </button>
        </li>
      </ul>

      {/* User footer */}
      <div className="mt-3 flex items-center gap-2.5 border-t border-stoop-hairline pt-3">
        <Avatar user={currentUser} size={26} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">
            {currentUser.name}
          </div>
          <div className="truncate text-[11.5px] text-stoop-muted">
            {currentUser.email}
          </div>
        </div>
        <div className="relative">
          <button
            className="rounded p-1.5 text-stoop-muted hover:bg-stoop-hairline"
            onClick={() => setUserMenuOpen((v) => !v)}
            aria-label="Account menu"
            title="Account"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
          >
            <Icon.Settings className="h-3.5 w-3.5" />
          </button>
          {userMenuOpen && (
            <UserMenu
              onEditProfile={() => {
                setUserMenuOpen(false);
                setProfileOpen(true);
              }}
              onHelp={() => {
                setUserMenuOpen(false);
                setHelpOpen(true);
              }}
              onSignOut={() => {
                setUserMenuOpen(false);
                onLogout();
              }}
              onClose={() => setUserMenuOpen(false)}
            />
          )}
        </div>
      </div>
      {profileOpen && (
        <ProfileModal
          user={currentUser}
          onClose={() => setProfileOpen(false)}
        />
      )}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </aside>
  );
}

function ProjectRow({
  project,
  menuOpen,
  onOpenMenu,
  onCloseMenu,
  onNavClick,
  onRename,
  onChangeColor,
  onArchive,
}: {
  project: Project;
  menuOpen: boolean;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onNavClick: () => void;
  onRename: () => void;
  onChangeColor: (color: string) => void;
  onArchive: () => void;
}) {
  return (
    <div
      className="group relative"
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenMenu();
      }}
    >
      <NavLink
        to={`/projects/${project.id}`}
        onClick={onNavClick}
        className={({ isActive }) =>
          clsx(
            'flex items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] pr-7 text-[13.5px] transition-colors',
            isActive
              ? 'bg-stoop-canvas font-medium shadow-[inset_0_0_0_1px_theme(colors.stoop.hairline)]'
              : 'text-stoop-ink-soft hover:bg-stoop-hairline/60'
          )
        }
      >
        <ProjectDot project={project} />
        <span className="flex-1 truncate">{project.name}</span>
        {typeof project.task_count === 'number' &&
          typeof project.done_count === 'number' && (
            <span className="text-[11px] tabular-nums text-stoop-muted">
              {Math.max(0, project.task_count - project.done_count)}
            </span>
          )}
      </NavLink>
      <button
        type="button"
        aria-label={`More for ${project.name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (menuOpen) onCloseMenu();
          else onOpenMenu();
        }}
        className={clsx(
          'absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-stoop-muted transition-opacity hover:bg-stoop-hairline',
          menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
        )}
      >
        <Icon.More className="h-3.5 w-3.5" />
      </button>
      {menuOpen && (
        <ProjectMenu
          project={project}
          onRename={onRename}
          onChangeColor={(color) => {
            onChangeColor(color);
            onCloseMenu();
          }}
          onArchive={() => {
            onArchive();
          }}
          onClose={onCloseMenu}
        />
      )}
    </div>
  );
}

function RenameRow({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="px-1 py-1">
      <input
        autoFocus
        className="input-shell py-1.5 text-sm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit(value);
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={() => onCommit(value)}
      />
    </div>
  );
}

function SidebarLink({
  to,
  icon,
  label,
  count,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  count?: string | number;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13.5px] transition-colors',
          isActive
            ? 'bg-stoop-canvas font-medium shadow-[inset_0_0_0_1px_theme(colors.stoop.hairline)]'
            : 'text-stoop-ink-soft hover:bg-stoop-hairline/60'
        )
      }
    >
      <span className="flex text-stoop-muted">{icon}</span>
      <span className="flex-1">{label}</span>
      {count !== undefined && (
        <span className="text-[11px] tabular-nums text-stoop-muted">
          {count}
        </span>
      )}
    </NavLink>
  );
}
