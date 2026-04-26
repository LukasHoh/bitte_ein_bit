/**
 * Cookie-backed auth context.
 *
 * On mount we ask the server `who am I?` (`me`). When the user signs in/up
 * the server sets the `unmapped_session` httpOnly cookie and returns the
 * resolved user; we mirror that into React state. Sign out clears the cookie
 * server-side then resets state.
 *
 * Compared to the previous Supabase implementation, there's no separate JWT
 * exposed to the browser — server functions read the cookie automatically, so
 * components no longer need to forward `session.access_token` headers.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  me,
  signIn as signInFn,
  signOut as signOutFn,
  signUp as signUpFn,
} from "@/server/auth.functions";

export type AppRole = "seeker" | "ngo" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  roles: AppRole[];
}

interface AuthContextValue {
  user: AuthUser | null;
  roles: AppRole[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role?: "seeker" | "ngo",
  ) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  hasRole: (r: AppRole) => boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const result = await me();
    setUser(result);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error?: string }> => {
      const res = await signInFn({ data: { email, password } });
      if (!res.ok) return { error: res.error };
      setUser(res.user);
      return {};
    },
    [],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
      role: "seeker" | "ngo" = "seeker",
    ): Promise<{ error?: string }> => {
      const res = await signUpFn({ data: { email, password, fullName, role } });
      if (!res.ok) return { error: res.error };
      setUser(res.user);
      return {};
    },
    [],
  );

  const signOut = useCallback(async () => {
    await signOutFn();
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (role: AppRole) => Boolean(user && user.roles.includes(role)),
    [user],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        roles: user?.roles ?? [],
        loading,
        signIn,
        signUp,
        signOut,
        hasRole,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
