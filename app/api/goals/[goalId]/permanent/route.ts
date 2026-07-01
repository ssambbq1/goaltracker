import { isUnauthorizedError } from "@/lib/auth";
import { permanentlyDeleteGoal } from "@/lib/goalStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: RouteContext<"/api/goals/[goalId]/permanent">) {
  try {
    const { goalId } = await context.params;
    const result = await permanentlyDeleteGoal(goalId);
    return Response.json(result);
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = error instanceof Error ? error.message : "Failed to permanently delete goal";
    return Response.json({ error: message }, { status: 500 });
  }
}
