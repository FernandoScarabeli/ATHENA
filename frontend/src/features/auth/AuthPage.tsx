import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Brand } from '../../components/Brand';
import SignInForm from '../../components/ui/sign-in-form';
import { api } from '../../lib/api';
import type { User } from '../../lib/types';

export function AuthPage({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const client = useQueryClient();
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const mutation = useMutation({
    mutationFn: () => api<User>(`/auth/${register ? 'register' : 'login'}`, {
      method: 'POST',
      body: JSON.stringify(register ? { email, name, password } : { email, password }),
    }),
    onSuccess: (user) => { client.setQueryData(['session'], user); onAuthenticated(user); },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <main className="auth-page">
      <header className="auth-nav"><Brand /></header>
      <div className="auth-layout">
        <section className="auth-intro">
          <h1>Decisões claras começam com requisitos conectados.</h1>
          <p>Organize requisitos, acompanhe versões e entenda relações no mesmo espaço de trabalho.</p>
          <div className="auth-preview" aria-hidden="true">
            <div className="preview-top"><span/><span/><span/><small>Mapa de requisitos</small></div>
            <div className="preview-canvas"><div className="preview-node preview-node-main"><small/><strong/></div><div className="preview-line line-a"/><div className="preview-line line-b"/><div className="preview-node preview-node-a"><small/><strong/></div><div className="preview-node preview-node-b"><small/><strong/></div></div>
          </div>
        </section>
        <SignInForm
          register={register}
          name={name}
          email={email}
          password={password}
          isPending={mutation.isPending}
          error={mutation.error?.message}
          onSubmit={submit}
          onNameChange={setName}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onToggleMode={() => { setRegister(!register); mutation.reset(); }}
        />
      </div>
    </main>
  );
}
