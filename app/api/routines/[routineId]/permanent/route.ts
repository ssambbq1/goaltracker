import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { permanentlyDeleteRoutine } from "@/lib/routineStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ routineId: string }> }) {
  try {
    const { routineId } = await context.params;
    return Response.json(await permanentlyDeleteRoutine(routineId));
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    return Response.json({ error: getErrorMessage(error, "Failed to permanently delete routine") }, { status: 500 });
  }
}
