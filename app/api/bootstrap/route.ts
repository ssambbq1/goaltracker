import { getAccountProfile, getSessionLoginId, getErrorMessage } from "@/lib/auth";
import { readGoals } from "@/lib/goalStore";
import { readRoutines } from "@/lib/routineStore";
import { readTodos } from "@/lib/todoStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const loginId = await getSessionLoginId();
    if (!loginId) {
      return Response.json({
        session: { loginId: null, displayName: null },
        goals: [],
        routines: [],
        todos: [],
      });
    }

    const [session, goals, todos, routines] = await Promise.all([
      getAccountProfile(loginId),
      readGoals(),
      readTodos(),
      readRoutines(),
    ]);

    return Response.json(
      { session, goals, todos, routines },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: getErrorMessage(error, "Failed to load app data") },
      { status: 500 },
    );
  }
}
