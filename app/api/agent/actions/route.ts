import { requireAgentAccess } from "@/lib/agentSettingsStore";
import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { applyAgentActions } from "@/lib/listAgent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireAgentAccess();
    const body = await request.json();
    return Response.json(await applyAgentActions(body?.actions));
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to apply agent actions");
    return Response.json({ error: message }, { status: message.includes("AI access") || message.includes("Admin access") ? 403 : 500 });
  }
}
