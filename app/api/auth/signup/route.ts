import { getErrorMessage, sessionResponse, signupWithId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const loginId = await signupWithId(
      typeof body?.loginId === "string" ? body.loginId : "",
      typeof body?.password === "string" ? body.password : "",
      typeof body?.displayName === "string" ? body.displayName : "",
    );
    const displayName = typeof body?.displayName === "string" ? body.displayName.trim() || null : null;
    return sessionResponse({ loginId, displayName }, loginId, { status: 201 });
  } catch (error) {
    const message = getErrorMessage(error, "Failed to sign up");
    console.error("Signup failed:", error);
    return Response.json({ error: message }, { status: 400 });
  }
}
