import { useEffect, useRef } from 'react';
import { Icon, ProjectDot } from './atoms';

// Palette drawn from the `stoop.*` tokens in `tailwind.config.js`.
// Eight distinct hues that read well as the small ProjectDot swatch
// on the warm cream/panel surfaces of the sidebar.
export const PROJECT_COLORS: string[] = [
  '#A86A4B', // stoop.accent — clay
  '#874F33', // stoop.accent-deep — deep clay
  '#B36447', // stoop.status-blocked — terracotta
  '#6B8A6E', // stoop.status-done — sage
  '#5A7A8E', // stoop.status-doing — slate blue
  '#6F6358', // stoop.status-todo — warm brown
  '#7A7066', // stoop.muted — warm grey
  '#1F1B17', // stoop.ink — near-black anchor
];

type Props = {
  project: { id: string; name: string; color: string };
  onRename: () => void;
  onChangeColor: (color: string) => void;
  onArchive: () => void;
  onClose: () => void;
};

/**
 * ProjectMenu — a tiny popover invoked from a sidebar project row's
 * "⋯" trigger (or right-click). Offers Rename, Change color, and
 * Archive. The parent owns positioning (relative wrapper) and the
 * open/close state; this component only renders the floating menu
 * and wires up dismissal (outside-click + Escape).
 */
export default function ProjectMenu({
  project,
  onRename,
  onChangeColor,
  onArchive,
  onClose,
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
      aria-label={`Actions for ${project.name}`}
      className="absolute right-1 top-[calc(100%-2px)] z-20 w-[184px] overflow-hidden rounded-[10px] border border-stoop-hairline-2 bg-stoop-panel py-1 shadow-soft"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        className="block w-full px-3 py-1.5 text-left text-[13px] text-stoop-ink hover:bg-stoop-canvas"
        onClick={onRename}
      >
        Rename
      </button>

      <div className="px-3 py-1.5">
        <div className="mb-1 text-[11px] uppercase tracking-[0.08em] text-stoop-muted">
          Color
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PROJECT_COLORS.map((c) => {
            const selected =
              project.color.toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                aria-label={`Set color ${c}`}
                title={c}
                onClick={() => onChangeColor(c)}
                className="inline-flex items-center justify-center rounded-md p-0.5 hover:bg-stoop-hairline/70"
                style={{
                  boxShadow: selected
                    ? 'inset 0 0 0 1.5px #1F1B17'
                    : undefined,
                }}
              >
                <ProjectDot project={{ color: c }} size={14} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="my-1 h-px bg-stoop-hairline" />

      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-stoop-canvas"
        style={{ color: '#B36447' }}
        onClick={onArchive}
      >
        <Icon.Trash className="h-3 w-3" /> Archive
      </button>
    </div>
  );
}
