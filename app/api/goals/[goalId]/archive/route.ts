import { archiveGoal } from "@/lib/goalStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(_request: Request, context: RouteContext<"/api/goals/[goalId]/archive">) {
  const { goalId } = await context.params;
  const result = await archiveGoal(goalId);
  return Response.json(result);
}
