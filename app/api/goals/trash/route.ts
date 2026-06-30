import { readDeletedGoals } from "@/lib/goalStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const goals = await readDeletedGoals();
  return Response.json({ goals });
}
