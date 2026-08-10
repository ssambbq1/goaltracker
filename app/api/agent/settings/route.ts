import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { readAgentSettings, saveAgentSettings } from "@/lib/agentSettingsStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ settings: await readAgentSettings() });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to load agent settings");
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const settings = await saveAgentSettings({
      llmModel: typeof body?.llmModel === "string" ? body.llmModel : "",
      apiKey: typeof body?.apiKey === "string" ? body.apiKey : undefined,
      clearApiKey: body?.clearApiKey === true,
      activeKeyId: typeof body?.activeKeyId === "string" ? body.activeKeyId : undefined,
      deleteKeyId: typeof body?.deleteKeyId === "string" ? body.deleteKeyId : undefined,
    });
    return Response.json({ settings });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to save agent settings");
    return Response.json({ error: message }, { status: 500 });
  }
}
