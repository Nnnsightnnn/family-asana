import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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

  const mutation = useMutation({
    mutationFn: (data: { name: string; avatar_color: string }) =>
      api.updateMe(data),
    onSuccess: (updated) => {
      qc.setQueryData(['me'], { user: updated });
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
      </div>
    </div>
  );
}
