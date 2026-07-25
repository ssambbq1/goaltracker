import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { readDeletedTodos } from "@/lib/todoStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const todos = await readDeletedTodos();
    return Response.json({ todos });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    return Response.json({ error: getErrorMessage(error, "Failed to load deleted todos") }, { status: 500 });
  }
}
