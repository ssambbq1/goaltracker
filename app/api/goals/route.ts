import { addGoal, readGoals, reorderGoals } from "@/lib/goalStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const goals = await readGoals();
    return Response.json({ goals });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load goals";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const body = await request.json();
  const goalIds = Array.isArray(body?.goalIds)
    ? body.goalIds.filter((goalId: unknown): goalId is string => typeof goalId === "string")
    : [];
  const goals = await reorderGoals(goalIds);
  return Response.json({ goals });
}

export async function POST(request: Request) {
  const body = await request.json();
  const title = typeof body?.title === "string" ? body.title.trim() : "";

  if (!title) {
    return Response.json({ error: "Goal title is required" }, { status: 400 });
  }

  const result = await addGoal({
    title,
    memo: typeof body?.memo === "string" ? body.memo : "",
    target: typeof body?.target === "number" ? body.target : Number(body?.target),
    unit: typeof body?.unit === "string" ? body.unit : "units",
    deadline: typeof body?.deadline === "string" ? body.deadline : "",
  });

  return Response.json(result, { status: 201 });
}
