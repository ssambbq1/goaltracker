import { isUnauthorizedError } from "@/lib/auth";
import { restoreGoal } from "@/lib/goalStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(_request: Request, context: RouteContext<"/api/goals/[goalId]/restore">) {
  try {
    const { goalId } = await context.params;
    const result = await restoreGoal(goalId);
    return Response.json(result);
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = error instanceof Error ? error.message : "Failed to restore goal";
    return Response.json({ error: message }, { status: 500 });
  }
}
