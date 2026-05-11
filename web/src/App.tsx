import { Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from './api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';

function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api.me() });
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
        qc.setQueryData(['me'], { user: res.user });
        navigate('/', { replace: true });
      })
      .catch(() => navigate('/login?error=1', { replace: true }));
  }, [params, navigate, qc]);
  return <div className="flex h-full items-center justify-center text-asana-slate">Signing you in…</div>;
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
        element={loggedIn ? <Dashboard user={data!.user!} /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}
