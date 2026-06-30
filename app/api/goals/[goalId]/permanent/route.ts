import { permanentlyDeleteGoal } from "@/lib/goalStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: RouteContext<"/api/goals/[goalId]/permanent">) {
  const { goalId } = await context.params;
  const result = await permanentlyDeleteGoal(goalId);
  return Response.json(result);
}
