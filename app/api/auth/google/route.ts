import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/auth";
import { getSupabaseAuthClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OAUTH_COOKIE_MAX_AGE = 60 * 10;

export async function GET(request: Request) {
  const pendingCookies = new Map<string, string>();

  try {
    const origin = new URL(request.url).origin;
    const supabase = getSupabaseAuthClient({
      isServer: true,
      getItem: () => null,
      setItem: (key, value) => {
        if (key.endsWith("-code-verifier")) pendingCookies.set(key, value);
      },
      removeItem: (key) => {
        pendingCookies.delete(key);
      },
    });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/api/auth/google/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) throw error;
    if (!data.url) throw new Error("Google login URL was not returned.");

    const response = NextResponse.redirect(data.url);
    for (const [name, value] of pendingCookies) {
      response.cookies.set(name, value, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: OAUTH_COOKIE_MAX_AGE,
        path: "/",
      });
    }

    return response;
  } catch (error) {
    const message = getErrorMessage(error, "Failed to start Google login");
    console.error("Google login start failed:", error);
    return NextResponse.redirect(new URL(`/?authError=${encodeURIComponent(message)}`, request.url));
  }
}
