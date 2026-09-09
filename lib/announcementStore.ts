import { randomBytes } from "crypto";
import { requireLoginId } from "@/lib/auth";
import { requireAdmin } from "@/lib/adminStore";
import { getSupabaseServerClient } from "@/lib/supabase";

export type Announcement = {
  id: string;
  senderId: string;
  message: string;
  targetUserIds: string[] | null;
  createdAt: number;
};

function isMissingAnnouncementsTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const message = String(record.message ?? "");
  return (
    record.code === "42P01" ||
    record.code === "PGRST205" ||
    message.includes("public.announcements") ||
    message.includes("announcements")
  );
}

function normalizeTargetUserIds(value: unknown) {
  if (!Array.isArray(value)) return null;
  const userIds = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(userIds));
}

function mapAnnouncement(row: {
  id: string;
  sender_id: string;
  message: string;
  target_user_ids: unknown;
  created_at_ms: number;
}): Announcement {
  return {
    id: row.id,
    senderId: row.sender_id,
    message: row.message,
    targetUserIds: normalizeTargetUserIds(row.target_user_ids),
    createdAt: row.created_at_ms,
  };
}

export async function readCurrentAnnouncements() {
  const loginId = await requireLoginId();
  const { data, error } = await getSupabaseServerClient()
    .from("announcements")
    .select("id, sender_id, message, target_user_ids, created_at_ms")
    .order("created_at_ms", { ascending: false })
    .limit(50);

  if (error) {
    if (isMissingAnnouncementsTableError(error)) return { announcements: [], schemaMissing: true };
    throw error;
  }

  return {
    announcements: (data ?? [])
      .map(mapAnnouncement)
      .filter((announcement) => !announcement.targetUserIds || announcement.targetUserIds.includes(loginId)),
    schemaMissing: false,
  };
}

export async function createAnnouncement(input: { message: string; targetUserIds?: string[] | null }) {
  const senderId = await requireAdmin();
  const message = input.message.trim();
  if (!message) throw new Error("Announcement message is required.");
  if (message.length > 1000) throw new Error("Announcement message must be 1000 characters or fewer.");

  const targetUserIds = input.targetUserIds === null ? null : normalizeTargetUserIds(input.targetUserIds);
  if (targetUserIds && targetUserIds.length === 0) throw new Error("Select at least one recipient.");

  const row = {
    id: randomBytes(12).toString("base64url"),
    sender_id: senderId,
    message,
    target_user_ids: targetUserIds,
    created_at_ms: Date.now(),
  };

  const { error } = await getSupabaseServerClient().from("announcements").insert(row);
  if (error) {
    if (isMissingAnnouncementsTableError(error)) {
      throw new Error("Supabase migration for announcements is required before sending notices.");
    }
    throw error;
  }

  return { announcement: mapAnnouncement(row), schemaMissing: false };
}

