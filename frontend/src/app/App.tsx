import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { User } from '../lib/types';
import { AuthPage } from '../features/auth/AuthPage';
import { Onboarding } from '../features/onboarding/Onboarding';

export function App() {
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);
  const session = useQuery<User>({ queryKey: ['session'], queryFn: () => api('/auth/me'), retry: false });

  if (session.isLoading) {
    return <main className="state-page"><span className="loading-ring"/><p className="section-kicker">Preparando workspace</p><h1>Carregando ATHENA</h1></main>;
  }

  const user = authenticatedUser ?? session.data;
  if (!user) return <AuthPage onAuthenticated={setAuthenticatedUser} />;
  return <Onboarding user={user} onLogout={() => setAuthenticatedUser(null)} />;
}
