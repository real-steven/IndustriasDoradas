import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "./auth-context";

export function LoginPage() {
  const auth = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (auth.profile !== null) {
    return (
      <Navigate
        to={
          auth.profile.role === "JEFE_EMPRESA" ? "/gerencia" : "/administracion"
        }
        replace
      />
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      await auth.signIn(
        formString(form, "email"),
        formString(form, "password"),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo iniciar sesión.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function recover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      await auth.recover(formString(form, "recoveryEmail"));
      setMessage("Si la cuenta existe, se enviaron instrucciones al correo.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo solicitar recuperación.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="contenido-principal" className="auth-page">
      <section className="page-card auth-card" aria-labelledby="login-title">
        <p className="eyebrow">Acceso protegido</p>
        <h1 id="login-title">Portal de gestión</h1>
        {auth.error && (
          <p role="alert" className="message error">
            {auth.error}
          </p>
        )}
        {message && (
          <p role="status" className="message">
            {message}
          </p>
        )}
        <form onSubmit={(event) => void submit(event)} className="form-stack">
          <label htmlFor="email">Correo</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
          />
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <button disabled={busy} type="submit">
            Iniciar sesión
          </button>
        </form>
        <form
          onSubmit={(event) => void recover(event)}
          className="recovery-form"
        >
          <label htmlFor="recoveryEmail">Correo para recuperación</label>
          <input
            id="recoveryEmail"
            name="recoveryEmail"
            type="email"
            required
          />
          <button disabled={busy} type="submit" className="secondary">
            Recuperar contraseña
          </button>
        </form>
      </section>
    </main>
  );
}

function formString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
