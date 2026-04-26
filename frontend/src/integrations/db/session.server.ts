/**
 * Server-side session helpers + middleware for the cookie-based auth.
 *
 * Sessions are random 32-byte tokens stored in DuckDB, mirrored into an
 * `unmapped_session` httpOnly cookie. They expire 30 days after issue.
 *
 * `requireAuth` is the TanStack Start middleware that resolves the session
 * cookie into a `userId` for downstream server functions. `getOptionalSession`
 * is the same lookup but returns null instead of throwing — used by the
 * `/api/me` endpoint that powers the React `AuthProvider`.
 */
import { createMiddleware } from "@tanstack/react-start";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import { execute, query, queryOne } from "./client.server";

export const SESSION_COOKIE = "unmapped_session";
const SESSION_TTL_DAYS = 30;
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

export type AppRole = "seeker" | "ngo" | "admin";

export interface SessionUser {
  id: string;
  email: string;
  roles: AppRole[];
}

function newToken(): string {
  return randomBytes(32).toString("hex");
}

function expiresAt(): Date {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
}

/**
 * Issue a fresh session for the given user and write the cookie.
 * Returns the new session token (rarely needed by callers).
 */
export async function createSession(userId: string): Promise<string> {
  const token = newToken();
  await execute(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES ($token, $user_id, $expires_at)`,
    { token, user_id: userId, expires_at: expiresAt().toISOString() },
  );
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return token;
}

/**
 * Delete the current session cookie + the matching DB row (if any).
 */
export async function clearSession(): Promise<void> {
  const token = getCookie(SESSION_COOKIE);
  if (token) {
    await execute("DELETE FROM sessions WHERE token = $token", { token });
  }
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

/**
 * Look up the current session (cookie + matching DB row) and the associated
 * user + roles. Returns null when there's no cookie, no matching row, or the
 * row has expired (in which case it's also deleted).
 */
export async function getOptionalSession(): Promise<SessionUser | null> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;

  const row = await queryOne<{
    user_id: string;
    expires_at: string | Date;
    email: string;
  }>(
    `SELECT s.user_id, s.expires_at, u.email
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = $token`,
    { token },
  );
  if (!row) return null;

  const expiry = row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at);
  if (expiry.getTime() < Date.now()) {
    await execute("DELETE FROM sessions WHERE token = $token", { token });
    deleteCookie(SESSION_COOKIE, { path: "/" });
    return null;
  }

  const roleRows = await query<{ role: AppRole }>(
    "SELECT role FROM user_roles WHERE user_id = $user_id",
    { user_id: row.user_id },
  );

  return {
    id: row.user_id,
    email: row.email,
    roles: roleRows.map((r) => r.role),
  };
}

/**
 * Same as `getOptionalSession` but throws a 401 Response when there is no
 * valid session. Use this inside server functions that require authentication.
 */
export async function requireSession(): Promise<SessionUser> {
  const session = await getOptionalSession();
  if (!session) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return session;
}

/**
 * Server-function middleware: gates the function on a valid session and
 * makes `userId` / `email` / `roles` available on `context`.
 */
export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const session = await requireSession();
  return next({
    context: {
      userId: session.id,
      email: session.email,
      roles: session.roles,
    },
  });
});
