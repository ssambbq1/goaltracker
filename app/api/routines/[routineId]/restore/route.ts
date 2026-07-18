import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { restoreRoutine } from "@/lib/routineStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(_request: Request, context: { params: Promise<{ routineId: string }> }) {
  try {
    const { routineId } = await context.params;
    return Response.json(await restoreRoutine(routineId));
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    return Response.json({ error: getErrorMessage(error, "Failed to restore routine") }, { status: 500 });
  }
}
