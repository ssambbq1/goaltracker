import { deleteTodo, updateTodo } from "@/lib/todoStore";
import { isUnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext<"/api/todos/[todoId]">) {
  try {
    const { todoId } = await context.params;
    const body = await request.json();
    const todos = await updateTodo(todoId, {
      title: typeof body?.title === "string" ? body.title : undefined,
      completed: typeof body?.completed === "boolean" ? body.completed : undefined,
    });

    return Response.json({ todos });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = error instanceof Error ? error.message : "Failed to update todo";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/todos/[todoId]">) {
  try {
    const { todoId } = await context.params;
    const todos = await deleteTodo(todoId);
    return Response.json({ todos });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = error instanceof Error ? error.message : "Failed to delete todo";
    return Response.json({ error: message }, { status: 500 });
  }
}
