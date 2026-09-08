import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { respondToAssignment } from "@/lib/friendStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: RouteContext<"/api/assignments/[assignmentId]">) {
  try {
    const { assignmentId } = await ctx.params;
    const body = await request.json().catch(() => null);
    const status = body?.status === "declined" ? "declined" : "accepted";
    return Response.json({ assignments: await respondToAssignment(assignmentId, status) });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to update assignment");
    return Response.json({ error: message }, { status: 400 });
  }
}
