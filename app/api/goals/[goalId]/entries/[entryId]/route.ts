import { deleteEntry, updateEntry } from "@/lib/goalStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/goals/[goalId]/entries/[entryId]">,
) {
  const { goalId, entryId } = await context.params;
  const body = await request.json();
  const goals = await updateEntry(goalId, entryId, {
    value: typeof body?.value === "number" ? body.value : Number(body?.value),
    memo: typeof body?.memo === "string" ? body.memo : undefined,
    createdAt: typeof body?.createdAt === "number" ? body.createdAt : Number(body?.createdAt),
  });

  return Response.json({ goals });
}

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/goals/[goalId]/entries/[entryId]">,
) {
  const { goalId, entryId } = await context.params;
  const goals = await deleteEntry(goalId, entryId);
  return Response.json({ goals });
}
