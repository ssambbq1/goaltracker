import { isUnauthorizedError } from "@/lib/auth";
import { addEntry } from "@/lib/goalStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: RouteContext<"/api/goals/[goalId]/entries">) {
  try {
    const { goalId } = await context.params;
    const body = await request.json();
    const result = await addEntry(goalId, {
      value: typeof body?.value === "number" ? body.value : Number(body?.value),
      memo: typeof body?.memo === "string" ? body.memo : "",
      createdAt: typeof body?.createdAt === "number" ? body.createdAt : Number(body?.createdAt),
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = error instanceof Error ? error.message : "Failed to add record";
    return Response.json({ error: message }, { status: 500 });
  }
}
