import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { User } from '../types';
import { Avatar, AVATAR_COLORS, Icon, SwatchRow } from './atoms';

type Props = {
  user: User;
  onClose: () => void;
};

export default function ProfileModal({ user, onClose }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState(user.name ?? '');
  const [avatarColor, setAvatarColor] = useState(
    user.avatar_color || AVATAR_COLORS[0]
  );
  const [error, setError] = useState<string | null>(null);

  // Read the cached /me response for `has_password`. Falls back to false
  // if (somehow) absent; the security section gracefully handles that.
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(),
    staleTime: 60_000,
  });
  const hasPassword = !!meQuery.data?.has_password;

  const mutation = useMutation({
    mutationFn: (data: { name: string; avatar_color: string }) =>
      api.updateMe(data),
    onSuccess: (updated) => {
      qc.setQueryData<{ user: User | null; has_password: boolean }>(
        ['me'],
        (prev) => ({ user: updated, has_password: prev?.has_password ?? false })
      );
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    mutation.mutate({ name: trimmed, avatar_color: avatarColor });
  }

  const saveDisabled = !name.trim() || mutation.isPending;

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-stoop-ink/30 px-4 pt-[14vh] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] rounded-card border border-stoop-hairline bg-stoop-panel shadow-soft"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Edit profile"
      >
        <div className="flex items-center gap-2.5 border-b border-stoop-hairline px-5 py-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
            Edit profile
          </span>
          <span className="flex-1" />
          <button
            type="button"
            className="rounded p-1.5 text-stoop-muted hover:bg-stoop-hairline"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon.X className="h-3.5 w-3.5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-5 py-5">
          <div className="flex items-center gap-4">
            <Avatar
              user={{
                name: name || user.email,
                avatar_color: avatarColor,
              }}
              size={56}
            />
            <div className="flex-1">
              <label className="block text-[11px] font-medium uppercase tracking-[0.04em] text-stoop-muted">
                Display name
              </label>
              <input
                type="text"
                required
                autoFocus
                className="input-shell mt-2 text-[15px]"
                placeholder="What should we call you?"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-[11px] font-medium uppercase tracking-[0.04em] text-stoop-muted">
              Avatar color
            </label>
            <SwatchRow
              value={avatarColor}
              onChange={setAvatarColor}
              colors={AVATAR_COLORS}
            />
          </div>

          {error && (
            <p className="mt-4 text-sm" style={{ color: '#B36447' }}>
              {error}
            </p>
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              className="btn-ghost px-4 py-2 text-[14px]"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-5 py-2 text-[14px]"
              disabled={saveDisabled}
            >
              {mutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>

        <PasswordSection hasPassword={hasPassword} />
      </div>
    </div>
  );
}

function PasswordSection({ hasPassword }: { hasPassword: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function reset() {
    setCurrent('');
    setNext('');
    setConfirm('');
    setMsg(null);
  }

  const setMutation = useMutation({
    mutationFn: () =>
      api.setPassword(next, hasPassword ? current : undefined),
    onSuccess: () => {
      qc.setQueryData<{ user: User | null; has_password: boolean }>(
        ['me'],
        (prev) =>
          prev ? { ...prev, has_password: true } : { user: null, has_password: true }
      );
      reset();
      setOpen(false);
      setMsg({ kind: 'ok', text: 'Password saved.' });
    },
    onError: (e) => {
      const m = (e as Error).message;
      if (/401/.test(m)) setMsg({ kind: 'err', text: 'Current password is wrong.' });
      else if (/400/.test(m)) setMsg({ kind: 'err', text: 'Password must be at least 8 characters.' });
      else setMsg({ kind: 'err', text: m });
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => api.removePassword(),
    onSuccess: () => {
      qc.setQueryData<{ user: User | null; has_password: boolean }>(
        ['me'],
        (prev) =>
          prev ? { ...prev, has_password: false } : { user: null, has_password: false }
      );
      reset();
      setOpen(false);
      setMsg({ kind: 'ok', text: 'Password removed. You can still sign in with a magic link.' });
    },
    onError: (e) => setMsg({ kind: 'err', text: (e as Error).message }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) {
      setMsg({ kind: 'err', text: 'Password must be at least 8 characters.' });
      return;
    }
    if (next !== confirm) {
      setMsg({ kind: 'err', text: 'Passwords do not match.' });
      return;
    }
    if (hasPassword && !current) {
      setMsg({ kind: 'err', text: 'Enter your current password.' });
      return;
    }
    setMutation.mutate();
  }

  function onRemove() {
    if (!window.confirm('Remove your password? You will need a magic link to sign in next time.')) {
      return;
    }
    setMsg(null);
    removeMutation.mutate();
  }

  return (
    <div className="border-t border-stoop-hairline px-5 py-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
            Sign-in & security
          </div>
          <div className="mt-1 text-[13.5px] text-stoop-ink">
            {hasPassword
              ? 'Password is set. Sign in directly without checking email.'
              : 'No password set. You sign in via emailed magic link.'}
          </div>
        </div>
        {!open && (
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-[13px]"
            onClick={() => {
              reset();
              setOpen(true);
            }}
          >
            {hasPassword ? 'Change' : 'Set password'}
          </button>
        )}
      </div>

      {msg && !open && (
        <p
          className="mt-3 text-sm"
          style={{ color: msg.kind === 'ok' ? '#3F6E4F' : '#B36447' }}
        >
          {msg.text}
        </p>
      )}

      {open && (
        <form onSubmit={onSubmit} className="mt-4">
          {hasPassword && (
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-[0.04em] text-stoop-muted">
                Current password
              </label>
              <input
                type="password"
                autoFocus
                className="input-shell mt-2 text-[14px]"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          )}
          <div className={hasPassword ? 'mt-3' : ''}>
            <label className="block text-[11px] font-medium uppercase tracking-[0.04em] text-stoop-muted">
              New password
            </label>
            <input
              type="password"
              autoFocus={!hasPassword}
              className="input-shell mt-2 text-[14px]"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={8}
            />
            <p className="mt-1 text-xs text-stoop-muted">At least 8 characters.</p>
          </div>
          <div className="mt-3">
            <label className="block text-[11px] font-medium uppercase tracking-[0.04em] text-stoop-muted">
              Confirm new password
            </label>
            <input
              type="password"
              className="input-shell mt-2 text-[14px]"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {msg && (
            <p
              className="mt-3 text-sm"
              style={{ color: msg.kind === 'ok' ? '#3F6E4F' : '#B36447' }}
            >
              {msg.text}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between gap-2">
            <div>
              {hasPassword && (
                <button
                  type="button"
                  className="text-[13px] text-stoop-muted hover:text-[#B36447] hover:underline"
                  onClick={onRemove}
                  disabled={removeMutation.isPending}
                >
                  Remove password
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-[13px]"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary px-4 py-1.5 text-[13px]"
                disabled={setMutation.isPending}
              >
                {setMutation.isPending ? 'Saving…' : 'Save password'}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
