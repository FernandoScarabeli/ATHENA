import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { User } from '../lib/types';
import { AuthPage } from '../features/auth/AuthPage';
import { LandingPage } from '../features/landing/LandingPage';
import { Onboarding } from '../features/onboarding/Onboarding';

export function App() {
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);
  const [path, setPath] = useState(window.location.pathname);
  const session = useQuery<User>({ queryKey: ['session'], queryFn: () => api('/auth/me'), retry: false });
  useEffect(() => {
    const updatePath = () => setPath(window.location.pathname);
    addEventListener('popstate', updatePath);
    return () => removeEventListener('popstate', updatePath);
  }, []);

  if (session.isLoading) {
    return <main className="state-page"><span className="loading-ring"/><p className="section-kicker">Preparando workspace</p><h1>Carregando ATHENA</h1></main>;
  }

  const user = authenticatedUser ?? session.data;
  const acceptingInvite = path === '/convites/aceitar';
  if (acceptingInvite) return <AuthPage onAuthenticated={setAuthenticatedUser} initialUser={user}/>;
  if (!user) return path === '/' ? <LandingPage /> : <AuthPage onAuthenticated={setAuthenticatedUser} />;
  return <Onboarding user={user} onLogout={() => setAuthenticatedUser(null)} />;
}
