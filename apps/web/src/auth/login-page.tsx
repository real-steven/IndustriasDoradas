import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "./auth-context";

const rememberedEmailKey = "industrias-doradas:recent-email";

export function LoginPage() {
  const auth = useAuth();
  const [rememberedEmail] = useState(loadRememberedEmail);
  const [email, setEmail] = useState(rememberedEmail);
  const [rememberEmail, setRememberEmail] = useState(
    rememberedEmail.length > 0,
  );
  const [feedback, setFeedback] = useState<{
    kind: "error" | "status";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  if (auth.profile !== null) {
    return <Navigate to="/gerencia" replace />;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    const form = new FormData(event.currentTarget);
    try {
      await auth.signIn(email.trim(), formString(form, "password"));
      saveEmailPreference(email, rememberEmail);
    } catch (error) {
      setFeedback({
        kind: "error",
        text:
          error instanceof Error ? error.message : "No se pudo iniciar sesión.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function recover() {
    const normalizedEmail = email.trim();
    if (normalizedEmail.length === 0) {
      setFeedback({
        kind: "error",
        text: "Ingrese su correo antes de solicitar la recuperación.",
      });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await auth.recover(normalizedEmail);
      setFeedback({
        kind: "status",
        text: "Si la cuenta existe, se enviaron instrucciones al correo.",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "No se pudo solicitar recuperación.",
      });
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
              <small>Portal gerencial</small>
            </span>
          </div>

          <div className="auth-brand-copy">
            <p className="eyebrow light">CONTROL GERENCIAL</p>
            <h2>La planta, lista para consultarse.</h2>
            <p>
              Un único acceso protege la información consolidada y mantiene la
              gestión separada de los controles físicos de producción.
            </p>
          </div>

          <div className="auth-protection-status">
            <span aria-hidden="true" />
            <div>
              <strong>Datos centrales protegidos</strong>
              <small>Acceso exclusivo para la cuenta gerencial</small>
            </div>
          </div>
        </aside>

        <section className="auth-form-panel">
          <header>
            <p className="eyebrow">ACCESO PROTEGIDO</p>
            <h1 id="login-title">Bienvenido</h1>
            <p>
              Ingrese sus credenciales gerenciales para consultar la operación
              de la planta.
            </p>
          </header>

          <form onSubmit={(event) => void submit(event)} className="auth-form">
            <label htmlFor="email">CORREO</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
              required
            />

            <label htmlFor="password">CONTRASEÑA</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              disabled={busy}
              required
            />

            <div className="auth-form-options">
              <label className="auth-remember">
                <input
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={(event) => setRememberEmail(event.target.checked)}
                  disabled={busy}
                />
                <span>Recordar correo</span>
              </label>
              <button
                type="button"
                className="auth-recovery"
                disabled={busy}
                onClick={() => void recover()}
              >
                ¿Olvidó su contraseña?
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
                {auth.error ?? feedback?.text}
              </p>
            )}

            <button className="auth-submit" disabled={busy} type="submit">
              {busy ? "INGRESANDO…" : "INGRESAR AL PORTAL →"}
            </button>
          </form>

          <p className="auth-secure-note">
            <span aria-hidden="true">🔒</span> Sesión protegida y auditable
          </p>
        </section>
      </section>
    </main>
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

function saveEmailPreference(email: string, remember: boolean): void {
  try {
    if (remember) window.localStorage.setItem(rememberedEmailKey, email.trim());
    else window.localStorage.removeItem(rememberedEmailKey);
  } catch {
    // La preferencia nunca debe impedir el inicio de sesión.
  }
}
