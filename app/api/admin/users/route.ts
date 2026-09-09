import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { listAdminUsers, updateUserAiAccess } from "@/lib/adminStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await listAdminUsers());
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to load admin users");
    return Response.json({ error: message }, { status: message.includes("Admin access") ? 403 : 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const loginId = typeof body?.loginId === "string" ? body.loginId : "";
    const aiEnabled = body?.aiEnabled === true;
    return Response.json(await updateUserAiAccess(loginId, aiEnabled));
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to update AI access");
    return Response.json({ error: message }, { status: message.includes("Admin access") ? 403 : 500 });
  }
}

