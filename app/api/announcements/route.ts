import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { createAnnouncement, readCurrentAnnouncements } from "@/lib/announcementStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await readCurrentAnnouncements());
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to load announcements");
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = typeof body?.message === "string" ? body.message : "";
    const targetUserIds = body?.targetUserIds === null || Array.isArray(body?.targetUserIds)
      ? body.targetUserIds
      : undefined;
    return Response.json(await createAnnouncement({ message, targetUserIds }));
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to send announcement");
    return Response.json({ error: message }, { status: message.includes("Admin access") ? 403 : 500 });
  }
}

