import {
  clearSessionResponse,
  deleteCurrentAccount,
  getErrorMessage,
  isUnauthorizedError,
  updateCurrentDisplayName,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const displayName = await updateCurrentDisplayName(typeof body?.displayName === "string" ? body.displayName : "");
    return Response.json({ displayName });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return Response.json({ error: "Login is required" }, { status: 401 });
    }

    const message = getErrorMessage(error, "Failed to update account");
    console.error("Account update failed:", error);
    return Response.json({ error: message }, { status: 400 });
  }
}

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
