import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { runListAgent } from "@/lib/listAgent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prompt = typeof body?.prompt === "string" ? body.prompt : "";
    const apply = body?.apply === true;
    return Response.json(await runListAgent(prompt, apply, body?.selectedList));
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to run agent");
    return Response.json({ error: message }, { status: 500 });
  }
}
