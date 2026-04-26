/**
 * TanStack Start server functions for cookie-based auth.
 *
 * Each function reads/writes the DuckDB `users`, `sessions`, `user_roles` and
 * `profiles` tables and (de)sets the session cookie via `clearSession` /
 * `createSession` from `session.server`.
 *
 * The browser-side `AuthProvider` consumes `me`, `signIn`, `signUp`, `signOut`
 * to keep its state in sync with the server.
 */
import { createServerFn } from "@tanstack/react-start";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { execute, queryOne } from "@/integrations/db/client.server";
import {
  type AppRole,
  type SessionUser,
  clearSession,
  createSession,
  getOptionalSession,
} from "@/integrations/db/session.server";

const SignInInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6).max(200),
});

const SignUpInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6).max(200),
  fullName: z.string().trim().min(1).max(120),
  role: z.enum(["seeker", "ngo"]).default("seeker"),
});

const BCRYPT_COST = 10;

export const me = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser | null> => getOptionalSession(),
);

export const signIn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SignInInput.parse(input))
  .handler(
    async ({ data }): Promise<{ ok: true; user: SessionUser } | { ok: false; error: string }> => {
      const row = await queryOne<{ id: string; password_hash: string }>(
        "SELECT id, password_hash FROM users WHERE email = $email",
        { email: data.email },
      );
      if (!row) return { ok: false, error: "Invalid email or password." };

      const matches = await bcrypt.compare(data.password, row.password_hash);
      if (!matches) return { ok: false, error: "Invalid email or password." };

      await createSession(row.id);
      const user = await getOptionalSession();
      if (!user) return { ok: false, error: "Failed to start session." };
      return { ok: true, user };
    },
  );

export const signUp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SignUpInput.parse(input))
  .handler(
    async ({ data }): Promise<{ ok: true; user: SessionUser } | { ok: false; error: string }> => {
      const existing = await queryOne<{ id: string }>("SELECT id FROM users WHERE email = $email", {
        email: data.email,
      });
      if (existing) return { ok: false, error: "An account already exists for this email." };

      const userId = crypto.randomUUID();
      const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST);

      await execute(
        "INSERT INTO users (id, email, password_hash) VALUES ($id, $email, $password_hash)",
        { id: userId, email: data.email, password_hash: passwordHash },
      );

      const role: AppRole = data.role;
      await execute("INSERT INTO user_roles (id, user_id, role) VALUES ($id, $user_id, $role)", {
        id: crypto.randomUUID(),
        user_id: userId,
        role,
      });

      await execute(
        `INSERT INTO profiles (id, full_name, language)
       VALUES ($id, $full_name, $language)`,
        { id: userId, full_name: data.fullName, language: "en" },
      );

      await createSession(userId);
      const user = await getOptionalSession();
      if (!user) return { ok: false, error: "Failed to start session." };
      return { ok: true, user };
    },
  );

export const signOut = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true }> => {
    await clearSession();
    return { ok: true };
  },
);
