import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type PropsWithChildren } from "react";

import {
  ApiConnectionError,
  ApiRequestError,
  apiRequestTimeoutMs,
  apiRequest,
  requestErrorMessage,
  unauthorizedEventName,
} from "../api/http";
import { getSupabaseClient } from "./supabase-client";
import {
  AuthContext,
  type ApplicationSession,
  type AuthState,
} from "./auth-context";

interface AuthProviderProps extends PropsWithChildren {
  client?: SupabaseClient;
}

export function AuthProvider({ children, client }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const [supabase] = useState(() => client ?? getSupabaseClient());
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ApplicationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const currentUserId = useRef<string | null>(null);
  const hasApplicationSession = useRef(false);

  useEffect(() => {
    if (!loading) return;
    const timeout = window.setTimeout(() => {
      setError("No fue posible comprobar la sesión. Intente nuevamente.");
      setLoading(false);
    }, apiRequestTimeoutMs);
    return () => window.clearTimeout(timeout);
  }, [loading]);

  useEffect(() => {
    let active = true;
    let lastAccessToken: string | null | undefined;
    let pendingSignedOutMessage: string | null = null;

    const apply = async (next: Session | null) => {
      const generation = ++requestGeneration.current;
      if (!active) return;

      if (next === null) {
        currentUserId.current = null;
        hasApplicationSession.current = false;
        queryClient.clear();
        setSession(null);
        setProfile(null);
        setError(pendingSignedOutMessage);
        pendingSignedOutMessage = null;
        setLoading(false);
        return;
      }

      const identityChanged =
        currentUserId.current !== null &&
        currentUserId.current !== next.user.id;
      if (identityChanged) {
        queryClient.clear();
        hasApplicationSession.current = false;
        setProfile(null);
      }
      currentUserId.current = next.user.id;
      setSession(next);
      setError(null);
      try {
        const applicationSession = await apiRequest<ApplicationSession>(
          "/auth/session",
          next.access_token,
        );
        if (!active || generation !== requestGeneration.current) return;
        hasApplicationSession.current = true;
        setProfile(applicationSession);
      } catch (requestError) {
        if (!active || generation !== requestGeneration.current) return;
        if (
          requestError instanceof ApiConnectionError ||
          (requestError instanceof ApiRequestError &&
            requestError.status >= 500)
        ) {
          setError(requestErrorMessage(requestError));
        } else {
          pendingSignedOutMessage =
            "La cuenta no tiene acceso vigente al portal.";
          lastAccessToken = undefined;
          currentUserId.current = null;
          hasApplicationSession.current = false;
          queryClient.clear();
          setSession(null);
          setProfile(null);
          setError(pendingSignedOutMessage);
          void supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        }
      } finally {
        if (active && generation === requestGeneration.current)
          setLoading(false);
      }
    };

    const schedule = (next: Session | null) => {
      const token = next?.access_token ?? null;
      if (token === lastAccessToken) return;
      lastAccessToken = token;
      if (!hasApplicationSession.current) setLoading(true);
      void apply(next);
    };

    const expireSession = () => {
      pendingSignedOutMessage = "La sesión venció. Inicie sesión nuevamente.";
      lastAccessToken = undefined;
      ++requestGeneration.current;
      currentUserId.current = null;
      hasApplicationSession.current = false;
      queryClient.clear();
      setSession(null);
      setProfile(null);
      setError("La sesión venció. Inicie sesión nuevamente.");
      setLoading(false);
      void supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    };

    window.addEventListener(unauthorizedEventName, expireSession);
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        schedule(next);
      }
    });
    return () => {
      active = false;
      window.removeEventListener(unauthorizedEventName, expireSession);
      data.subscription.unsubscribe();
    };
  }, [queryClient, supabase]);

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
      setLoading(true);
      queryClient.clear();
      const signOutError = await supabase.auth
        .signOut({ scope: "local" })
        .then((result) => result.error)
        .catch(() => new Error("SIGN_OUT_UNAVAILABLE"));
      if (signOutError) {
        setError("No se pudo cerrar la sesión. Intente nuevamente.");
        setLoading(false);
        return;
      }
      currentUserId.current = null;
      hasApplicationSession.current = false;
      setSession(null);
      setProfile(null);
      setError(null);
      setLoading(false);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
