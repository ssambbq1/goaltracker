import { addTodo, readTodos, reorderTodos } from "@/lib/todoStore";
import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const todos = await readTodos();
    return Response.json({ todos });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to load todos");
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const targetDate = typeof body?.targetDate === "string" ? body.targetDate.trim() : "";

    if (!title) {
      return Response.json({ error: "Todo title is required" }, { status: 400 });
    }

    if (!targetDate) {
      return Response.json({ error: "Todo target date is required" }, { status: 400 });
    }

    const result = await addTodo(title, targetDate);
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to add todo");
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const todoIds = Array.isArray(body?.todoIds)
      ? body.todoIds.filter((todoId: unknown): todoId is string => typeof todoId === "string")
      : [];
    const todos = await reorderTodos(todoIds);
    return Response.json({ todos });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to reorder todos");
    return Response.json({ error: message }, { status: 500 });
  }
}
