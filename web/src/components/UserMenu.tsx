import { useEffect, useRef } from 'react';

type Props = {
  onEditProfile: () => void;
  onHelp: () => void;
  onSignOut: () => void;
  onClose: () => void;
};

/**
 * UserMenu — popover anchored to the sidebar footer gear button. Opens
 * upward (the footer sits at the bottom of the sidebar) and offers two
 * actions: Edit profile and Sign out. Parent owns the relative wrapper
 * and the open/close state; this component only renders the floating
 * menu and wires up dismissal (outside-click + Escape).
 */
export default function UserMenu({ onEditProfile, onHelp, onSignOut, onClose }: Props) {
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
      aria-label="Account menu"
      className="absolute right-0 bottom-[calc(100%+4px)] z-20 w-[180px] overflow-hidden rounded-[10px] border border-stoop-hairline-2 bg-stoop-panel py-1 shadow-soft"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        className="block w-full px-3 py-1.5 text-left text-[13px] text-stoop-ink hover:bg-stoop-canvas"
        onClick={onEditProfile}
      >
        Edit profile
      </button>
      <button
        type="button"
        role="menuitem"
        className="block w-full px-3 py-1.5 text-left text-[13px] text-stoop-ink hover:bg-stoop-canvas"
        onClick={onHelp}
      >
        How AI scoping works
      </button>
      <button
        type="button"
        role="menuitem"
        className="block w-full px-3 py-1.5 text-left text-[13px] text-stoop-ink hover:bg-stoop-canvas"
        onClick={onSignOut}
      >
        Sign out
      </button>
    </div>
  );
}
