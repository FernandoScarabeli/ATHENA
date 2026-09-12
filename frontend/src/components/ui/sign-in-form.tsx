import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, LockKeyhole, Mail, UserRound } from 'lucide-react';

type SignInFormProps = {
  register: boolean;
  email: string;
  name: string;
  password: string;
  isPending: boolean;
  error?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEmailChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onToggleMode: () => void;
};

export default function SignInForm({
  register,
  email,
  name,
  password,
  isPending,
  error,
  onSubmit,
  onEmailChange,
  onNameChange,
  onPasswordChange,
  onToggleMode,
}: SignInFormProps) {
  const [remember, setRemember] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState(false);

  function handleForgotPassword() {
    setRecoveryNotice(true);
  }

  return (
    <form className="auth-card sign-in-form" onSubmit={onSubmit}>
      <div className="sign-in-heading">
        <h2>{register ? 'Criar sua conta' : 'Entrar no ATHENA'}</h2>
        <p className="form-lead">
          {register ? 'Comece criando seu acesso.' : 'Use seus dados para continuar.'}
        </p>
      </div>

      {register && (
        <label className="sign-in-field">
          <span>Nome</span>
          <span className="sign-in-input-wrap">
            <UserRound aria-hidden="true" size={17} />
            <input
              autoComplete="name"
              required
              minLength={2}
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Seu nome"
            />
          </span>
        </label>
      )}

      <label className="sign-in-field">
        <span>E-mail</span>
        <span className="sign-in-input-wrap">
          <Mail aria-hidden="true" size={17} />
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="voce@empresa.com"
          />
        </span>
      </label>

      <label className="sign-in-field">
        <span>Senha</span>
        <span className="sign-in-input-wrap">
          <LockKeyhole aria-hidden="true" size={17} />
          <input
            id="password"
            type="password"
            autoComplete={register ? 'new-password' : 'current-password'}
            required
            minLength={8}
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="Mínimo de 8 caracteres"
          />
        </span>
      </label>

      {!register && (
        <div className="sign-in-options">
          <label className="remember-option">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            <span className="custom-checkbox" aria-hidden="true">
              {remember && <Check size={12} strokeWidth={2.5} />}
            </span>
            <span>Lembrar de mim</span>
          </label>
          <button className="forgot-button" type="button" onClick={handleForgotPassword}>
            Esqueci minha senha
          </button>
        </div>
      )}

      {recoveryNotice && !register && (
        <div className="auth-note" role="status">
          A recuperação de senha será disponibilizada em breve.
        </div>
      )}

      {error && <div className="inline-error" role="alert">{error}</div>}

      <button className="primary-button auth-submit" disabled={isPending}>
        {isPending ? 'Aguarde…' : register ? 'Criar conta' : 'Entrar'}
        <ArrowRight aria-hidden="true" size={16} />
      </button>

      <p className="sign-in-switch">
        {register ? 'Já tenho uma conta.' : 'Ainda não tem uma conta?'}{' '}
        <button className="text-button" type="button" onClick={onToggleMode}>
          {register ? 'Entrar' : 'Criar uma conta'}
        </button>
      </p>
    </form>
  );
}
