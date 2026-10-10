import { afterEach, describe, expect, it, vi } from "vitest";
import { readStoredAgentPreferences, writeStoredAgentPreferences } from "../lib/agentPreferences";

afterEach(() => { vi.unstubAllGlobals(); });

describe("agent preferences", () => {
  it("restores all settings after saving, including false options", () => {
    let stored: string | null = null;
    vi.stubGlobal("window", { localStorage: {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { stored = value; },
    } });
    const preferences = { persona: "joo-eon-gyu", usePhoto: false, applyChanges: false, panelExpanded: true } as const;
    writeStoredAgentPreferences(preferences);
    expect(readStoredAgentPreferences()).toEqual(preferences);
  });

  it.each([null, "{", "null", '"invalid"', '{"persona":"unknown","usePhoto":"false","applyChanges":0}'])(
    "uses defaults for missing or invalid storage: %s", (stored) => {
      vi.stubGlobal("window", { localStorage: { getItem: () => stored } });
      expect(readStoredAgentPreferences()).toEqual({ persona: "general", usePhoto: true, applyChanges: true, panelExpanded: false });
    },
  );

  it("keeps working when browser storage is blocked", () => {
    vi.stubGlobal("window", { get localStorage() { throw new Error("Blocked"); } });
    const defaults = readStoredAgentPreferences();
    expect(defaults.persona).toBe("general");
    expect(() => writeStoredAgentPreferences(defaults)).not.toThrow();
  });
});
