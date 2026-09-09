import { requireLoginId, isAdminIdentity } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase";

export type AdminUser = {
  loginId: string;
  displayName: string | null;
  googleEmail: string | null;
  isAdmin: boolean;
  aiEnabled: boolean;
  hasApiKey: boolean;
  apiKeyCount: number;
  activeModel: string;
  createdAt: number;
  lastLoginAt: number;
};

type AppUserAdminRow = {
  login_id: string;
  display_name: string | null;
  google_email: string | null;
  ai_enabled?: boolean;
  created_at_ms: number;
  last_login_at_ms: number;
};

function isMissingAiEnabledColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const message = String(record.message ?? "");
  return (
    record.code === "42703" ||
    record.code === "PGRST204" ||
    message.includes("app_users.ai_enabled") ||
    message.includes("ai_enabled")
  );
}

export async function requireAdmin() {
  const loginId = await requireLoginId();
  const { data: user, error } = await getSupabaseServerClient()
    .from("app_users")
    .select("login_id, google_email")
    .eq("login_id", loginId)
    .maybeSingle();

  if (error) throw error;
  if (!isAdminIdentity({ loginId, googleEmail: user?.google_email ?? null })) {
    throw new Error("Admin access is required.");
  }

  return loginId;
}

function getKeyCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

export async function listAdminUsers() {
  await requireAdmin();
  const supabase = getSupabaseServerClient();
  const userQuery = supabase
    .from("app_users")
    .select("login_id, display_name, google_email, ai_enabled, created_at_ms, last_login_at_ms")
    .order("last_login_at_ms", { ascending: false });

  const users = await userQuery;
  let aiAccessSchemaMissing = false;
  let userRows: AppUserAdminRow[] = [];

  if (users.error) {
    if (!isMissingAiEnabledColumnError(users.error)) throw users.error;
    aiAccessSchemaMissing = true;
    const fallbackUsers = await supabase
      .from("app_users")
      .select("login_id, display_name, google_email, created_at_ms, last_login_at_ms")
      .order("last_login_at_ms", { ascending: false });
    if (fallbackUsers.error) throw fallbackUsers.error;
    userRows = fallbackUsers.data ?? [];
  } else {
    userRows = users.data ?? [];
  }

  const { data: settings, error: settingsError } = await supabase
    .from("agent_settings")
    .select("user_id, llm_model, api_key_ciphertext, api_keys");

  if (settingsError) throw settingsError;

  const settingsByUser = new Map((settings ?? []).map((setting) => [setting.user_id, setting]));
  const adminUsers: AdminUser[] = userRows.map((user) => {
    const setting = settingsByUser.get(user.login_id);
    const isAdmin = isAdminIdentity({ loginId: user.login_id, googleEmail: user.google_email });
    const apiKeyCount = getKeyCount(setting?.api_keys);
    return {
      loginId: user.login_id,
      displayName: user.display_name,
      googleEmail: user.google_email,
      isAdmin,
      aiEnabled: isAdmin || Boolean("ai_enabled" in user ? user.ai_enabled : false),
      hasApiKey: Boolean(setting?.api_key_ciphertext) || apiKeyCount > 0,
      apiKeyCount,
      activeModel: setting?.llm_model || "",
      createdAt: user.created_at_ms,
      lastLoginAt: user.last_login_at_ms,
    };
  });

  return {
    users: adminUsers,
    aiAccessSchemaMissing,
  };
}

export async function updateUserAiAccess(targetLoginId: string, aiEnabled: boolean) {
  await requireAdmin();
  const loginId = targetLoginId.trim().toLowerCase();
  if (!loginId) throw new Error("User ID is required.");

  const supabase = getSupabaseServerClient();
  const { data: user, error: readError } = await supabase
    .from("app_users")
    .select("login_id, google_email")
    .eq("login_id", loginId)
    .maybeSingle();

  if (readError) throw readError;
  if (!user) throw new Error("User not found.");
  if (isAdminIdentity({ loginId: user.login_id, googleEmail: user.google_email })) {
    throw new Error("Admin AI access cannot be disabled.");
  }

  const { error } = await supabase.from("app_users").update({ ai_enabled: aiEnabled }).eq("login_id", loginId);
  if (error) {
    if (isMissingAiEnabledColumnError(error)) {
      throw new Error("Supabase migration for AI access is required before changing permissions.");
    }
    throw error;
  }

  return listAdminUsers();
}
