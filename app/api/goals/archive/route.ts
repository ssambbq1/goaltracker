import { isUnauthorizedError } from "@/lib/auth";
import { readArchivedGoals } from "@/lib/goalStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const goals = await readArchivedGoals();
    return Response.json({ goals });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = error instanceof Error ? error.message : "Failed to load archive";
    return Response.json({ error: message }, { status: 500 });
  }
}
