import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { User } from '../types';
import { Avatar, Icon } from './atoms';

type Props = {
  users: User[];
  currentUser: User;
  onClose: () => void;
  onNavigate: () => void;
};

export default function HouseholdMenu({
  users,
  currentUser,
  onClose,
  onNavigate,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Household"
      className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-[10px] border border-stoop-hairline-2 bg-stoop-panel py-1 shadow-soft"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 pb-1.5 pt-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
          Household
        </div>
        <div className="text-[11.5px] text-stoop-muted">
          {users.length} member{users.length === 1 ? '' : 's'}
        </div>
      </div>
      <ul className="max-h-[240px] overflow-auto">
        {users.map((u) => (
          <li
            key={u.id}
            className="flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-stoop-ink"
          >
            <Avatar user={u} size={22} />
            <span className="min-w-0 flex-1 truncate">{u.name}</span>
            {u.id === currentUser.id && (
              <span className="text-[11px] text-stoop-muted">You</span>
            )}
          </li>
        ))}
      </ul>
      <div className="my-1 h-px bg-stoop-hairline" />
      <Link
        to="/admin"
        role="menuitem"
        onClick={onNavigate}
        className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-stoop-ink hover:bg-stoop-canvas"
      >
        <Icon.Settings className="h-3.5 w-3.5 text-stoop-muted" />
        Manage household
      </Link>
    </div>
  );
}
