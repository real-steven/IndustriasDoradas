import type { Session } from "@supabase/supabase-js";
import { useEffect, useState, type PropsWithChildren } from "react";

import { apiRequest } from "../api/http";
import { getSupabaseClient } from "./supabase-client";
import {
  AuthContext,
  type ApplicationSession,
  type AuthState,
} from "./auth-context";

export function AuthProvider({ children }: PropsWithChildren) {
  const [supabase] = useState(() => getSupabaseClient());
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ApplicationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apply = async (next: Session | null) => {
      setSession(next);
      setError(null);
      if (next === null) {
        setProfile(null);
        setLoading(false);
        return;
      }
      try {
        setProfile(
          await apiRequest<ApplicationSession>(
            "/auth/session",
            next.access_token,
          ),
        );
      } catch {
        setProfile(null);
        setError("La cuenta no tiene acceso vigente al portal.");
      } finally {
        setLoading(false);
      }
    };
    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setLoading(true);
      void apply(next);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const value: AuthState = {
    session,
    profile,
    loading,
    error,
    async signIn(email, password) {
      setError(null);
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) throw new Error("Correo o contraseña inválidos.");
    },
    async recover(email) {
      const { error: recoveryError } =
        await supabase.auth.resetPasswordForEmail(email);
      if (recoveryError)
        throw new Error("No se pudo solicitar la recuperación.");
    },
    async signOut() {
      await supabase.auth.signOut();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
