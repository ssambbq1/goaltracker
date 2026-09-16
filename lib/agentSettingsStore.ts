import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { canCurrentUserUseAi, ensureAppUser, isAdminIdentity, requireLoginId } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase";

export type AgentSettings = {
  llmModel: string;
  hasApiKey: boolean;
  apiKeyPreview?: string;
  updatedAt?: number;
  schemaMissing?: boolean;
  activeKeyId?: string;
  canManage: boolean;
  keys: AgentKeySetting[];
};

export type AgentKeySetting = {
  id: string;
  llmModel: string;
  apiKeyPreview: string;
  updatedAt: number;
  isActive: boolean;
};

const DEFAULT_MODEL = "gpt-4o-mini";
const AGENT_SETTINGS_SCHEMA_MESSAGE =
  "Agent settings table is missing or outdated. Run the latest supabase migrations for agent_settings in Supabase.";

function isMissingAgentSettingsTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  return record.code === "PGRST205" && String(record.message ?? "").includes("public.agent_settings");
}

function isMissingAgentSettingsColumnsError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const message = String(record.message ?? "");
  return (
    record.code === "PGRST204" ||
    message.includes("agent_settings.api_keys") ||
    message.includes("agent_settings.active_key_id") ||
    message.includes("api_keys") ||
    message.includes("active_key_id")
  );
}

function getEncryptionKey() {
  const secret = process.env.AGENT_SETTINGS_SECRET || process.env.AUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing AGENT_SETTINGS_SECRET, AUTH_SECRET, or SUPABASE_SERVICE_ROLE_KEY");
  return createHash("sha256").update(secret).digest();
}

function encryptApiKey(apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptApiKey(ciphertext: string) {
  const [version, iv, tag, encrypted] = ciphertext.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Saved API key is invalid");

  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function normalizeModel(model: string) {
  return model.trim().slice(0, 120);
}

function normalizeApiKey(apiKey: string) {
  return apiKey.trim().replace(/^Bearer\s+/i, "");
}

function validateOpenAiApiKey(apiKey: string) {
  if (!apiKey) return;
  if (!apiKey.startsWith("sk-")) {
    throw new Error("OpenAI API key must start with sk-. Paste the key from https://platform.openai.com/account/api-keys.");
  }
  if (apiKey.includes("*")) {
    throw new Error("Paste the full API key, not the masked preview.");
  }
}

function maskApiKey(apiKey: string) {
  const visiblePrefixLength = Math.min(7, Math.max(3, Math.ceil(apiKey.length * 0.18)));
  return `${apiKey.slice(0, visiblePrefixLength)}${"*".repeat(Math.max(8, apiKey.length - visiblePrefixLength))}`;
}

function makeApiKeyPreview(ciphertext: string) {
  try {
    return maskApiKey(decryptApiKey(ciphertext));
  } catch {
    return "saved-key********";
  }
}

type StoredAgentKey = {
  id: string;
  llm_model: string;
  api_key_ciphertext: string;
  created_at_ms: number;
  updated_at_ms: number;
};

function isStoredAgentKey(value: unknown): value is StoredAgentKey {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.llm_model === "string" &&
    typeof record.api_key_ciphertext === "string" &&
    typeof record.created_at_ms === "number" &&
    typeof record.updated_at_ms === "number"
  );
}

function normalizeStoredKeys(value: unknown) {
  return Array.isArray(value) ? value.filter(isStoredAgentKey) : [];
}

function legacyKeyFromRow(row: { llm_model: string | null; api_key_ciphertext: string | null; updated_at_ms: number | null }) {
  if (!row.api_key_ciphertext) return null;
  return {
    id: "default",
    llm_model: normalizeModel(row.llm_model || DEFAULT_MODEL) || DEFAULT_MODEL,
    api_key_ciphertext: row.api_key_ciphertext,
    created_at_ms: row.updated_at_ms ?? Date.now(),
    updated_at_ms: row.updated_at_ms ?? Date.now(),
  };
}

function toPublicSettings(input: {
  keys: StoredAgentKey[];
  activeKeyId: string;
  canManage: boolean;
  updatedAt?: number;
  schemaMissing?: boolean;
}): AgentSettings {
  const activeKey = input.keys.find((key) => key.id === input.activeKeyId) ?? input.keys[0] ?? null;
  const visibleKeys = input.canManage ? input.keys : activeKey ? [activeKey] : [];
  return {
    llmModel: activeKey?.llm_model || DEFAULT_MODEL,
    hasApiKey: Boolean(activeKey?.api_key_ciphertext),
    apiKeyPreview: activeKey?.api_key_ciphertext ? makeApiKeyPreview(activeKey.api_key_ciphertext) : undefined,
    updatedAt: input.updatedAt,
    schemaMissing: input.schemaMissing,
    activeKeyId: activeKey?.id,
    canManage: input.canManage,
    keys: visibleKeys.map((key) => ({
      id: key.id,
      llmModel: key.llm_model || DEFAULT_MODEL,
      apiKeyPreview: makeApiKeyPreview(key.api_key_ciphertext),
      updatedAt: key.updated_at_ms,
      isActive: key.id === activeKey?.id,
    })),
  };
}

async function getCurrentAdminState(loginId: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("login_id, google_email")
    .eq("login_id", loginId)
    .maybeSingle();
  if (error) throw error;

  return isAdminIdentity({ loginId, googleEmail: data?.google_email ?? null });
}

async function getGlobalAgentSettingsOwnerId() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("login_id, google_email")
    .or("login_id.eq.ssambbqcjh@gmail.com,google_email.eq.ssambbqcjh@gmail.com")
    .limit(10);
  if (error) throw error;

  const adminIds = (data ?? []).map((user) => user.login_id);
  if (adminIds.length === 0) return null;

  const settings = await supabase
    .from("agent_settings")
    .select("user_id, api_key_ciphertext, api_keys")
    .in("user_id", adminIds);
  if (settings.error) {
    if (isMissingAgentSettingsTableError(settings.error)) return adminIds[0] ?? null;
    if (isMissingAgentSettingsColumnsError(settings.error)) throw new Error(AGENT_SETTINGS_SCHEMA_MESSAGE);
    throw settings.error;
  }

  const ownerWithKey = (settings.data ?? []).find((setting) => {
    const keyCount = Array.isArray(setting.api_keys) ? setting.api_keys.length : 0;
    return Boolean(setting.api_key_ciphertext) || keyCount > 0;
  });

  return ownerWithKey?.user_id ?? adminIds[0] ?? null;
}

