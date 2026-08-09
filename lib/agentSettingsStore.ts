import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { ensureAppUser, requireLoginId } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase";

export type AgentSettings = {
  llmModel: string;
  hasApiKey: boolean;
  apiKeyPreview?: string;
  updatedAt?: number;
  schemaMissing?: boolean;
};

const DEFAULT_MODEL = "gpt-4o-mini";
const AGENT_SETTINGS_SCHEMA_MESSAGE =
  "Agent settings table is missing. Run supabase/migrations/20260809090000_add_agent_settings.sql in Supabase.";

function isMissingAgentSettingsTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  return record.code === "PGRST205" && String(record.message ?? "").includes("public.agent_settings");
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

export async function readAgentSettings(): Promise<AgentSettings> {
  const loginId = await requireLoginId();
  const { data, error } = await getSupabaseServerClient()
    .from("agent_settings")
    .select("llm_model,api_key_ciphertext,updated_at_ms")
    .eq("user_id", loginId)
    .maybeSingle();

  if (error) {
    if (isMissingAgentSettingsTableError(error)) {
      return {
        llmModel: DEFAULT_MODEL,
        hasApiKey: false,
        schemaMissing: true,
      };
    }
    throw error;
  }

  return {
    llmModel: data?.llm_model || DEFAULT_MODEL,
    hasApiKey: Boolean(data?.api_key_ciphertext),
    apiKeyPreview: data?.api_key_ciphertext ? makeApiKeyPreview(data.api_key_ciphertext) : undefined,
    updatedAt: data?.updated_at_ms ?? undefined,
  };
}

export async function readAgentCredentials() {
  const loginId = await requireLoginId();
  const { data, error } = await getSupabaseServerClient()
    .from("agent_settings")
    .select("llm_model,api_key_ciphertext")
    .eq("user_id", loginId)
    .maybeSingle();

  if (error) {
    if (isMissingAgentSettingsTableError(error)) throw new Error(AGENT_SETTINGS_SCHEMA_MESSAGE);
    throw error;
  }
  if (!data?.api_key_ciphertext) throw new Error("Add your LLM API key in Settings first.");

  return {
    model: data.llm_model || DEFAULT_MODEL,
    apiKey: decryptApiKey(data.api_key_ciphertext),
  };
}

export async function saveAgentSettings(input: { llmModel: string; apiKey?: string; clearApiKey?: boolean }) {
  const loginId = await requireLoginId();
  await ensureAppUser(loginId);

  const current = await getSupabaseServerClient()
    .from("agent_settings")
    .select("api_key_ciphertext")
    .eq("user_id", loginId)
    .maybeSingle();
  if (current.error) {
    if (isMissingAgentSettingsTableError(current.error)) throw new Error(AGENT_SETTINGS_SCHEMA_MESSAGE);
    throw current.error;
  }

  const nextApiKey = input.apiKey ? normalizeApiKey(input.apiKey) : "";
  validateOpenAiApiKey(nextApiKey);

  const apiKeyCiphertext = input.clearApiKey
    ? ""
    : nextApiKey
      ? encryptApiKey(nextApiKey)
      : current.data?.api_key_ciphertext ?? "";

  const { error } = await getSupabaseServerClient().from("agent_settings").upsert({
    user_id: loginId,
    llm_model: normalizeModel(input.llmModel) || DEFAULT_MODEL,
    api_key_ciphertext: apiKeyCiphertext,
    updated_at_ms: Date.now(),
  });

  if (error) throw error;
  return readAgentSettings();
}
