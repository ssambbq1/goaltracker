import { isUnauthorizedError } from "@/lib/auth";
import { archiveGoal } from "@/lib/goalStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(_request: Request, context: RouteContext<"/api/goals/[goalId]/archive">) {
  try {
    const { goalId } = await context.params;
    const result = await archiveGoal(goalId);
    return Response.json(result);
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = error instanceof Error ? error.message : "Failed to archive goal";
    return Response.json({ error: message }, { status: 500 });
  }
}
