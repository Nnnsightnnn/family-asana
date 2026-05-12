import { FormEvent, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Icon } from '../components/atoms';
import type { User } from '../types';

type Mode = 'password' | 'magic';

export default function Login() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onPasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(email, password);
      qc.setQueryData<{ user: User | null; has_password: boolean }>(
        ['me'],
        (prev) => ({ user: res.user, has_password: prev?.has_password ?? true })
      );
      // App will route to '/' automatically once loggedIn flips true.
    } catch (err) {
      const msg = (err as Error).message;
      // Server returns 401 with { error: 'invalid_credentials' } for any failure.
      // Don't try to distinguish — just show one message.
      if (/401/.test(msg)) setError('Wrong email or password.');
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function onMagicSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.requestLink(email);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword('');
    setSent(false);
  }

  return (
    <div className="paper flex h-full">
      {/* Form column */}
      <div className="flex flex-1 items-center justify-center px-6 py-10 md:px-16">
        <div className="w-full max-w-sm">
          <div className="mb-12 flex items-center gap-2.5">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-stoop-accent text-white">
              <Icon.Home className="h-4 w-4" />
            </span>
            <span className="font-medium tracking-tight">Family</span>
          </div>

          {mode === 'magic' && sent ? (
            <>
              <h1 className="display text-[36px] leading-[1.05] m-0">
                Check your <span className="display-italic">inbox.</span>
              </h1>
              <p className="mt-3.5 text-[15px] leading-relaxed text-stoop-muted">
                We sent a link to{' '}
                <span className="text-stoop-ink">{email}</span>. It expires in
                15 minutes.
              </p>
              <div className="mt-7 flex items-start gap-3 rounded-card border border-stoop-hairline bg-stoop-panel p-4">
                <Icon.Mail className="mt-0.5 h-4 w-4 shrink-0 text-stoop-accent" />
                <div className="text-[13.5px] leading-snug">
                  Didn’t see it? Check spam, or{' '}
                  <button
                    type="button"
                    className="text-stoop-accent hover:underline"
                    onClick={() => setSent(false)}
                  >
                    send another
                  </button>
                  .
                </div>
              </div>
              <div className="mt-6 text-[13px] text-stoop-muted">
                <button
                  type="button"
                  className="text-stoop-accent hover:underline"
                  onClick={() => switchMode('password')}
                >
                  Sign in with a password instead
                </button>
              </div>
            </>
          ) : mode === 'password' ? (
            <form onSubmit={onPasswordSubmit}>
              <h1 className="display text-[40px] leading-[1.05] m-0">
                Welcome <span className="display-italic">home.</span>
              </h1>
              <p className="mt-3.5 text-[15px] leading-relaxed text-stoop-muted">
                Sign in with your email and password.
              </p>

              <div className="mt-8">
                <label className="block text-[11px] font-medium uppercase tracking-[0.04em] text-stoop-muted">
                  Email
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  className="input-shell mt-2 text-[15px]"
                  placeholder="you@home"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                />
              </div>

              <div className="mt-5">
                <label className="block text-[11px] font-medium uppercase tracking-[0.04em] text-stoop-muted">
                  Password
                </label>
                <input
                  type="password"
                  required
                  className="input-shell mt-2 text-[15px]"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <p className="mt-3 text-sm text-[#B36447]">{error}</p>
              )}

              <button
                className="btn-primary mt-5 w-full py-3.5 text-[15px]"
                disabled={loading || !email || !password}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>

              <p className="mt-4 text-[13px] text-stoop-muted">
                No password yet?{' '}
                <button
                  type="button"
                  className="text-stoop-accent hover:underline"
                  onClick={() => switchMode('magic')}
                >
                  Email me a sign-in link
                </button>
                .
              </p>
            </form>
          ) : (
            <form onSubmit={onMagicSubmit}>
              <h1 className="display text-[40px] leading-[1.05] m-0">
                Welcome <span className="display-italic">home.</span>
              </h1>
              <p className="mt-3.5 text-[15px] leading-relaxed text-stoop-muted">
                Pop in your email and we’ll send a one-tap sign-in link.
              </p>

              <div className="mt-8">
                <label className="block text-[11px] font-medium uppercase tracking-[0.04em] text-stoop-muted">
                  Your email
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  className="input-shell mt-2 text-[15px]"
                  placeholder="you@home"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {error && (
                  <p className="mt-3 text-sm text-[#B36447]">{error}</p>
                )}
                <button
                  className="btn-primary mt-4 w-full py-3.5 text-[15px]"
                  disabled={loading || !email}
                >
                  {loading ? 'Sending…' : 'Send sign-in link'}
                </button>
                <p className="mt-3.5 text-xs text-stoop-muted">
                  Only people on this household’s allowlist can sign in.
                </p>
                <p className="mt-4 text-[13px] text-stoop-muted">
                  <button
                    type="button"
                    className="text-stoop-accent hover:underline"
                    onClick={() => switchMode('password')}
                  >
                    Sign in with a password instead
                  </button>
                </p>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Quiet illustration rail — desktop only */}
      <aside
        className="relative hidden flex-[1.1] overflow-hidden md:block"
        style={{
          background:
            'linear-gradient(160deg, #F1E3D8 0%, #E9D5C3 60%, #D9C0A8 100%)',
        }}
      >
        <div
          className="absolute"
          style={{
            top: 60,
            right: -40,
            width: 280,
            height: 280,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(255,238,210,0.9), rgba(255,238,210,0) 70%)',
            filter: 'blur(2px)',
          }}
        />
        <div
          className="absolute"
          style={{
            top: 90,
            right: 30,
            width: 90,
            height: 90,
            borderRadius: '50%',
            background: '#F8E4C4',
            boxShadow: '0 0 80px 20px rgba(248,228,196,0.7)',
          }}
        />
        <div className="absolute inset-0 flex flex-col justify-end p-12">
          <div className="display-italic max-w-[360px] text-[22px] leading-[1.4] text-stoop-ink-soft">
            “Three of us, one place to keep the small things.”
          </div>
          <div className="mt-2 text-[13px] text-stoop-muted">— this household</div>
        </div>
      </aside>
    </div>
  );
}
