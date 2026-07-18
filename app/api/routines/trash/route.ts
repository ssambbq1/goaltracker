import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { readDeletedRoutines } from "@/lib/routineStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const routines = await readDeletedRoutines();
    return Response.json({ routines });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    return Response.json({ error: getErrorMessage(error, "Failed to load deleted routines") }, { status: 500 });
  }
}
