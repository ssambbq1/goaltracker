import { readArchivedGoals } from "@/lib/goalStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const goals = await readArchivedGoals();
  return Response.json({ goals });
}
