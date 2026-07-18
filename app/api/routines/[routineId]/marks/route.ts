import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { clearRoutineMark, setRoutineMark, type RoutineMarkStatus } from "@/lib/routineStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRoutineMarkStatus(value: unknown): value is RoutineMarkStatus {
  return value === "success" || value === "failure";
}

export async function POST(request: Request, context: RouteContext<"/api/routines/[routineId]/marks">) {
  try {
    const { routineId } = await context.params;
    const body = await request.json();
    const date = typeof body?.date === "string" ? body.date : "";
    const status = isRoutineMarkStatus(body?.status) ? body.status : null;

    if (!date || !status) {
      return Response.json({ error: "Date and status are required" }, { status: 400 });
    }

    const routines = await setRoutineMark(routineId, date, status);
    return Response.json({ routines });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to update routine mark");
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext<"/api/routines/[routineId]/marks">) {
  try {
    const { routineId } = await context.params;
    const { searchParams } = new URL(request.url);
    const routines = await clearRoutineMark(routineId, searchParams.get("date") ?? "");
    return Response.json({ routines });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to clear routine mark");
    return Response.json({ error: message }, { status: 500 });
  }
}
