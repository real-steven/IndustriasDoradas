import type { Session } from "@supabase/supabase-js";
import { createContext, useContext } from "react";

export type RoleCode = "JEFE_EMPRESA" | "ADMINISTRADOR" | "JEFE_PLANTA";
export interface ApplicationSession {
  profileId: string;
  organizationId: string;
  role: RoleCode;
  permissions: string[];
  expiresAt: string;
}
export interface AuthState {
  session: Session | null;
  profile: ApplicationSession | null;
  loading: boolean;
  error: string | null;
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
