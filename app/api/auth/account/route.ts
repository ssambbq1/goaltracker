import { clearSessionResponse, deleteCurrentAccount, getErrorMessage, isUnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    await deleteCurrentAccount(typeof body?.password === "string" ? body.password : undefined);
    return clearSessionResponse({ ok: true });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return Response.json({ error: "Login is required" }, { status: 401 });
    }

    const message = getErrorMessage(error, "Failed to delete account");
    console.error("Account deletion failed:", error);
    return Response.json({ error: message }, { status: 400 });
  }
}
