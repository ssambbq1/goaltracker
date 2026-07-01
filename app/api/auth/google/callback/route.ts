import { NextResponse } from "next/server";
import { applySessionCookie, getErrorMessage, loginWithGoogleUser } from "@/lib/auth";
import { getSupabaseAuthClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const cookie = cookies.find((item) => item.startsWith(`${name}=`));
  if (!cookie) return null;

  return decodeURIComponent(cookie.slice(name.length + 1));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error_description") || url.searchParams.get("error");
  const cookiesToRemove = new Set<string>();

  try {
    if (providerError) throw new Error(providerError);
    if (!code) throw new Error("Google login code is missing.");

    const supabase = getSupabaseAuthClient({
      isServer: true,
      getItem: (key) => readCookie(request, key),
      setItem: () => undefined,
      removeItem: (key) => {
        if (key.endsWith("-code-verifier")) cookiesToRemove.add(key);
      },
    });
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    if (!data.user) throw new Error("Google user was not returned.");

    const loginId = await loginWithGoogleUser(data.user);
    const response = applySessionCookie(NextResponse.redirect(new URL("/", request.url)), loginId);
    for (const name of cookiesToRemove) response.cookies.delete(name);
    return response;
  } catch (error) {
    const message = getErrorMessage(error, "Failed to finish Google login");
    console.error("Google login callback failed:", error);
    const response = NextResponse.redirect(new URL(`/?authError=${encodeURIComponent(message)}`, request.url));
    for (const name of cookiesToRemove) response.cookies.delete(name);
    return response;
  }
}
