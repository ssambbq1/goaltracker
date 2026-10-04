import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), run: vi.fn() }));
vi.mock("@/lib/agentSettingsStore", () => ({ requireAgentAccess: mocks.access }));
vi.mock("@/lib/listAgent", () => ({ runListAgent: mocks.run }));
vi.mock("@/lib/auth", () => ({
  isUnauthorizedError: (error: unknown) => error instanceof Error && error.message === "unauthorized",
  getErrorMessage: (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback,
}));
import { POST } from "../app/api/agent/route";

describe("persona agent route", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.access.mockResolvedValue(undefined); mocks.run.mockResolvedValue({ message: "proposal", applied: false, actions: [] }); });
  it.each(["jordan-peterson", "joo-eon-gyu"])("passes %s and current list conversation to the planner", async (persona) => {
    const history = [{ role: "user", content: "Review my habits" }];
    const response = await POST(new Request("http://localhost/api/agent", { method: "POST", body: JSON.stringify({ prompt: "Suggest additions", apply: true, selectedList: "routine", conversationHistory: history, persona }) }));
    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith("Suggest additions", true, "routine", history, persona);
  });
  it("rejects persona requests before planning without access", async () => {
    mocks.access.mockRejectedValueOnce(new Error("unauthorized"));
    const response = await POST(new Request("http://localhost/api/agent", { method: "POST", body: JSON.stringify({ prompt: "Advise me", persona: "jordan-peterson" }) }));
    expect(response.status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