async function readStoredGlobalAgentSettings() {
  const ownerId = await getGlobalAgentSettingsOwnerId();
  if (!ownerId) return { ownerId: null, data: null, schemaMissing: false };

  const { data, error } = await getSupabaseServerClient()
    .from("agent_settings")
    .select("llm_model,api_key_ciphertext,updated_at_ms,api_keys,active_key_id")
    .eq("user_id", ownerId)
    .maybeSingle();

  if (error) {
    if (isMissingAgentSettingsTableError(error)) return { ownerId, data: null, schemaMissing: true };
    if (isMissingAgentSettingsColumnsError(error)) throw new Error(AGENT_SETTINGS_SCHEMA_MESSAGE);
    throw error;
  }

  return { ownerId, data, schemaMissing: false };
}

function normalizeSettingsKeys(data: Awaited<ReturnType<typeof readStoredGlobalAgentSettings>>["data"]) {
  const keys = normalizeStoredKeys(data?.api_keys);
  const legacyKey = data ? legacyKeyFromRow(data) : null;
  return keys.length ? keys : legacyKey ? [legacyKey] : [];
}

export async function readAgentSettings(): Promise<AgentSettings> {
  const loginId = await requireLoginId();
  const canManage = await getCurrentAdminState(loginId);
  const { data, schemaMissing } = await readStoredGlobalAgentSettings();
  const storedKeys = normalizeSettingsKeys(data);
  return toPublicSettings({
    keys: storedKeys,
    activeKeyId: data?.active_key_id || storedKeys[0]?.id || "",
    canManage,
    updatedAt: data?.updated_at_ms ?? undefined,
    schemaMissing,
  });
}

