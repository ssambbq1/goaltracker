import { getErrorMessage, isUnauthorizedError } from "@/lib/auth";
import { readFriendships, requestFriend, searchUsersByNickname } from "@/lib/friendStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("q");
    if (query !== null) {
      return Response.json({ users: await searchUsersByNickname(query) });
    }

    return Response.json({ friendships: await readFriendships() });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to load friends");
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const addresseeId = typeof body?.addresseeId === "string" ? body.addresseeId : "";
    return Response.json({ friendships: await requestFriend(addresseeId) }, { status: 201 });
  } catch (error) {
    if (isUnauthorizedError(error)) return Response.json({ error: "Login is required" }, { status: 401 });
    const message = getErrorMessage(error, "Failed to request friend");
    return Response.json({ error: message }, { status: 400 });
  }
}
