import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

const SESSION_COOKIE = "boostmaster_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export class UnauthorizedError extends Error {
  constructor() {
    super("Login is required");
    this.name = "UnauthorizedError";
  }
}

function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "boostmaster-dev-secret";
}

function normalizeLoginId(loginId: string) {
  return loginId.trim().toLowerCase();
}

function validateManualLoginId(loginId: string) {
  if (!/^[a-z0-9._-]{3,40}$/.test(loginId)) {
    throw new Error("Login ID must be 3-40 characters using letters, numbers, dot, dash, or underscore.");
  }
}

function validatePassword(password: string) {
  if (password.length < 8 || password.length > 128) {
    throw new Error("Password must be 8-128 characters.");
  }
}

function hashPassword(password: string) {
  validatePassword(password);
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, hash] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !hash) return false;

  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sign(value: string) {
  return createHmac("sha256", getAuthSecret()).update(value).digest("base64url");
}

function createSessionValue(loginId: string) {
  const payload = Buffer.from(
    JSON.stringify({
      loginId,
      expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readSessionValue(value?: string) {
  if (!value) return null;

  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      loginId?: unknown;
      expiresAt?: unknown;
    };
    if (typeof parsed.loginId !== "string") return null;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) return null;
    return parsed.loginId;
  } catch {
    return null;
  }
}

export async function getSessionLoginId() {
  const cookieStore = await cookies();
  return readSessionValue(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireLoginId() {
  const loginId = await getSessionLoginId();
  if (!loginId) throw new UnauthorizedError();
  return loginId;
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof UnauthorizedError;
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const messageParts = [record.message, record.details, record.hint, record.code]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (messageParts.length) return messageParts.join(" ");
  }

  return fallback;
}

async function isFirstUser() {
  const supabase = getSupabaseServerClient();
  const { count, error } = await supabase.from("app_users").select("login_id", { count: "exact", head: true });
  if (error) throw error;
  return (count ?? 0) === 0;
}

async function claimUnassignedGoals(loginId: string) {
  const { error } = await getSupabaseServerClient().from("goals").update({ user_id: loginId }).is("user_id", null);
  if (error) throw error;
}

export async function loginWithId(rawLoginId: string, rawPassword: string) {
  const loginId = normalizeLoginId(rawLoginId);
  const password = rawPassword;
  validateManualLoginId(loginId);
  validatePassword(password);

  const supabase = getSupabaseServerClient();
  const now = Date.now();
  const { data: user, error: userError } = await supabase
    .from("app_users")
    .select("login_id, password_hash")
    .eq("login_id", loginId)
    .maybeSingle();
  if (userError) throw userError;
  if (!user) throw new Error("ID not found. Use sign up first.");

  if (user.password_hash) {
    if (!verifyPassword(password, user.password_hash)) throw new Error("Incorrect password.");
  } else {
    const { error } = await supabase
      .from("app_users")
      .update({ password_hash: hashPassword(password) })
      .eq("login_id", loginId);
    if (error) throw error;
  }

  const { error: updateError } = await supabase
    .from("app_users")
    .update({ last_login_at_ms: now })
    .eq("login_id", loginId);
  if (updateError) throw updateError;

  return loginId;
}

export async function signupWithId(rawLoginId: string, rawPassword: string) {
  const loginId = normalizeLoginId(rawLoginId);
  const password = rawPassword;
  validateManualLoginId(loginId);
  validatePassword(password);

  const supabase = getSupabaseServerClient();
  const shouldClaimUnassignedGoals = await isFirstUser();
  const now = Date.now();
  const { error } = await supabase.from("app_users").insert({
    login_id: loginId,
    password_hash: hashPassword(password),
    created_at_ms: now,
    last_login_at_ms: now,
  });

  if (error) {
    if (error.code === "23505") throw new Error("This login ID is already taken.");
    throw error;
  }

  if (shouldClaimUnassignedGoals) await claimUnassignedGoals(loginId);

  return loginId;
}

export async function loginWithGoogleUser(user: User) {
  const googleUserId = user.id;
  const loginId = `google_${googleUserId.replaceAll("-", "")}`;
  const googleEmail = user.email?.toLowerCase() ?? null;
  const displayName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : googleEmail;

  const supabase = getSupabaseServerClient();
  const shouldClaimUnassignedGoals = await isFirstUser();
  const now = Date.now();

  const { data: existingUser, error: existingError } = await supabase
    .from("app_users")
    .select("login_id")
    .eq("google_user_id", googleUserId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existingUser) {
    const { error } = await supabase
      .from("app_users")
      .update({
        google_email: googleEmail,
        display_name: displayName,
        last_login_at_ms: now,
      })
      .eq("login_id", existingUser.login_id);
    if (error) throw error;
    return existingUser.login_id;
  }

  const { error } = await supabase.from("app_users").insert({
    login_id: loginId,
    google_user_id: googleUserId,
    google_email: googleEmail,
    display_name: displayName,
    created_at_ms: now,
    last_login_at_ms: now,
  });
  if (error) throw error;

  if (shouldClaimUnassignedGoals) await claimUnassignedGoals(loginId);

  return loginId;
}

export async function deleteCurrentAccount(rawPassword?: string) {
  const loginId = await requireLoginId();
  const supabase = getSupabaseServerClient();
  const { data: user, error: userError } = await supabase
    .from("app_users")
    .select("login_id, password_hash")
    .eq("login_id", loginId)
    .maybeSingle();

  if (userError) throw userError;
  if (!user) throw new Error("Account not found.");

  if (user.password_hash) {
    if (!rawPassword) throw new Error("Password is required to delete this account.");
    if (!verifyPassword(rawPassword, user.password_hash)) throw new Error("Incorrect password.");
  }

  const { error: goalsError } = await supabase.from("goals").delete().eq("user_id", loginId);
  if (goalsError) throw goalsError;

  const { error: accountError } = await supabase.from("app_users").delete().eq("login_id", loginId);
  if (accountError) throw accountError;
}

export function applySessionCookie(response: NextResponse, loginId: string) {
  response.cookies.set(SESSION_COOKIE, createSessionValue(loginId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
  return response;
}

export function sessionResponse(body: unknown, loginId: string, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  return applySessionCookie(response, loginId);
}

export function clearSessionResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
  return response;
}
