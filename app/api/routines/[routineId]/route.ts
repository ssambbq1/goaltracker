import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { deleteRoutine, updateRoutine } from "@/lib/routineStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext<"/api/routines/[routineId]">) {
  try {
    const { routineId } = await context.params;
    const body = await request.json();
    const routines = await updateRoutine(routineId, {
      title: typeof body?.title === "string" ? body.title : undefined,
      memo: typeof body?.memo === "string" ? body.memo : undefined,
      startDate: typeof body?.startDate === "string" ? body.startDate : undefined,
      endDate: typeof body?.endDate === "string" ? body.endDate : undefined,
    });

    return Response.json({ routines });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to update routine");
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/routines/[routineId]">) {
  try {
    const { routineId } = await context.params;
    const routines = await deleteRoutine(routineId);
    return Response.json({ routines });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to delete routine");
    return Response.json({ error: message }, { status: 500 });
  }
}
