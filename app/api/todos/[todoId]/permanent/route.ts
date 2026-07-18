import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { permanentlyDeleteTodo } from "@/lib/todoStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ todoId: string }> }) {
  try {
    const { todoId } = await context.params;
    return Response.json(await permanentlyDeleteTodo(todoId));
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    return Response.json({ error: getErrorMessage(error, "Failed to permanently delete todo") }, { status: 500 });
  }
}
