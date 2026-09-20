import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  UserRound,
} from "lucide-react";
import { Brand } from "../../components/Brand";
import { api } from "../../lib/api";
import type { User } from "../../lib/types";

type Screen =
  | "login"
  | "cadastro"
  | "esqueci-senha"
  | "redefinir-senha"
  | "verificar-email"
  | "convite";
type InviteContext = { workspaceName: string; role: "EDITOR" | "VIEWER" };
const currentScreen = (): Screen => {
  const path = location.pathname;
  if (path.includes("cadastro")) return "cadastro";
  if (path.includes("esqueci")) return "esqueci-senha";
  if (path.includes("redefinir")) return "redefinir-senha";
  if (path.includes("verificar")) return "verificar-email";
  if (path.includes("convites/aceitar")) return "convite";
  return "login";
};
const internalPath = (value: string | null) =>
  value && value.startsWith("/") && !value.startsWith("//") ? value : undefined;

export function AuthPage({
  onAuthenticated,
  initialUser,
}: {
  onAuthenticated: (user: User) => void;
  initialUser?: User | null;
}) {
  const [screen, setScreen] = useState(currentScreen);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [remember, setRemember] = useState(false);
  const [terms, setTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [invite, setInvite] = useState<InviteContext | null>(null);
  const query = useMemo(() => new URLSearchParams(location.search), [screen]);
  const token = query.get("token") ?? "";
  const returnTo = internalPath(query.get("returnTo"));
  const registrationReturnTo =
    screen === "cadastro" && token
      ? `/convites/aceitar?token=${encodeURIComponent(token)}`
      : returnTo;
  useEffect(() => {
    const onPop = () => setScreen(currentScreen());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (screen !== "convite" || !token) return;
    setPending(true);
    api<InviteContext>(`/invites/resolve?token=${encodeURIComponent(token)}`)
      .then(setInvite)
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível abrir o convite.",
        ),
      )
      .finally(() => setPending(false));
  }, [screen, token]);
  const go = (path: string, extra: Record<string, string | undefined> = {}) => {
    const params = new URLSearchParams();
    const preservedReturn = returnTo;
    const inviteToken = screen === "convite" ? token : undefined;
    if (preservedReturn) params.set("returnTo", preservedReturn);
    if (inviteToken) params.set("token", inviteToken);
    Object.entries(extra).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const suffix = params.size ? `?${params.toString()}` : "";
    setError("");
    setMessage("");
    history.pushState({}, "", `${path}${suffix}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    setScreen(currentScreen());
  };
  const acceptInvite = async (user: User) => {
    const result = await api<{ workspaceId: string }>("/invites/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    history.replaceState(
      {},
      "",
      `/?workspace=${encodeURIComponent(result.workspaceId)}`,
    );
    onAuthenticated(user);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (
      (screen === "cadastro" || screen === "redefinir-senha") &&
      password !== confirmation
    ) {
      setError("As senhas precisam coincidir.");
      return;
    }
    setPending(true);
    try {
      if (screen === "login") {
        const user = await api<User>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password, remember, returnTo }),
        });
        if (token) await acceptInvite(user);
        else {
          if (returnTo) history.replaceState({}, "", returnTo);
          onAuthenticated(user);
        }
      } else if (screen === "cadastro") {
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            name,
            email,
            password,
            passwordConfirmation: confirmation,
            termsAccepted: terms,
            returnTo: registrationReturnTo,
          }),
        });
        setMessage("Enviamos um link de confirmação para o seu e-mail.");
      } else if (screen === "esqueci-senha") {
        await api("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        setMessage(
          "Se houver uma conta elegível, você receberá instruções por e-mail.",
        );
      } else if (screen === "redefinir-senha") {
        await api("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({
            token,
            password,
            passwordConfirmation: confirmation,
          }),
        });
        setMessage("Senha atualizada. Agora você já pode entrar.");
      } else if (screen === "verificar-email") {
        const result = await api<{ returnTo?: string }>("/auth/verify-email", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        const verifiedReturnTo = internalPath(result.returnTo ?? null);
        if (verifiedReturnTo) {
          history.pushState(
            {},
            "",
            `/login?returnTo=${encodeURIComponent(verifiedReturnTo)}`,
          );
          setScreen("login");
        }
        setMessage("E-mail confirmado. Agora você já pode entrar.");
      } else if (initialUser) {
        await acceptInvite(initialUser);
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível concluir a operação.",
      );
    } finally {
      setPending(false);
    }
  };
  const passwordField = (
    label: string,
    value: string,
    update: (value: string) => void,
  ) => (
    <label className="auth-field">
      <span>{label}</span>
      <span className="auth-input">
        <LockKeyhole size={16} />
        <input
          type={showPassword ? "text" : "password"}
          required
          minLength={12}
          autoComplete={screen === "login" ? "current-password" : "new-password"}
          value={value}
          onChange={(event) => update(event.target.value)}
          placeholder="No mínimo 12 caracteres"
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
    </label>
  );
  const meta: Record<Screen, { title: string; lead: string }> = {
    login: {
      title: "Bem-vindo de volta",
      lead: "Entre para continuar organizando o que importa.",
    },
    cadastro: {
      title: "Crie sua conta",
      lead: "Comece com uma conta pessoal, segura e verificada.",
    },
    "esqueci-senha": {
      title: "Recupere seu acesso",
      lead: "Enviaremos instruções sem revelar dados da sua conta.",
    },
    "redefinir-senha": {
      title: "Defina uma nova senha",
      lead: "Escolha uma senha longa, única e segura.",
    },
    "verificar-email": {
      title: "Confirme seu e-mail",
      lead: "Ative sua conta para acessar o ATHENA.",
    },
    convite: {
      title: "Você recebeu um convite",
      lead: invite
        ? `Participe de ${invite.workspaceName} como ${invite.role === "EDITOR" ? "editor(a)" : "visualizador(a)"}.`
        : "Estamos validando o convite com segurança.",
    },
  };
  const submitLabel =
    screen === "login"
      ? "Entrar"
      : screen === "cadastro"
        ? "Criar conta"
        : screen === "esqueci-senha"
          ? "Enviar instruções"
          : screen === "redefinir-senha"
            ? "Atualizar senha"
            : screen === "verificar-email"
              ? "Confirmar e-mail"
              : initialUser
                ? "Aceitar convite"
                : "Entrar ou criar conta";
  return (
    <main className="auth-page">
      <header className="auth-nav">
        <button
          className="brand-link"
          type="button"
          onClick={() => go("/")}
        >
          <Brand />
        </button>
      </header>
      <div className="auth-layout">
        <section className="auth-intro">
          <p className="section-kicker">Rastreabilidade em movimento</p>
          <h1>Uma mudança não termina em um único requisito.</h1>
          <p>
            Encontre o contexto que precisa de revisão antes que a decisão se
            propague.
          </p>
          <div className="auth-trace" aria-hidden="true">
            <span className="auth-trace-origin">REQ-142</span>
            <span className="auth-trace-line trace-one" />
            <span className="auth-trace-line trace-two" />
            <span className="auth-trace-node node-one">Critério</span>
            <span className="auth-trace-node node-two">Documento</span>
            <small>3 relações para revisar</small>
          </div>
        </section>
        <form className="auth-card" onSubmit={submit}>
          <div className="sign-in-heading">
            <p className="section-kicker">ATHENA</p>
            <h2>{meta[screen].title}</h2>
            <p className="form-lead">{meta[screen].lead}</p>
          </div>
          {screen === "convite" && invite && (
            <div className="auth-note">
              <strong>{invite.workspaceName}</strong>
              <span>
                O acesso só será concedido à conta confirmada no e-mail que
                recebeu este convite.
              </span>
            </div>
          )}
          {screen === "cadastro" && (
            <label className="auth-field">
              <span>Nome completo</span>
              <span className="auth-input">
                <UserRound size={16} />
                <input
                  required
                  minLength={2}
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Como devemos chamar você?"
                />
              </span>
            </label>
          )}
          {!["redefinir-senha", "verificar-email", "convite"].includes(
            screen,
          ) && (
            <label className="auth-field">
              <span>E-mail</span>
              <span className="auth-input">
                <Mail size={16} />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="voce@empresa.com"
                />
              </span>
            </label>
          )}
          {!["esqueci-senha", "verificar-email", "convite"].includes(screen) &&
            passwordField("Senha", password, setPassword)}
          {(screen === "cadastro" || screen === "redefinir-senha") &&
            passwordField("Confirmar senha", confirmation, setConfirmation)}
          {screen === "cadastro" && (
            <label className="terms-option">
              <input
                type="checkbox"
                required
                checked={terms}
                onChange={(event) => setTerms(event.target.checked)}
              />
              <span>
                Li e aceito os{" "}
                <a
                  href={import.meta.env.VITE_TERMS_URL ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                >
                  Termos
                </a>{" "}
                e a{" "}
                <a
                  href={import.meta.env.VITE_PRIVACY_URL ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                >
                  Política de privacidade
                </a>
                .
              </span>
            </label>
          )}
          {screen === "login" && (
            <div className="sign-in-options">
              <label className="remember-option">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                <span>Lembrar este dispositivo</span>
              </label>
              <button
                type="button"
                className="text-button"
                onClick={() => go("/esqueci-senha")}
              >
                Esqueci minha senha
              </button>
            </div>
          )}
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="auth-note" role="status" aria-live="polite">
              {message}
              {screen === "cadastro" && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    api("/auth/resend-verification", {
                      method: "POST",
                      body: JSON.stringify({ email, returnTo }),
                    })
                      .then(() =>
                        setMessage("Enviamos um novo link de confirmação."),
                      )
                      .catch((reason) =>
                        setError(
                          reason instanceof Error
                            ? reason.message
                            : "Não foi possível reenviar.",
                        ),
                      )
                  }
                >
                  Reenviar confirmação
                </button>
              )}
            </div>
          )}
          <button
            className="primary-button auth-submit"
            disabled={pending || (screen === "convite" && !initialUser)}
          >
            {pending ? "Aguarde…" : submitLabel}
            <ArrowRight size={16} />
          </button>
          {screen === "convite" && !initialUser && (
            <p className="sign-in-switch">
              Já possui conta?{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => go("/login")}
              >
                Entrar
              </button>
              <br />
              Ainda não possui conta?{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => go("/cadastro")}
              >
                Criar conta
              </button>
            </p>
          )}
          {screen === "cadastro" ? (
            <p className="sign-in-switch">
              Já tem uma conta?{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => go("/login")}
              >
                Entrar
              </button>
            </p>
          ) : screen === "login" ? (
            <p className="sign-in-switch">
              Ainda não tem uma conta?{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => go("/cadastro")}
              >
                Criar conta
              </button>
            </p>
          ) : (
            screen !== "convite" && (
              <p className="sign-in-switch">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => go("/login")}
                >
                  Voltar para entrar
                </button>
              </p>
            )
          )}
        </form>
      </div>
    </main>
  );
}
