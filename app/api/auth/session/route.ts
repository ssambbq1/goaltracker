import { getSessionLoginId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const loginId = await getSessionLoginId();
  return Response.json({ loginId });
}
