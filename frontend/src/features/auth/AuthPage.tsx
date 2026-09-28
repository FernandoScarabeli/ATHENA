import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  CircleCheck,
  CircleX,
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
type InviteContext = { workspaceName: string; projectName?: string; projectId?: string; workspaceId?: string; scope?: "PROJECT" | "WORKSPACE"; role: "OWNER" | "MANAGER" | "EDITOR" | "VIEWER" };
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
const inviteTokenFromReturnTo = (value?: string) => {
  if (!value) return undefined;
  try {
    const destination = new URL(value, location.origin);
    return destination.origin === location.origin && destination.pathname === '/convites/aceitar'
      ? destination.searchParams.get('token') ?? undefined
      : undefined;
  } catch {
    return undefined;
  }
};
const REMEMBER_DEVICE_PREFERENCE_KEY = "athena.remember-device-preference";
const PASSWORD_RESET_SESSION_KEY = "athena.password-reset-session";

function getPasswordResetSession() {
  if (currentScreen() !== "esqueci-senha") {
    return { email: "", codeRequested: false };
  }
  try {
    const stored = sessionStorage.getItem(PASSWORD_RESET_SESSION_KEY);
    if (!stored) return { email: "", codeRequested: false };
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "email" in parsed &&
      typeof parsed.email === "string" &&
      "codeRequested" in parsed &&
      parsed.codeRequested === true
    ) {
      return { email: parsed.email, codeRequested: true };
    }
  } catch {
    // Keep the recovery flow usable when session storage is unavailable.
  }
  return { email: "", codeRequested: false };
}

function getRememberDevicePreference() {
  try {
    return localStorage.getItem(REMEMBER_DEVICE_PREFERENCE_KEY) === "true";
  } catch {
    return false;
  }
}

