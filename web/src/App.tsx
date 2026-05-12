import { Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from './api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import Setup from './pages/Setup';
import type { User } from './types';

function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api.me() });
}

function useInstallation(enabled: boolean) {
  return useQuery({
    queryKey: ['installation'],
    queryFn: () => api.installationStatus(),
    enabled,
    staleTime: 60_000,
  });
}

function VerifyPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const token = params.get('token');
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }
    api
      .verify(token)
      .then((res) => {
        qc.setQueryData<{ user: User | null; has_password: boolean }>(
          ['me'],
          (prev) => ({ user: res.user, has_password: prev?.has_password ?? false })
        );
        // Recheck setup state after sign-in — the first user to verify
        // on a fresh install should land at /setup.
        qc.invalidateQueries({ queryKey: ['installation'] });
        navigate('/', { replace: true });
      })
      .catch(() => navigate('/login?error=1', { replace: true }));
  }, [params, navigate, qc]);
  return <div className="flex h-full items-center justify-center text-asana-slate">Signing you in…</div>;
}

function AuthedShell({ user }: { user: User }) {
  // Only ask the server about installation status when we're already signed
  // in — saves a request on the login screen.
  const { data: install, isLoading } = useInstallation(true);

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-asana-slate">Loading…</div>;
  }

  if (install?.setup_required) {
    return (
      <Routes>
        <Route path="/setup" element={<Setup user={user} />} />
        <Route path="/*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Once setup is done, /setup shouldn't be reachable. */}
      <Route path="/setup" element={<Navigate to="/" replace />} />
      <Route path="/*" element={<Dashboard user={user} />} />
    </Routes>
  );
}

export default function App() {
  const { data, isLoading } = useMe();

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-asana-slate">Loading…</div>;
  }
  const loggedIn = !!data?.user;

  return (
    <Routes>
      <Route path="/login" element={loggedIn ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/auth/verify" element={<VerifyPage />} />
      <Route
        path="/admin"
        element={loggedIn ? <Admin /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/*"
        element={loggedIn ? <AuthedShell user={data!.user!} /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}
