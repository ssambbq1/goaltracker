import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { archiveTodo } from "@/lib/todoStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(_request: Request, context: { params: Promise<{ todoId: string }> }) {
  try {
    const { todoId } = await context.params;
    const todos = await archiveTodo(todoId);
    return Response.json({ todos });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    return Response.json({ error: getErrorMessage(error, "Failed to archive todo") }, { status: 500 });
  }
}
