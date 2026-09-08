import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { respondToFriendship } from "@/lib/friendStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: RouteContext<"/api/friends/[friendshipId]">) {
  try {
    const { friendshipId } = await ctx.params;
    const body = await request.json().catch(() => null);
    const status = body?.status === "declined" ? "declined" : "accepted";
    return Response.json({ friendships: await respondToFriendship(friendshipId, status) });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to update friend request");
    return Response.json({ error: message }, { status: 400 });
  }
}
