import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { archiveTodo } from "@/lib/todoStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(_request: Request, context: RouteContext<"/api/todos/[todoId]/archive">) {
  try {
    const { todoId } = await context.params;
    return Response.json(await archiveTodo(todoId));
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    return Response.json({ error: getErrorMessage(error, "Failed to archive task") }, { status: 500 });
  }
}
