import { deleteGoal, updateGoal } from "@/lib/goalStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext<"/api/goals/[goalId]">) {
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
}

export async function DELETE(_request: Request, context: RouteContext<"/api/goals/[goalId]">) {
  const { goalId } = await context.params;
  const result = await deleteGoal(goalId);
  return Response.json(result);
}
