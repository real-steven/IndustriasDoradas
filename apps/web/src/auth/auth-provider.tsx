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
  type FoundSession,
} from "./auth-context";

interface AuthProviderProps extends PropsWithChildren {
  client?: SupabaseClient;
}

export function AuthProvider({ children, client }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const [supabase] = useState(() => client ?? getSupabaseClient());
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ApplicationSession | null>(null);
  const [foundSession, setFoundSession] = useState<FoundSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const currentUserId = useRef<string | null>(null);
  const hasApplicationSession = useRef(false);
  const foundSessionRef = useRef<Session | null>(null);
  const deliberateSignIn = useRef(false);
  const confirmingFoundSession = useRef(false);
  const lastAccessToken = useRef<string | null | undefined>(undefined);
  const applySession = useRef<((next: Session | null) => Promise<void>) | null>(
    null,
  );

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
    let pendingSignedOutMessage: string | null = null;

    const clearFoundSession = () => {
      foundSessionRef.current = null;
      setFoundSession(null);
    };

    const holdFoundSession = (next: Session) => {
      foundSessionRef.current = next;
      queryClient.clear();
      currentUserId.current = null;
      hasApplicationSession.current = false;
      setSession(null);
      setProfile(null);
      setFoundSession({
        email: next.user.email?.trim() || "Cuenta gerencial guardada",
      });
      setError(null);
      setLoading(false);
    };

    const apply = async (next: Session | null) => {
      const generation = ++requestGeneration.current;
      if (!active) return;

      if (next === null) {
        clearFoundSession();
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
          lastAccessToken.current = undefined;
          clearFoundSession();
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
    applySession.current = apply;

    const schedule = (next: Session | null) => {
      const token = next?.access_token ?? null;
      if (token === lastAccessToken.current) return;
      lastAccessToken.current = token;
      if (!hasApplicationSession.current) setLoading(true);
      void apply(next);
    };

    const expireSession = () => {
      pendingSignedOutMessage = "La sesión venció. Inicie sesión nuevamente.";
      lastAccessToken.current = undefined;
      clearFoundSession();
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
      if (event === "INITIAL_SESSION") {
        if (next === null) schedule(null);
        else holdFoundSession(next);
        return;
      }
      if (event === "SIGNED_OUT") {
        deliberateSignIn.current = false;
        schedule(null);
        return;
      }
      if (
        next !== null &&
        foundSessionRef.current !== null &&
        !deliberateSignIn.current &&
        !confirmingFoundSession.current &&
        (event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "USER_UPDATED")
      ) {
        holdFoundSession(next);
        return;
      }
      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        deliberateSignIn.current = false;
        clearFoundSession();
        schedule(next);
      }
    });
    return () => {
      active = false;
      applySession.current = null;
      window.removeEventListener(unauthorizedEventName, expireSession);
      data.subscription.unsubscribe();
    };
  }, [queryClient, supabase]);

  const value: AuthState = {
    session,
    profile,
    foundSession,
    loading,
    error,
    async continueFoundSession() {
      const next = foundSessionRef.current;
      const apply = applySession.current;
      if (next === null || apply === null) return;
      setError(null);
      setLoading(true);
      lastAccessToken.current = next.access_token;
      confirmingFoundSession.current = true;
      try {
        await apply(next);
      } finally {
        confirmingFoundSession.current = false;
      }
      if (hasApplicationSession.current) {
        foundSessionRef.current = null;
        setFoundSession(null);
      } else if (foundSessionRef.current !== null) {
        setSession(null);
      }
    },
    async signIn(email, password) {
      setError(null);
      deliberateSignIn.current = true;
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        deliberateSignIn.current = false;
        throw new Error("Correo o contraseña inválidos.");
      }
    },
    async recover(email) {
      const { error: recoveryError } =
        await supabase.auth.resetPasswordForEmail(email);
      if (recoveryError)
        throw new Error("No se pudo solicitar la recuperación.");
    },
    async signOut() {
      const previousFoundSession = foundSessionRef.current;
      foundSessionRef.current = null;
      setFoundSession(null);
      setLoading(true);
      queryClient.clear();
      const signOutError = await supabase.auth
        .signOut({ scope: "local" })
        .then((result) => result.error)
        .catch(() => new Error("SIGN_OUT_UNAVAILABLE"));
      if (signOutError) {
        if (previousFoundSession !== null) {
          foundSessionRef.current = previousFoundSession;
          setFoundSession({
            email:
              previousFoundSession.user.email?.trim() ||
              "Cuenta gerencial guardada",
          });
        }
        setError("No se pudo cerrar la sesión. Intente nuevamente.");
        setLoading(false);
        return;
      }
      currentUserId.current = null;
      hasApplicationSession.current = false;
      deliberateSignIn.current = false;
      confirmingFoundSession.current = false;
      lastAccessToken.current = null;
      setSession(null);
      setProfile(null);
      setError(null);
      setLoading(false);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
