import { getAccountProfile, getSessionLoginId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const loginId = await getSessionLoginId();
  if (!loginId) return Response.json({ loginId: null, displayName: null });
  const profile = await getAccountProfile(loginId);
  return Response.json(profile);
}
