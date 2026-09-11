import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Brand } from '../../components/Brand';
import { Icon } from '../../components/Icon';
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
      <header className="auth-nav"><Brand/><span className="auth-badge">Requirements hub</span></header>
      <div className="auth-layout">
        <section className="auth-intro">
          <span className="eyebrow"><Icon name="branch" size={14}/> Rastreabilidade de ponta a ponta</span>
          <h1>Decisões claras começam com requisitos conectados.</h1>
          <p>Organize requisitos, acompanhe versões e entenda relações no mesmo espaço de trabalho.</p>
          <div className="auth-preview" aria-hidden="true">
            <div className="preview-top"><span/><span/><span/><small>Mapa de requisitos</small></div>
            <div className="preview-canvas"><div className="preview-node preview-node-main"><small/><strong/></div><div className="preview-line line-a"/><div className="preview-line line-b"/><div className="preview-node preview-node-a"><small/><strong/></div><div className="preview-node preview-node-b"><small/><strong/></div></div>
          </div>
        </section>
        <form className="auth-card" onSubmit={submit}>
          <p className="section-kicker">Acesso seguro</p>
          <h2>{register ? 'Criar sua conta' : 'Entrar no ATHENA'}</h2>
          <p className="form-lead">{register ? 'Comece criando seu acesso.' : 'Use seus dados para continuar.'}</p>
          {register && <label>Nome<input autoComplete="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome"/></label>}
          <label>E-mail<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com"/></label>
          <label>Senha<input type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres"/></label>
          {mutation.error && <div className="inline-error" role="alert">{mutation.error.message}</div>}
          <button className="primary-button auth-submit" disabled={mutation.isPending}>{mutation.isPending ? 'Aguarde…' : register ? 'Criar conta' : 'Entrar'}<Icon name="chevron" size={15}/></button>
          <button className="text-button" type="button" onClick={() => { setRegister(!register); mutation.reset(); }}>{register ? 'Já tenho uma conta' : 'Criar uma conta'}</button>
        </form>
      </div>
    </main>
  );
}
