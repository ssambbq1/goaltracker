import { isUnauthorizedError } from "@/lib/auth";
import { deleteGoal, updateGoal } from "@/lib/goalStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext<"/api/goals/[goalId]">) {
  try {
    const { goalId } = await context.params;
    const body = await request.json();
    const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : undefined;
    const goals = await updateGoal(goalId, {
      title,
      memo: typeof body?.memo === "string" ? body.memo : undefined,
      target: typeof body?.target === "number" ? body.target : undefined,
      unit: typeof body?.unit === "string" && body.unit.trim() ? body.unit.trim() : undefined,
      deadline: typeof body?.deadline === "string" ? body.deadline : undefined,
    });

    return Response.json({ goals });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = error instanceof Error ? error.message : "Failed to update goal";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/goals/[goalId]">) {
  try {
    const { goalId } = await context.params;
    const result = await deleteGoal(goalId);
    return Response.json(result);
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = error instanceof Error ? error.message : "Failed to delete goal";
    return Response.json({ error: message }, { status: 500 });
  }
}
