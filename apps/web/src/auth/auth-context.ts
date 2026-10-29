import type { Session } from "@supabase/supabase-js";
import { createContext, useContext } from "react";

export type RoleCode = "JEFE_EMPRESA" | "ADMINISTRADOR" | "JEFE_PLANTA";
export interface ApplicationSession {
  profileId: string;
  organizationId: string;
  displayName?: string;
  role: RoleCode;
  permissions: string[];
  expiresAt: string;
}
export interface FoundSession {
  email: string;
}
export interface AuthState {
  session: Session | null;
  profile: ApplicationSession | null;
  foundSession: FoundSession | null;
  loading: boolean;
  error: string | null;
  continueFoundSession(): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  recover(email: string): Promise<void>;
  signOut(): Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (value === null) throw new Error("AuthProvider is required");
  return value;
}
