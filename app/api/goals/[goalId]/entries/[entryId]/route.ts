import { isUnauthorizedError } from "@/lib/auth";
import { deleteEntry, updateEntry } from "@/lib/goalStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/goals/[goalId]/entries/[entryId]">,
) {
  try {
    const { goalId, entryId } = await context.params;
    const body = await request.json();
    const goals = await updateEntry(goalId, entryId, {
      value: typeof body?.value === "number" ? body.value : Number(body?.value),
      memo: typeof body?.memo === "string" ? body.memo : undefined,
      createdAt: typeof body?.createdAt === "number" ? body.createdAt : Number(body?.createdAt),
    });

    return Response.json({ goals });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = error instanceof Error ? error.message : "Failed to update record";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/goals/[goalId]/entries/[entryId]">,
) {
  try {
    const { goalId, entryId } = await context.params;
    const goals = await deleteEntry(goalId, entryId);
    return Response.json({ goals });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = error instanceof Error ? error.message : "Failed to delete record";
    return Response.json({ error: message }, { status: 500 });
  }
}
