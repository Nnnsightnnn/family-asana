import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Avatar, Icon } from '../components/atoms';
import type { AdminStats, AdminUser } from '../types';

function relTime(ts: number | null): string {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-stoop-hairline bg-stoop-panel p-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-stoop-muted">
        {label}
      </div>
      <div
        className="display mt-1 text-[28px] leading-none text-stoop-ink"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </div>
    </div>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [gate, setGate] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [toast, setToast] = useState<string | null>(null);

  // Probe /api/admin/stats once on mount. 403 → bounce to /. 200 → render.
  useEffect(() => {
    let cancelled = false;
    api
      .adminStats()
      .then((stats) => {
        if (cancelled) return;
        qc.setQueryData<AdminStats>(['admin', 'stats'], stats);
        setGate('allowed');
      })
      .catch(() => {
        if (cancelled) return;
        setGate('denied');
        navigate('/', { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, qc]);

  const stats = useQuery<AdminStats>({
    queryKey: ['admin', 'stats'],
    queryFn: api.adminStats,
    enabled: gate === 'allowed',
  });
  const users = useQuery<AdminUser[]>({
    queryKey: ['admin', 'users'],
    queryFn: api.adminUsers,
    enabled: gate === 'allowed',
  });

  const revoke = useMutation({
    mutationFn: (userId: string) => api.adminRevokeSessions(userId),
    onSuccess: (res, userId) => {
      const u = users.data?.find((x) => x.id === userId);
      setToast(`Revoked ${res.revoked} session${res.revoked === 1 ? '' : 's'} for ${u?.name ?? 'user'}`);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      setTimeout(() => setToast(null), 3500);
    },
    onError: () => setToast('Revoke failed'),
  });

  if (gate !== 'allowed') {
    return (
      <div className="flex h-full items-center justify-center text-stoop-muted">
        {gate === 'checking' ? 'Loading admin…' : 'Redirecting…'}
      </div>
    );
  }

  const s = stats.data;

  return (
    <div className="paper min-h-full bg-stoop-canvas">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="display text-[28px] leading-tight">
              Admin <span className="display-italic">control</span>
            </h1>
            <p className="mt-1 text-sm text-stoop-muted">
              Household health and session management.
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost flex items-center gap-1.5 text-sm"
            onClick={() => navigate('/')}
            aria-label="Back to app"
          >
            <Icon.X className="h-4 w-4" />
            <span>Close</span>
          </button>
        </header>

        <section
          aria-label="Stats"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          <StatTile label="Family" value={s?.users_total ?? 0} />
          <StatTile label="Projects" value={s?.projects_total ?? 0} />
          <StatTile label="Tasks" value={s?.tasks_total ?? 0} />
          <StatTile label="New / 7d" value={s?.tasks_last_7d ?? 0} />
          <StatTile label="Resolved / 7d" value={s?.tasks_resolved_7d ?? 0} />
        </section>

        <section className="mt-8" aria-label="Household members">
          <h2 className="display text-[18px] mb-3">Members</h2>
          <ul className="space-y-2">
            {users.data?.map((u) => (
              <li
                key={u.id}
                className="flex items-center gap-3 rounded-card border border-stoop-hairline bg-stoop-panel-warm p-3"
              >
                <Avatar user={u} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-stoop-ink">
                    {u.name}
                  </div>
                  <div className="truncate text-[12px] text-stoop-muted">
                    {u.email}
                  </div>
                  <div className="mt-0.5 text-[11px] text-stoop-muted">
                    {u.active_sessions} active · last sign-in {relTime(u.last_session_at)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-ghost shrink-0 px-3 py-1.5 text-[12px]"
                  onClick={() => {
                    if (
                      confirm(
                        `Revoke all sessions for ${u.name}? They will need to sign in again.`
                      )
                    ) {
                      revoke.mutate(u.id);
                    }
                  }}
                  disabled={revoke.isPending}
                  aria-label={`Revoke sessions for ${u.name}`}
                >
                  Revoke
                </button>
              </li>
            ))}
            {users.data && users.data.length === 0 && (
              <li className="rounded-card border border-stoop-hairline bg-stoop-panel p-4 text-sm text-stoop-muted">
                No users yet.
              </li>
            )}
          </ul>
        </section>

        {toast && (
          <div
            role="status"
            className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-card border border-stoop-hairline bg-stoop-ink px-4 py-2 text-sm text-stoop-canvas shadow-lg"
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