export function AuthPage({
  onAuthenticated,
  initialUser,
}: {
  onAuthenticated: (user: User) => void;
  initialUser?: User | null;
}) {
  const [screen, setScreen] = useState(currentScreen);
  const [recoverySession] = useState(getPasswordResetSession);
  const [email, setEmail] = useState(recoverySession.email);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetCodeRequested, setResetCodeRequested] = useState(
    recoverySession.codeRequested,
  );
  const [remember, setRemember] = useState(getRememberDevicePreference);
  const [terms, setTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [invite, setInvite] = useState<InviteContext | null>(null);
  const cardRef = useRef<HTMLFormElement>(null);
  const screenContentRef = useRef<HTMLDivElement>(null);
  const cardAnimationRef = useRef<Animation | null>(null);
  const previousCardHeight = useRef<number | null>(null);
  const previousContentHeight = useRef<number | null>(null);
  const viewKey = `${screen}:${resetCodeRequested}`;
  const previousViewKey = useRef(viewKey);
  const hasRenderedInitialScreen = useRef(false);
  const query = useMemo(() => new URLSearchParams(location.search), [screen]);
  const token = query.get("token") ?? "";
  const directProjectReturn = /^\/projects\/[^/]+(?:\/requirements\/[^/]+\/edit|\/(?:overview|map|requirements|cancelled|imports))?\/?$/.test(location.pathname)
    ? `${location.pathname}${location.search}${location.hash}`
    : undefined;
  const returnTo = internalPath(query.get("returnTo")) ?? directProjectReturn;
  const registrationReturnTo =
    screen === "cadastro" && token
      ? `/convites/aceitar?token=${encodeURIComponent(token)}`
      : returnTo;
  useLayoutEffect(() => {
    const card = cardRef.current;
    const content = screenContentRef.current;
    if (!card || !content) return;

    const contentHeight = content.getBoundingClientRect().height;
    const viewChanged = previousViewKey.current !== viewKey;
    const contentChanged =
      previousContentHeight.current !== null &&
      Math.abs(contentHeight - previousContentHeight.current) > 1;

    if (previousCardHeight.current === null) {
      previousCardHeight.current = card.getBoundingClientRect().height;
      previousContentHeight.current = contentHeight;
      return;
    }
    if (!viewChanged && !contentChanged) return;

    const activeAnimation = cardAnimationRef.current;
    const fromHeight = activeAnimation
      ? card.getBoundingClientRect().height
      : previousCardHeight.current;
    if (activeAnimation) {
      activeAnimation.cancel();
      cardAnimationRef.current = null;
      card.style.overflow = "";
    }

    const toHeight = card.getBoundingClientRect().height;
    previousCardHeight.current = toHeight;
    previousContentHeight.current = contentHeight;
    previousViewKey.current = viewKey;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !card.animate || (!viewChanged && Math.abs(toHeight - fromHeight) < 3)) {
      return;
    }

    const growing = toHeight >= fromHeight;
    const overshoot = toHeight + (growing ? 8 : -8);
    const frames: Keyframe[] = viewChanged
      ? [
          { height: `${fromHeight}px`, transform: "translateY(0) scale(1)", offset: 0 },
          {
            height: `${fromHeight + (toHeight - fromHeight) * 0.62}px`,
            transform: "translateY(9px) scale(.992)",
            offset: 0.38,
          },
          { height: `${overshoot}px`, transform: "translateY(-4px) scale(1.01)", offset: 0.78 },
          { height: `${toHeight}px`, transform: "translateY(0) scale(1)", offset: 1 },
        ]
      : [
          { height: `${fromHeight}px`, offset: 0 },
          { height: `${toHeight + (growing ? 3 : -3)}px`, offset: 0.78 },
          { height: `${toHeight}px`, offset: 1 },
        ];

    card.style.overflow = "hidden";
    const animation = card.animate(frames, {
      duration: viewChanged ? 430 : 260,
      easing: "cubic-bezier(.2,.72,.22,1)",
      fill: "backwards",
    });
    cardAnimationRef.current = animation;
    animation.onfinish = () => {
      if (cardAnimationRef.current !== animation) return;
      cardAnimationRef.current = null;
      card.style.overflow = "";
      previousCardHeight.current = card.getBoundingClientRect().height;
    };
  });
  useEffect(() => {
    const card = cardRef.current;
    const content = screenContentRef.current;
    if (!card || !content || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (cardAnimationRef.current) return;
      previousCardHeight.current = card.getBoundingClientRect().height;
      previousContentHeight.current = content.getBoundingClientRect().height;
    });
    observer.observe(card);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!hasRenderedInitialScreen.current) {
      hasRenderedInitialScreen.current = true;
      return;
    }

    const content = screenContentRef.current;
    if (!content) return;

    content
      .querySelector<HTMLElement>("[data-auth-autofocus]")
      ?.focus({ preventScroll: true });

    if (!content.animate) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const animation = content.animate(
      reduceMotion
        ? [{ opacity: 0.72 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "translateY(5px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
      {
        duration: reduceMotion ? 140 : 270,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    );

    return () => animation.cancel();
  }, [screen, resetCodeRequested]);
  const updateRememberPreference = (value: boolean) => {
    setRemember(value);
    try {
      localStorage.setItem(REMEMBER_DEVICE_PREFERENCE_KEY, String(value));
    } catch {
      // Keep the checkbox usable when browser storage is unavailable.
    }
  };
  useEffect(() => {
    const onPop = () => setScreen(currentScreen());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    try {
      if (screen === "esqueci-senha" && resetCodeRequested && email) {
        sessionStorage.setItem(
          PASSWORD_RESET_SESSION_KEY,
          JSON.stringify({ email, codeRequested: true }),
        );
      } else {
        sessionStorage.removeItem(PASSWORD_RESET_SESSION_KEY);
      }
    } catch {
      // Keep the recovery flow usable when session storage is unavailable.
    }
  }, [screen, resetCodeRequested, email]);
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
    const inviteToken = screen === "convite" || (screen === "cadastro" && inviteTokenFromReturnTo(registrationReturnTo))
      ? token
      : undefined;
    if (preservedReturn) params.set("returnTo", preservedReturn);
    if (inviteToken) params.set("token", inviteToken);
    Object.entries(extra).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const suffix = params.size ? `?${params.toString()}` : "";
    setError("");
    setMessage("");
    setResetCodeRequested(false);
    setResetCode("");
    history.pushState({}, "", `${path}${suffix}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    setScreen(currentScreen());
  };
  const acceptInvite = async (user: User) => {
    const result = await api<{ workspaceId: string; projectId?: string }>("/invites/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    const destination = result.projectId
      ? `/projects/${encodeURIComponent(result.projectId)}`
      : `/?workspace=${encodeURIComponent(result.workspaceId)}`;
    history.replaceState({}, "", destination);
    window.dispatchEvent(new PopStateEvent("popstate"));
    onAuthenticated(user);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    const creatingPassword =
      screen === "cadastro" ||
      screen === "redefinir-senha" ||
      (screen === "esqueci-senha" && resetCodeRequested);
    if (creatingPassword) {
      if (password.length < 8) {
        setError("A senha deve ter pelo menos 8 caracteres.");
        return;
      }
      if (!/\p{L}/u.test(password) || !/\p{N}/u.test(password) || !/[^\p{L}\p{N}\s]/u.test(password)) {
        setError("A senha deve conter uma letra, um número e um caractere especial.");
        return;
      }
    }
    if (
      (screen === "cadastro" ||
        screen === "redefinir-senha" ||
        (screen === "esqueci-senha" && resetCodeRequested)) &&
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
        if (!resetCodeRequested) {
          await api("/auth/forgot-password", {
            method: "POST",
            body: JSON.stringify({ email }),
          });
          setResetCodeRequested(true);
          setMessage(
            "Se houver uma conta com esse e-mail, enviaremos um código para redefinir sua senha.",
          );
        } else {
          await api("/auth/reset-password", {
            method: "POST",
            body: JSON.stringify({
              email,
              code: resetCode,
              password,
              passwordConfirmation: confirmation,
            }),
          });
          const loginPath = returnTo
            ? `/login?returnTo=${encodeURIComponent(returnTo)}`
            : "/login";
          history.replaceState({}, "", loginPath);
          setScreen("login");
          setResetCodeRequested(false);
          setResetCode("");
          setPassword("");
          setConfirmation("");
          setMessage("Senha atualizada. Entre com sua nova senha.");
        }
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
          const acceptedInviteToken = inviteTokenFromReturnTo(verifiedReturnTo);
          history.pushState({}, "", acceptedInviteToken
            ? `/login?token=${encodeURIComponent(acceptedInviteToken)}`
            : `/login?returnTo=${encodeURIComponent(verifiedReturnTo)}`);
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
  ) => {
    const isNewPassword = screen !== "login";
    const isPrimaryPassword = label === "Senha";
    const passwordChecks = [
      { label: "8 caracteres", valid: value.length >= 8 },
      { label: "Letras", valid: /\p{L}/u.test(value) },
      { label: "Números", valid: /\p{N}/u.test(value) },
      { label: "Caractere especial", valid: /[^\p{L}\p{N}\s]/u.test(value) },
    ];

    return (
      <label className="auth-field">
        <span>{label}</span>
        <span
          className="auth-input"
          onFocusCapture={() => {
            if (isNewPassword && isPrimaryPassword) setPasswordFocused(true);
          }}
          onBlurCapture={(event) => {
            if (
              isNewPassword &&
              isPrimaryPassword &&
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            ) {
              setPasswordFocused(false);
            }
          }}
        >
          <LockKeyhole size={16} />
          <input
          type={showPassword ? "text" : "password"}
          required
          minLength={screen === "login" ? undefined : 8}
          data-auth-autofocus={screen === "redefinir-senha" && label === "Senha" ? "" : undefined}
          autoComplete={screen === "login" ? "current-password" : "new-password"}
          value={value}
          onChange={(event) => update(event.target.value)}
          placeholder={
            screen === "login"
              ? "Sua senha"
              : isPrimaryPassword
                ? "Sua senha super segura"
                : "Confirme sua senha"
          }
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
        {isNewPassword && isPrimaryPassword && (passwordFocused || value.length > 0) && (
          <ul className="password-checklist" aria-label="Requisitos da senha">
            {passwordChecks.map(({ label: checkLabel, valid }) => (
              <li data-valid={valid} key={checkLabel}>
                {valid ? (
                  <CircleCheck size={15} aria-hidden="true" />
                ) : (
                  <CircleX size={15} aria-hidden="true" />
                )}
                <span>{checkLabel}</span>
              </li>
            ))}
          </ul>
        )}
        {isNewPassword && label === "Confirmar senha" && value.length > 0 && (
          <ul className="password-checklist" aria-label="Confirmação da senha" aria-live="polite">
            <li data-valid={value === password}>
              {value === password ? (
                <CircleCheck size={15} aria-hidden="true" />
              ) : (
                <CircleX size={15} aria-hidden="true" />
              )}
              <span>{value === password ? "As senhas são iguais." : "As senhas devem ser iguais."}</span>
            </li>
          </ul>
        )}
      </label>
    );
  };
  const meta: Record<Screen, { title: string; lead: string }> = {
    login: {
      title: "Entrar",
      lead: "Acesse sua conta ATHENA.",
    },
    cadastro: {
      title: "Criar conta",
      lead: "Crie seu acesso ao ATHENA.",
    },
    "esqueci-senha": {
      title: resetCodeRequested ? "Criar nova senha" : "Recuperar acesso",
      lead: resetCodeRequested
        ? "Digite o código recebido e escolha uma nova senha."
        : "Informe o e-mail da sua conta para receber um código.",
    },
    "redefinir-senha": {
      title: "Criar nova senha",
      lead: "Escolha uma nova senha para sua conta.",
    },
    "verificar-email": {
      title: "Confirmar e-mail",
      lead: "Confirme seu endereço para acessar o ATHENA.",
    },
    convite: {
      title: invite ? `Convite para ${invite.projectName ?? invite.workspaceName}` : "Abrir convite",
      lead: invite
        ? `Acesso como ${invite.role === "MANAGER" ? "gerente" : invite.role === "OWNER" ? "Owner" : invite.role === "EDITOR" ? "editor(a)" : "leitor(a)"}.`
        : "Validando convite…",
    },
  };
  const submitLabel =
    screen === "login"
      ? "Entrar"
      : screen === "cadastro"
        ? "Criar conta"
        : screen === "esqueci-senha"
          ? resetCodeRequested
            ? "Redefinir senha"
            : "Enviar código"
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
        <form className="auth-card" ref={cardRef} onSubmit={submit}>
          <div className="auth-screen-content" ref={screenContentRef}>
          <div className="sign-in-heading">
            <h2>{meta[screen].title}</h2>
            <p className="form-lead">{meta[screen].lead}</p>
          </div>
          {screen === "convite" && invite && (
            <p className="auth-context">
              Aceite o convite com a conta confirmada no e-mail que o recebeu.
            </p>
          )}
          {screen === "cadastro" && (
            <label className="auth-field">
              <span>Nome completo</span>
              <span className="auth-input">
                <UserRound size={16} aria-hidden="true" />
                <input
                  required
                  minLength={2}
                  data-auth-autofocus
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Seu nome"
                />
              </span>
            </label>
          )}
          {screen === "esqueci-senha" && resetCodeRequested ? (
            <div className="auth-reset-address">
              <span>Código solicitado para</span>
              <strong>{email}</strong>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setResetCodeRequested(false);
                  setResetCode("");
                  setPassword("");
                  setConfirmation("");
                  setError("");
                  setMessage("");
                }}
              >
                Usar outro e-mail
              </button>
            </div>
          ) : null}
          {!["redefinir-senha", "verificar-email", "convite"].includes(
            screen,
          ) && !(screen === "esqueci-senha" && resetCodeRequested) && (
            <label className="auth-field">
              <span>E-mail</span>
              <span className="auth-input">
                <Mail size={16} aria-hidden="true" />
                <input
                  type="email"
                  required
                  data-auth-autofocus
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="voce@empresa.com"
                />
              </span>
            </label>
          )}
          {screen === "esqueci-senha" && resetCodeRequested && (
            <label className="auth-field">
              <span>Código de 6 dígitos</span>
              <span className="otp-field">
                <input
                  id="reset-code"
                  className="otp-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  data-auth-autofocus
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  autoFocus
                  aria-describedby="reset-code-help"
                  value={resetCode}
                  onChange={(event) =>
                    setResetCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
                <span className="otp-slots" aria-hidden="true">
                  {Array.from({ length: 6 }, (_, index) => (
                    <span
                      className="otp-slot"
                      data-current={resetCode.length === index}
                      key={index}
                    >
                  {resetCode[index] ? (
                    <span
                      className="otp-digit"
                      key={`${index}-${resetCode[index]}`}
                    >
                      {resetCode[index]}
                    </span>
                  ) : null}
                    </span>
                  ))}
                </span>
              </span>
              <span id="reset-code-help" className="auth-hint">
                O código expira em 10 minutos.
              </span>
            </label>
          )}
          {(screen === "login" ||
            screen === "cadastro" ||
            screen === "redefinir-senha" ||
            (screen === "esqueci-senha" && resetCodeRequested)) &&
            passwordField("Senha", password, setPassword)}
          {(screen === "cadastro" ||
            screen === "redefinir-senha" ||
            (screen === "esqueci-senha" && resetCodeRequested)) &&
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
                  onChange={(event) =>
                    updateRememberPreference(event.target.checked)
                  }
                />
                <span className="custom-checkbox" aria-hidden="true">
                  {remember && <Check size={12} strokeWidth={2.5} />}
                </span>
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
          {screen === "esqueci-senha" && resetCodeRequested && (
            <button
              type="button"
              className="text-button auth-resend-code"
              disabled={pending}
              onClick={() => {
                setError("");
                setMessage("");
                setPending(true);
                api("/auth/forgot-password", {
                  method: "POST",
                  body: JSON.stringify({ email }),
                })
                  .then(() =>
                    setMessage(
                      "Se houver uma conta com esse e-mail, enviaremos um novo código.",
                    ),
                  )
                  .catch((reason) =>
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : "Não foi possível reenviar o código.",
                    ),
                  )
                  .finally(() => setPending(false));
              }}
            >
              Reenviar código
            </button>
          )}
          {error && (
            <p className="auth-feedback is-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="auth-feedback" role="status" aria-live="polite">
              {message}
            </p>
          )}
          {message && screen === "cadastro" && (
            <button
              type="button"
              className="text-button auth-resend-code"
              disabled={pending}
              onClick={() => {
                setError("");
                setPending(true);
                api("/auth/resend-verification", {
                  method: "POST",
                  body: JSON.stringify({ email, returnTo }),
                })
                  .then(() => setMessage("Enviamos um novo link de confirmação."))
                  .catch((reason) =>
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : "Não foi possível reenviar.",
                    ),
                  )
                  .finally(() => setPending(false));
              }}
            >
              Reenviar confirmação
            </button>
          )}
          <button
            className="primary-button auth-submit"
            data-auth-autofocus={
              screen === "verificar-email" || (screen === "convite" && initialUser)
                ? ""
                : undefined
            }
            disabled={pending || (screen === "convite" && !initialUser)}
          >
            {pending ? "Aguarde…" : submitLabel}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          {screen === "convite" && !initialUser && (
            <p className="sign-in-switch auth-switch">
              Já tem uma conta?{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => go("/login")}
              >
                Entrar
              </button>
              <span> · </span>
              Ainda não tem?{" "}
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
            <p className="sign-in-switch auth-switch">
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
            <p className="sign-in-switch auth-switch">
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
            (screen !== "convite" || initialUser) && (
              <p className="sign-in-switch auth-switch">
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
          </div>
        </form>
      </div>
    </main>
  );
}
