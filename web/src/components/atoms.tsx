import type { CSSProperties, ReactNode, SVGProps } from 'react';
import type { MobilizationState, Project, Route, TaskStatus, User } from '../types';

// ── Icons (minimal line set) ────────────────────────────────────────
type IconProps = SVGProps<SVGSVGElement>;
const makeIcon = (paths: ReactNode, vb = '0 0 24 24') =>
  function I(props: IconProps) {
    return (
      <svg
        viewBox={vb}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        {paths}
      </svg>
    );
  };

export const Icon = {
  Check: makeIcon(<path d="M5 12.5l4.5 4.5L19 7" />),
  CheckCircle: makeIcon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </>
  ),
  Plus: makeIcon(
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  Search: makeIcon(
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  Calendar: makeIcon(
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  Mail: makeIcon(
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 6.5 8.5 7 8.5-7" />
    </>
  ),
  Home: makeIcon(
    <>
      <path d="M3 11 12 3l9 8" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  List: makeIcon(
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="5" cy="6" r="0.8" fill="currentColor" />
      <circle cx="5" cy="12" r="0.8" fill="currentColor" />
      <circle cx="5" cy="18" r="0.8" fill="currentColor" />
    </>
  ),
  Board: makeIcon(
    <>
      <rect x="3" y="4" width="6" height="16" rx="1.5" />
      <rect x="11" y="4" width="6" height="11" rx="1.5" />
      <rect x="19" y="4" width="2" height="7" rx="1" />
    </>,
    '0 0 22 24'
  ),
  Settings: makeIcon(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  X: makeIcon(
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  Chevron: makeIcon(<path d="m9 6 6 6-6 6" />),
  ChevronD: makeIcon(<path d="m6 9 6 6 6-6" />),
  Menu: makeIcon(
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  Trash: makeIcon(
    <>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13" />
      <path d="M9 7V4h6v3" />
    </>
  ),
  More: makeIcon(
    <>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  Filter: makeIcon(<path d="M4 5h16l-6 8v6l-4-2v-4z" />),
  Repeat: makeIcon(
    <>
      <path d="M4 12V9a3 3 0 0 1 3-3h11" />
      <path d="m15 3 3 3-3 3" />
      <path d="M20 12v3a3 3 0 0 1-3 3H6" />
      <path d="m9 21-3-3 3-3" />
    </>
  ),
};

// ── Atoms ───────────────────────────────────────────────────────────
export function Avatar({
  user,
  size = 28,
  title,
}: {
  user: Pick<User, 'name' | 'avatar_color'>;
  size?: number;
  title?: string;
}) {
  const style: CSSProperties = {
    width: size,
    height: size,
    background: user.avatar_color,
    fontSize: Math.max(10, size * 0.4),
  };
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold text-white"
      style={style}
      title={title ?? user.name}
    >
      {user.name.charAt(0).toUpperCase()}
    </span>
  );
}

export function ProjectDot({ project, size = 10 }: { project: Pick<Project, 'color'>; size?: number }) {
  return (
    <span
      className="inline-block shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: size / 3,
        background: project.color,
      }}
    />
  );
}

// ── Avatar color palette ─────────────────────────────────────────────
// Stoop-palette avatar swatches (warm, muted — match Avatar treatment).
// Setup wizard and the in-app profile editor both pick from this set so
// colors stay in sync visually.
export const AVATAR_COLORS = [
  '#A86A4B', // clay (accent)
  '#874F33', // deep clay
  '#6B8A6E', // sage
  '#5A7A8E', // slate
  '#7A5C2E', // ochre
  '#6F4A8E', // plum
  '#B36447', // warm red
  '#5A5A8E', // periwinkle
];

export function SwatchRow({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange: (c: string) => void;
  colors: string[];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2.5">
      {colors.map((c) => {
        const selected = c.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            aria-pressed={selected}
            onClick={() => onChange(c)}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-105"
            style={{
              background: c,
              boxShadow: selected
                ? `0 0 0 2px #FAF7F2, 0 0 0 4px ${c}`
                : 'none',
            }}
          >
            {selected && (
              <Icon.Check
                className="h-4 w-4 text-white"
                style={{ strokeWidth: 2.4 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  doing: 'Doing',
  blocked: 'Held',
  done: 'Done',
};
const STATUS_COLORS: Record<TaskStatus, { fg: string; bg: string }> = {
  todo: { fg: '#6F6358', bg: '#F4EFE6' },
  doing: { fg: '#5A7A8E', bg: '#E3ECF1' },
  blocked: { fg: '#B36447', bg: '#F1E0D6' },
  done: { fg: '#6B8A6E', bg: '#E2EBE3' },
};

export function statusLabel(s: TaskStatus): string {
  return STATUS_LABEL[s];
}

export function StatusChip({ status }: { status: TaskStatus }) {
  const c = STATUS_COLORS[status];
  return (
    <span className="chip" style={{ background: c.bg, color: c.fg }}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 6,
          background: c.fg,
          opacity: 0.7,
        }}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function StatusCheckbox({
  status,
  size = 18,
  onClick,
}: {
  status: TaskStatus;
  size?: number;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const c = STATUS_COLORS[status];
  let stroke = '#E4DBCB';
  let fill = 'transparent';
  let inner: ReactNode = null;
  if (status === 'done') {
    fill = c.fg;
    stroke = c.fg;
    inner = (
      <Icon.Check
        style={{
          width: size * 0.65,
          height: size * 0.65,
          color: '#fff',
          strokeWidth: 2.5,
        }}
      />
    );
  } else if (status === 'doing') {
    stroke = c.fg;
    inner = (
      <span
        style={{
          width: size * 0.4,
          height: size * 0.4,
          background: c.fg,
          borderRadius: 999,
        }}
      />
    );
  } else if (status === 'blocked') {
    stroke = c.fg;
    inner = <span style={{ width: size * 0.55, height: 2, background: c.fg }} />;
  }
  return (
    <button
      type="button"
      aria-label={`Status: ${STATUS_LABEL[status]}`}
      onClick={onClick}
      className="inline-flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        border: `1.5px solid ${stroke}`,
        background: fill,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {inner}
    </button>
  );
}

// ── Date label ──────────────────────────────────────────────────────
const DAY = 86_400_000;

export function DueLabel({ ts }: { ts: number | null }) {
  if (!ts) return <span className="text-xs text-stoop-muted">—</span>;
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(ts);
  dueDay.setHours(0, 0, 0, 0);
  const diff = Math.round((dueDay.getTime() - today.getTime()) / DAY);

  let label: string;
  if (diff === 0) label = 'Today';
  else if (diff === 1) label = 'Tomorrow';
  else if (diff === -1) label = 'Yesterday';
  else if (diff > 1 && diff < 7)
    label = dueDay.toLocaleDateString(undefined, { weekday: 'long' });
  else
    label = dueDay.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });

  const overdue = ts < now && diff < 0;
  const todayish = diff === 0;
  const color = overdue
    ? '#B36447'
    : todayish
      ? '#874F33'
      : '#7A7066';

  return (
    <span
      style={{
        fontSize: 12,
        color,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {label}
    </span>
  );
}

// ── Mobilization chips ──────────────────────────────────────────────
const ROUTE_LABEL: Record<Route, string> = {
  unset: 'Unscoped',
  diy: 'DIY',
  delegate: 'Delegate',
  outsource: 'Outsource',
  buy: 'Buy',
  schedule: 'Schedule',
  research: 'Research',
  drop: 'Drop',
};
const ROUTE_GLYPH: Record<Route, string> = {
  unset: '·',
  diy: '✓',
  delegate: '↪',
  outsource: '🔧',
  buy: '🛒',
  schedule: '📞',
  research: '✦',
  drop: '✕',
};
const ROUTE_COLORS: Record<Route, { fg: string; bg: string }> = {
  unset:     { fg: '#7A7066', bg: '#EFE7DA' },
  diy:       { fg: '#6B8A6E', bg: '#E2EBE3' },
  delegate:  { fg: '#5A7A8E', bg: '#E3ECF1' },
  outsource: { fg: '#874F33', bg: '#F1E0D6' },
  buy:       { fg: '#7A5C2E', bg: '#F1E7CE' },
  schedule:  { fg: '#5A5A8E', bg: '#E3E3F1' },
  research:  { fg: '#6F4A8E', bg: '#EAE0F1' },
  drop:      { fg: '#8A6B6B', bg: '#EFE3E3' },
};
// One-line description surfaced via native browser tooltip on hover / long-press.
const ROUTE_DESC: Record<Route, string> = {
  unset:     'Not yet scoped — the AI hasn’t looked at this task',
  diy:       'Do it yourself — keep it on the assignee’s plate',
  delegate:  'Hand to a household member with context',
  outsource: 'Book a paid service (TaskRabbit, Handy, etc.)',
  buy:       'This is actually a purchase — Amazon, Instacart, etc.',
  schedule:  'The unblocking step is a phone call or appointment',
  research:  'Too underspecified to act on — scope with your own AI first',
  drop:      'Not worth doing — politely decline this one',
};

export function routeLabel(r: Route): string {
  return ROUTE_LABEL[r];
}

export function RouteChip({ route }: { route: Route }) {
  const c = ROUTE_COLORS[route];
  return (
    <span
      className="chip"
      style={{ background: c.bg, color: c.fg, cursor: 'help' }}
      title={ROUTE_DESC[route]}
    >
      <span aria-hidden style={{ fontSize: 11 }}>
        {ROUTE_GLYPH[route]}
      </span>
      {ROUTE_LABEL[route]}
    </span>
  );
}

const MOB_LABEL: Record<MobilizationState, string> = {
  unscoped: 'Unscoped',
  scoped: 'Scoped',
  dispatched: 'Dispatched',
  resolved: 'Resolved',
};

export function MobilizationStateChip({ state }: { state: MobilizationState }) {
  if (state === 'unscoped') {
    return (
      <span className="chip" style={{ background: 'transparent', color: '#7A7066', borderColor: '#EFE7DA' }}>
        {MOB_LABEL[state]}
      </span>
    );
  }
  const tone = state === 'resolved'
    ? { fg: '#6B8A6E', bg: '#E2EBE3' }
    : state === 'dispatched'
      ? { fg: '#5A7A8E', bg: '#E3ECF1' }
      : { fg: '#874F33', bg: '#F1E0D6' };
  return (
    <span className="chip" style={{ background: tone.bg, color: tone.fg }}>
      {MOB_LABEL[state]}
    </span>
  );
}

// Greeting helper — picks Morning / Afternoon / Evening from the clock.
export function timeGreeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  if (h < 21) return 'Evening';
  return 'Evening';
}
