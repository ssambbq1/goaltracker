import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { addRoutine, isRoutineSchemaMissingError, readRoutines, reorderRoutines } from "@/lib/routineStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function schemaMissingResponse() {
  return Response.json({
    routines: [],
    schemaMissing: true,
    error: "Routine tables are not installed. Run the Supabase schema update.",
  });
}

export async function GET() {
  try {
    const routines = await readRoutines();
    return Response.json({ routines });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    if (isRoutineSchemaMissingError(error)) return schemaMissingResponse();
    const message = getErrorMessage(error, "Failed to load routines");
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = typeof body?.title === "string" ? body.title.trim() : "";

    if (!title) {
      return Response.json({ error: "Routine title is required" }, { status: 400 });
    }

    const result = await addRoutine({
      title,
      memo: typeof body?.memo === "string" ? body.memo : "",
      startDate: typeof body?.startDate === "string" ? body.startDate : "",
      endDate: typeof body?.endDate === "string" ? body.endDate : "",
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to add routine");
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const routineIds = Array.isArray(body?.routineIds)
      ? body.routineIds.filter((routineId: unknown): routineId is string => typeof routineId === "string")
      : [];
    const routines = await reorderRoutines(routineIds);
    return Response.json({ routines });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to reorder routines");
    return Response.json({ error: message }, { status: 500 });
  }
}
