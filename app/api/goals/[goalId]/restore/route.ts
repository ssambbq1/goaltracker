import { restoreGoal } from "@/lib/goalStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(_request: Request, context: RouteContext<"/api/goals/[goalId]/restore">) {
  const { goalId } = await context.params;
  const result = await restoreGoal(goalId);
  return Response.json(result);
}
