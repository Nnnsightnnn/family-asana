import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, type TaskSearchHit } from '../api';
import { Icon, ProjectDot } from './atoms';

/**
 * Cross-project task search. Renders an input in the Dashboard top bar; on
 * 2+ chars (debounced 200ms) it queries /api/tasks/search and shows a
 * keyboard-navigable dropdown of results. Selecting one navigates to the
 * task's project and opens the detail drawer via the ?task=<id> param.
 *
 * The input has `data-shortcut="search"` so the global `/` shortcut in
 * Dashboard.tsx focuses it (see useKeyboardShortcuts).
 */
export default function SearchBar() {
  const navigate = useNavigate();
  const [raw, setRaw] = useState('');
  const [q, setQ] = useState(''); // debounced query actually used to fetch
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Debounce 200ms.
  useEffect(() => {
    const trimmed = raw.trim();
    const t = setTimeout(() => setQ(trimmed), 200);
    return () => clearTimeout(t);
  }, [raw]);

  const enabled = q.length >= 2;

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['task-search', q],
    queryFn: () => api.searchTasks(q),
    enabled,
    staleTime: 30_000,
  });

  // Reset highlight when results change.
  useEffect(() => {
    setActive(0);
  }, [results]);

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  function pick(hit: TaskSearchHit) {
    setOpen(false);
    setRaw('');
    setQ('');
    inputRef.current?.blur();
    navigate(`/projects/${hit.project_id}?task=${hit.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length) setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length)
        setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      const hit = results[active];
      if (hit) {
        e.preventDefault();
        pick(hit);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showDropdown =
    open && enabled && (results.length > 0 || (!isFetching && q.length >= 2));

  const listboxId = useMemo(() => `search-listbox-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Icon.Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stoop-muted" />
        <input
          ref={inputRef}
          data-shortcut="search"
          type="search"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          placeholder="Search tasks…   /"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full rounded-lg border border-stoop-hairline bg-stoop-panel py-1.5 pl-8 pr-3 text-[13px] text-stoop-ink placeholder:text-stoop-muted focus:border-stoop-accent focus:outline-none focus:ring-1 focus:ring-stoop-accent"
        />
      </div>

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[60vh] overflow-auto rounded-lg border border-stoop-hairline bg-stoop-panel shadow-lg"
        >
          {results.length === 0 ? (
            <div className="px-3 py-2.5 text-[13px] text-stoop-muted">
              {isFetching ? 'Searching…' : 'No matches'}
            </div>
          ) : (
            results.map((hit, i) => (
              <button
                key={hit.id}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  // Prevent input blur before click fires.
                  e.preventDefault();
                }}
                onClick={() => pick(hit)}
                className={
                  'flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors ' +
                  (i === active
                    ? 'bg-stoop-panel-warm'
                    : 'hover:bg-stoop-panel-warm')
                }
              >
                <ProjectDot
                  project={{ color: hit.project_color }}
                  size={9}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-stoop-ink">
                    {hit.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-stoop-muted">
                    <span className="truncate">{hit.project_name}</span>
                    {hit.description ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">
                          {hit.description.length > 80
                            ? hit.description.slice(0, 80) + '…'
                            : hit.description}
                        </span>
                      </>
                    ) : null}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
