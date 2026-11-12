import { useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { Navigate } from "react-router-dom";

import { translateKnownMessage, useLanguage } from "../i18n/language-context";
import { LanguageSwitcher } from "../i18n/language-switcher";
import { useAuth } from "./auth-context";

const rememberedEmailKey = "industrias-doradas:recent-email";
const emailDraftKey = "industrias-doradas:login-email-draft";
const emailDraftTtlMs = 5 * 60 * 1_000;

export function LoginPage() {
  const auth = useAuth();
  const { language, tr } = useLanguage();
  const [rememberedEmail] = useState(loadRememberedEmail);
  const [email, setEmail] = useState(loadInitialEmail);
  const [rememberEmail, setRememberEmail] = useState(
    rememberedEmail.length > 0,
  );
  const [feedback, setFeedback] = useState<{
    kind: "error" | "status";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  // Solo controla la visibilidad; el valor vive en el input y nunca se guarda en estado.
  const [passwordVisible, setPasswordVisible] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  if (auth.profile !== null) {
    return <Navigate to="/gerencia" replace />;
  }

  function togglePasswordVisibility() {
    const input = passwordRef.current;
    const keepFieldFocus = input !== null && document.activeElement === input;
    const selectionStart = input?.selectionStart ?? null;
    const selectionEnd = input?.selectionEnd ?? null;
    flushSync(() => setPasswordVisible((visible) => !visible));
    if (input === null || !keepFieldFocus) return;
    input.focus();
    if (selectionStart !== null && selectionEnd !== null) {
      input.setSelectionRange(selectionStart, selectionEnd);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Los administradores de contraseñas esperan el campo oculto al enviar.
    flushSync(() => setPasswordVisible(false));
    setBusy(true);
    setFeedback(null);
    const form = new FormData(event.currentTarget);
    try {
      await auth.signIn(email.trim(), formString(form, "password"));
      saveEmailPreference(email, rememberEmail);
      clearEmailDraft();
    } catch (error) {
      setFeedback({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : tr("No se pudo iniciar sesión.", "Could not sign in."),
      });
    } finally {
      setBusy(false);
    }
  }

  const passwordToggleLabel = passwordVisible
    ? tr("Ocultar contraseña", "Hide password")
    : tr("Mostrar contraseña", "Show password");

  async function recover() {
    const normalizedEmail = email.trim();
    if (normalizedEmail.length === 0) {
      setFeedback({
        kind: "error",
        text: tr(
          "Ingrese su correo antes de solicitar la recuperación.",
          "Enter your email before requesting password recovery.",
        ),
      });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await auth.recover(normalizedEmail);
      setFeedback({
        kind: "status",
        text: tr(
          "Si la cuenta existe, se enviaron instrucciones al correo.",
          "If the account exists, instructions have been sent by email.",
        ),
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : tr(
                "No se pudo solicitar recuperación.",
                "Password recovery could not be requested.",
              ),
      });
    } finally {
      setBusy(false);
    }
  }

  async function continueFoundSession() {
    setBusy(true);
    setFeedback(null);
    try {
      await auth.continueFoundSession();
    } catch {
      setFeedback({
        kind: "error",
        text: tr(
          "No se pudo abrir la sesión encontrada.",
          "The saved session could not be opened.",
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  async function switchAccount() {
    setBusy(true);
    setFeedback(null);
    setPasswordVisible(false);
    try {
      await auth.signOut();
      setEmail("");
      clearEmailDraft();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="contenido-principal" className="auth-page">
      <section className="auth-window" aria-labelledby="login-title">
        <aside className="auth-brand-panel" aria-label="Industrias Doradas">
          <div className="auth-brand">
            <img src="/logo-industrias-doradas.svg" alt="" />
            <span>
              <strong>INDUSTRIAS</strong>
              <strong>DORADAS</strong>
              <small>{tr("Portal gerencial", "Management portal")}</small>
            </span>
          </div>

          <div className="auth-brand-copy">
            <p className="eyebrow light">
              {tr("CONTROL GERENCIAL", "MANAGEMENT CONTROL")}
            </p>
            <h2>
              {tr(
                "La planta, lista para consultarse.",
                "The plant, ready for review.",
              )}
            </h2>
            <p>
              {tr(
                "Un único acceso protege la información consolidada y mantiene la gestión separada de los controles físicos de producción.",
                "A single access point protects consolidated information and keeps management separate from physical production controls.",
              )}
            </p>
          </div>

          <div className="auth-protection-status">
            <span aria-hidden="true" />
            <div>
              <strong>
                {tr("Información protegida", "Protected information")}
              </strong>
              <small>
                {tr(
                  "Acceso exclusivo para la cuenta gerencial",
                  "Exclusive access for the management account",
                )}
              </small>
            </div>
          </div>
        </aside>

        <section className="auth-form-panel">
          <div className="auth-language">
            <LanguageSwitcher compact />
          </div>
          {auth.foundSession === null ? (
            <>
              <header>
                <p className="eyebrow">
                  {tr("ACCESO PROTEGIDO", "PROTECTED ACCESS")}
                </p>
                <h1 id="login-title">{tr("Bienvenido", "Welcome")}</h1>
                <p>
                  {tr(
                    "Ingrese sus credenciales gerenciales para consultar la operación de la planta.",
                    "Enter your management credentials to review plant operations.",
                  )}
                </p>
              </header>

              <form
                onSubmit={(event) => void submit(event)}
                className="auth-form"
              >
                <label htmlFor="email">{tr("CORREO", "EMAIL")}</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => {
                    const nextEmail = event.target.value;
                    setEmail(nextEmail);
                    saveEmailDraft(nextEmail);
                  }}
                  disabled={busy}
                  required
                />

                <label htmlFor="password">{tr("CONTRASEÑA", "PASSWORD")}</label>
                <div className="auth-password-field">
                  <input
                    ref={passwordRef}
                    id="password"
                    name="password"
                    type={passwordVisible ? "text" : "password"}
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={busy}
                    required
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    aria-controls="password"
                    aria-label={passwordToggleLabel}
                    title={passwordToggleLabel}
                    disabled={busy}
                    // Con mouse el foco y el cursor se quedan en el campo de contraseña.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={togglePasswordVisibility}
                  >
                    <PasswordVisibilityIcon visible={passwordVisible} />
                  </button>
                </div>

                <div className="auth-form-options">
                  <label className="auth-remember">
                    <input
                      type="checkbox"
                      checked={rememberEmail}
                      onChange={(event) =>
                        setRememberEmail(event.target.checked)
                      }
                      disabled={busy}
                    />
                    <span>{tr("Recordar correo", "Remember email")}</span>
                  </label>
                  <button
                    type="button"
                    className="auth-recovery"
                    disabled={busy}
                    onClick={() => void recover()}
                  >
                    {tr("¿Olvidó su contraseña?", "Forgot your password?")}
                  </button>
                </div>

                {(auth.error !== null || feedback !== null) && (
                  <p
                    role={
                      auth.error !== null || feedback?.kind === "error"
                        ? "alert"
                        : "status"
                    }
                    className={`auth-feedback${auth.error !== null || feedback?.kind === "error" ? " error" : ""}`}
                  >
                    {translateKnownMessage(
                      auth.error ?? feedback?.text ?? "",
                      language,
                    )}
                  </p>
                )}

                <button className="auth-submit" disabled={busy} type="submit">
                  {busy
                    ? tr("INGRESANDO…", "SIGNING IN…")
                    : tr("INGRESAR AL PORTAL →", "ENTER PORTAL →")}
                </button>
              </form>
            </>
          ) : (
            <section className="auth-found-session" aria-live="polite">
              <header>
                <p className="eyebrow">
                  {tr("SESIÓN ENCONTRADA", "SESSION FOUND")}
                </p>
                <h1 id="login-title">
                  {tr("Sesión disponible", "Session available")}
                </h1>
                <p>
                  {tr(
                    "Encontramos una sesión guardada en este navegador. Confirme si desea continuar.",
                    "We found a saved session in this browser. Confirm whether you want to continue.",
                  )}
                </p>
              </header>

              <div className="auth-found-account">
                <span aria-hidden="true" />
                <div>
                  <small>{tr("CUENTA GERENCIAL", "MANAGEMENT ACCOUNT")}</small>
                  <strong>{auth.foundSession.email}</strong>
                </div>
              </div>

              {(auth.error !== null || feedback !== null) && (
                <p
                  role="alert"
                  className={`auth-feedback${auth.error !== null || feedback?.kind === "error" ? " error" : ""}`}
                >
                  {translateKnownMessage(
                    auth.error ?? feedback?.text ?? "",
                    language,
                  )}
                </p>
              )}

              <button
                className="auth-submit"
                disabled={busy || auth.loading}
                type="button"
                onClick={() => void continueFoundSession()}
              >
                {busy || auth.loading
                  ? tr("ABRIENDO SESIÓN…", "OPENING SESSION…")
                  : tr(
                      "CONTINUAR CON ESTA CUENTA →",
                      "CONTINUE WITH THIS ACCOUNT →",
                    )}
              </button>
              <button
                className="auth-switch-account"
                disabled={busy || auth.loading}
                type="button"
                onClick={() => void switchAccount()}
              >
                {tr("USAR OTRA CUENTA", "USE ANOTHER ACCOUNT")}
              </button>
            </section>
          )}

          <p className="auth-secure-note">
            <span aria-hidden="true">🔒</span>{" "}
            {tr(
              "Sesión protegida y auditable",
              "Protected and auditable session",
            )}
          </p>
        </section>
      </section>
    </main>
  );
}

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-icon={visible ? "hide-password" : "show-password"}
    >
      <path d="M1.5 10C4 5.2 7 3.8 10 3.8S16 5.2 18.5 10C16 14.8 13 16.2 10 16.2S4 14.8 1.5 10Z" />
      <circle cx="10" cy="10" r="3" />
      {visible && <path d="M3 2.5 17 17.5" />}
    </svg>
  );
}

function formString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function loadRememberedEmail(): string {
  try {
    return window.localStorage.getItem(rememberedEmailKey)?.trim() ?? "";
  } catch {
    return "";
  }
}

function loadInitialEmail(): string {
  const draft = loadEmailDraft();
  return draft ?? loadRememberedEmail();
}

function loadEmailDraft(): string | null {
  try {
    const raw = window.localStorage.getItem(emailDraftKey);
    if (raw === null) return null;
    const value = JSON.parse(raw) as { email?: unknown; expiresAt?: unknown };
    if (
      typeof value.email !== "string" ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt <= Date.now()
    ) {
      clearEmailDraft();
      return null;
    }
    return value.email;
  } catch {
    clearEmailDraft();
    return null;
  }
}

function saveEmailDraft(email: string): void {
  try {
    if (email.length === 0) {
      clearEmailDraft();
      return;
    }
    window.localStorage.setItem(
      emailDraftKey,
      JSON.stringify({ email, expiresAt: Date.now() + emailDraftTtlMs }),
    );
  } catch {
    // El borrador temporal nunca debe impedir el inicio de sesión.
  }
}

function clearEmailDraft(): void {
  try {
    window.localStorage.removeItem(emailDraftKey);
  } catch {
    // El almacenamiento puede estar deshabilitado por el navegador.
  }
}

function saveEmailPreference(email: string, remember: boolean): void {
  try {
    if (remember) window.localStorage.setItem(rememberedEmailKey, email.trim());
    else window.localStorage.removeItem(rememberedEmailKey);
  } catch {
    // La preferencia nunca debe impedir el inicio de sesión.
  }
}
