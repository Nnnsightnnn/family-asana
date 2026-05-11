import { FormEvent, useState } from 'react';
import { api } from '../api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
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

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-asana-line bg-white p-7 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-asana-blue" />
          <h1 className="text-lg font-semibold">Family Asana</h1>
        </div>

        {sent ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium">Check your email.</p>
            <p className="text-asana-slate">
              We sent a sign-in link to <span className="text-asana-ink">{email}</span>. The link
              expires in 15 minutes.
            </p>
            <button className="btn-ghost mt-2 w-full" onClick={() => setSent(false)}>
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <input
                type="email"
                required
                autoFocus
                className="input"
                placeholder="you@family.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-asana-coral">{error}</p>}
            <button className="btn-primary w-full" disabled={loading || !email}>
              {loading ? 'Sending…' : 'Send sign-in link'}
            </button>
            <p className="pt-1 text-center text-xs text-asana-slate">
              No password to remember.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
