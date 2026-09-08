import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { createAssignment, readAssignments, type AssignmentKind } from "@/lib/friendStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getKind(value: unknown): AssignmentKind | null {
  return value === "goal" || value === "todo" || value === "routine" ? value : null;
}

export async function GET() {
  try {
    return Response.json({ assignments: await readAssignments() });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to load assignments");
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const kind = getKind(body?.kind);
    if (!kind) return Response.json({ error: "Assignment kind is required" }, { status: 400 });

    const base = {
      kind,
      assigneeId: typeof body?.assigneeId === "string" ? body.assigneeId : "",
      title: typeof body?.title === "string" ? body.title : "",
      memo: typeof body?.memo === "string" ? body.memo : "",
    };

    const input =
      kind === "goal"
        ? {
            ...base,
            kind,
            target: typeof body?.target === "number" ? body.target : Number(body?.target),
            unit: typeof body?.unit === "string" ? body.unit : "units",
            deadline: typeof body?.deadline === "string" ? body.deadline : "",
          }
        : kind === "todo"
          ? {
              ...base,
              kind,
              targetDate: typeof body?.targetDate === "string" ? body.targetDate : "",
              category: typeof body?.category === "string" ? body.category : "",
            }
          : {
              ...base,
              kind,
              startDate: typeof body?.startDate === "string" ? body.startDate : "",
              endDate: typeof body?.endDate === "string" ? body.endDate : "",
            };

    return Response.json({ assignments: await createAssignment(input) }, { status: 201 });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to assign item");
    return Response.json({ error: message }, { status: 400 });
  }
}
