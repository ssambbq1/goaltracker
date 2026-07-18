import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { restoreTodo } from "@/lib/todoStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(_request: Request, context: { params: Promise<{ todoId: string }> }) {
  try {
    const { todoId } = await context.params;
    return Response.json(await restoreTodo(todoId));
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    return Response.json({ error: getErrorMessage(error, "Failed to restore todo") }, { status: 500 });
  }
}
