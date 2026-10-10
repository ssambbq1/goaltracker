import { normalizeAgentPersona, type AgentPersonaId } from "./agentPersonas";

export type AgentPreferences = {
  persona: AgentPersonaId;
  usePhoto: boolean;
  applyChanges: boolean;
  panelExpanded: boolean;
};

const STORAGE_KEY = "boost-mastery.agent-preferences";

export function readStoredAgentPreferences(): AgentPreferences {
  const defaults: AgentPreferences = { persona: "general", usePhoto: true, applyChanges: true, panelExpanded: false };
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!stored || typeof stored !== "object") return defaults;
    const value = stored as Record<string, unknown>;
    return {
      persona: normalizeAgentPersona(value.persona),
      usePhoto: typeof value.usePhoto === "boolean" ? value.usePhoto : defaults.usePhoto,
      applyChanges: typeof value.applyChanges === "boolean" ? value.applyChanges : defaults.applyChanges,
      panelExpanded: typeof value.panelExpanded === "boolean" ? value.panelExpanded : defaults.panelExpanded,
    };
  } catch {
    return defaults;
  }
}

export function writeStoredAgentPreferences(preferences: AgentPreferences) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage can be unavailable in private or restricted browser sessions.
  }
}
