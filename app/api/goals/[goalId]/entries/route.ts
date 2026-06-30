import { addEntry } from "@/lib/goalStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: RouteContext<"/api/goals/[goalId]/entries">) {
  const { goalId } = await context.params;
  const body = await request.json();
  const result = await addEntry(goalId, {
    value: typeof body?.value === "number" ? body.value : Number(body?.value),
    memo: typeof body?.memo === "string" ? body.memo : "",
    createdAt: typeof body?.createdAt === "number" ? body.createdAt : Number(body?.createdAt),
  });

  return Response.json(result, { status: 201 });
}
