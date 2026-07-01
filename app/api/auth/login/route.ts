import { getErrorMessage, loginWithId, sessionResponse } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const loginId = await loginWithId(
      typeof body?.loginId === "string" ? body.loginId : "",
      typeof body?.password === "string" ? body.password : "",
    );
    return sessionResponse({ loginId }, loginId);
  } catch (error) {
    const message = getErrorMessage(error, "Failed to login");
    console.error("Login failed:", error);
    return Response.json({ error: message }, { status: 400 });
  }
}