export async function readAgentCredentials() {
  await requireLoginId();
  const { ownerId, data, schemaMissing } = await readStoredGlobalAgentSettings();
  if (schemaMissing) throw new Error(AGENT_SETTINGS_SCHEMA_MESSAGE);
  if (!ownerId) throw new Error("Admin must configure an LLM API key before AI Agent can run.");
  const storedKeys = normalizeSettingsKeys(data);
  const activeKey = storedKeys.find((key) => key.id === data?.active_key_id) ?? storedKeys[0] ?? null;
  if (!activeKey?.api_key_ciphertext) throw new Error("Admin must configure an LLM API key before AI Agent can run.");

  return {
    model: activeKey.llm_model || data?.llm_model || DEFAULT_MODEL,
    apiKey: decryptApiKey(activeKey.api_key_ciphertext),
  };
}

export async function requireAgentAccess() {
  if (!(await canCurrentUserUseAi())) {
    throw new Error("AI access is not enabled for this account.");
  }
  await readAgentCredentials();
}

export async function saveAgentSettings(input: {
  llmModel: string;
  apiKey?: string;
  clearApiKey?: boolean;
  activeKeyId?: string;
  updateKeyId?: string;
  deleteKeyId?: string;
}) {
  const loginId = await requireLoginId();
  if (!(await getCurrentAdminState(loginId))) throw new Error("Admin access is required to change AI Agent settings.");
  await ensureAppUser(loginId);

  const current = await getSupabaseServerClient()
    .from("agent_settings")
    .select("llm_model,api_key_ciphertext,updated_at_ms,api_keys,active_key_id")
    .eq("user_id", loginId)
    .maybeSingle();
  if (current.error) {
    if (isMissingAgentSettingsTableError(current.error)) throw new Error(AGENT_SETTINGS_SCHEMA_MESSAGE);
    if (isMissingAgentSettingsColumnsError(current.error)) throw new Error(AGENT_SETTINGS_SCHEMA_MESSAGE);
    throw current.error;
  }

  const nextApiKey = input.apiKey ? normalizeApiKey(input.apiKey) : "";
  validateOpenAiApiKey(nextApiKey);

  const now = Date.now();
  const currentKeys = normalizeStoredKeys(current.data?.api_keys);
  const legacyKey = current.data ? legacyKeyFromRow(current.data) : null;
  let keys = currentKeys.length ? currentKeys : legacyKey ? [legacyKey] : [];
  let activeKeyId = input.activeKeyId || current.data?.active_key_id || keys[0]?.id || "";

  if (input.deleteKeyId) {
    keys = keys.filter((key) => key.id !== input.deleteKeyId);
    if (activeKeyId === input.deleteKeyId) activeKeyId = keys[0]?.id || "";
  } else if (input.clearApiKey) {
    const targetId = input.activeKeyId || activeKeyId;
    keys = keys.filter((key) => key.id !== targetId);
    activeKeyId = keys[0]?.id || "";
  } else if (input.updateKeyId) {
    keys = keys.map((key) =>
      key.id === input.updateKeyId
        ? {
            ...key,
            llm_model: normalizeModel(input.llmModel) || DEFAULT_MODEL,
            api_key_ciphertext: nextApiKey ? encryptApiKey(nextApiKey) : key.api_key_ciphertext,
            updated_at_ms: now,
          }
        : key,
    );
  } else if (nextApiKey) {
    const newKey: StoredAgentKey = {
      id: randomBytes(9).toString("base64url"),
      llm_model: normalizeModel(input.llmModel) || DEFAULT_MODEL,
      api_key_ciphertext: encryptApiKey(nextApiKey),
      created_at_ms: now,
      updated_at_ms: now,
    };
    keys = [...keys, newKey];
    activeKeyId = newKey.id;
  } else if (input.llmModel && activeKeyId) {
    keys = keys.map((key) =>
      key.id === activeKeyId
        ? {
            ...key,
            llm_model: normalizeModel(input.llmModel) || DEFAULT_MODEL,
            updated_at_ms: now,
          }
        : key,
    );
  }

  const activeKey = keys.find((key) => key.id === activeKeyId) ?? keys[0] ?? null;

  const { error } = await getSupabaseServerClient().from("agent_settings").upsert({
    user_id: loginId,
    llm_model: activeKey?.llm_model || normalizeModel(input.llmModel) || DEFAULT_MODEL,
    api_key_ciphertext: activeKey?.api_key_ciphertext || "",
    api_keys: keys,
    active_key_id: activeKey?.id || "",
    updated_at_ms: now,
  });

  if (error) throw error;
  return readAgentSettings();
}
