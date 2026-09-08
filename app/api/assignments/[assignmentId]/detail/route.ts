import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { readAssignmentDetail } from "@/lib/friendStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ assignmentId: string }> }) {
  try {
    const { assignmentId } = await ctx.params;
    return Response.json({ assignment: await readAssignmentDetail(assignmentId) });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to load assignment detail");
    return Response.json({ error: message }, { status: 400 });
  }
}
