import { addGoal, readGoals, updateGoal } from "@/lib/goalStore";
import { addRoutine, readRoutines, updateRoutine } from "@/lib/routineStore";
import { addTodo, deleteTodo, readTodos, updateTodo } from "@/lib/todoStore";
import { readAgentCredentials } from "@/lib/agentSettingsStore";

type AgentAction =
  | { type: "add_todo"; title: string; targetDate: string; category?: string }
  | { type: "update_todo"; id: string; title?: string; targetDate?: string; category?: string; completed?: boolean }
  | { type: "delete_todo"; id: string }
  | { type: "add_goal"; title: string; memo?: string; target?: number; unit?: string; deadline?: string }
  | { type: "update_goal"; id: string; title?: string; memo?: string; target?: number; unit?: string; deadline?: string }
  | { type: "add_routine"; title: string; memo?: string; startDate: string; endDate: string }
  | { type: "update_routine"; id: string; title?: string; memo?: string; startDate?: string; endDate?: string };

export type AgentResult = {
  message: string;
  actions: AgentAction[];
  applied: boolean;
  data: Awaited<ReturnType<typeof readAgentListContext>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asOptionalString(value: unknown) {
  const text = asString(value);
  return text || undefined;
}

function asOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeDate(value: unknown) {
  const text = asString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function coerceAction(value: unknown): AgentAction | null {
  if (!isRecord(value)) return null;
  const type = asString(value.type);

  if (type === "add_todo") {
    const title = asString(value.title);
    const targetDate = normalizeDate(value.targetDate);
    if (!title || !targetDate) return null;
    return { type, title, targetDate, category: asOptionalString(value.category) };
  }

  if (type === "update_todo") {
    const id = asString(value.id);
    if (!id) return null;
    return {
      type,
      id,
      title: asOptionalString(value.title),
      targetDate: value.targetDate === undefined ? undefined : normalizeDate(value.targetDate),
      category: asOptionalString(value.category),
      completed: asOptionalBoolean(value.completed),
    };
  }

  if (type === "delete_todo") {
    const id = asString(value.id);
    return id ? { type, id } : null;
  }

  if (type === "add_goal") {
    const title = asString(value.title);
    if (!title) return null;
    return {
      type,
      title,
      memo: asOptionalString(value.memo) ?? "",
      target: asOptionalNumber(value.target),
      unit: asOptionalString(value.unit),
      deadline: value.deadline === undefined ? "" : normalizeDate(value.deadline),
    };
  }

  if (type === "update_goal") {
    const id = asString(value.id);
    if (!id) return null;
    return {
      type,
      id,
      title: asOptionalString(value.title),
      memo: asOptionalString(value.memo),
      target: asOptionalNumber(value.target),
      unit: asOptionalString(value.unit),
      deadline: value.deadline === undefined ? undefined : normalizeDate(value.deadline),
    };
  }

  if (type === "add_routine") {
    const title = asString(value.title);
    const startDate = normalizeDate(value.startDate);
    const endDate = normalizeDate(value.endDate);
    if (!title || !startDate || !endDate) return null;
    return { type, title, memo: asOptionalString(value.memo) ?? "", startDate, endDate };
  }

  if (type === "update_routine") {
    const id = asString(value.id);
    if (!id) return null;
    return {
      type,
      id,
      title: asOptionalString(value.title),
      memo: asOptionalString(value.memo),
      startDate: value.startDate === undefined ? undefined : normalizeDate(value.startDate),
      endDate: value.endDate === undefined ? undefined : normalizeDate(value.endDate),
    };
  }

  return null;
}

function parseAgentResponse(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const parsed = JSON.parse(fenced || trimmed) as unknown;
  if (!isRecord(parsed)) throw new Error("Agent returned an invalid response");

  const actions = Array.isArray(parsed.actions)
    ? parsed.actions.map(coerceAction).filter((action): action is AgentAction => Boolean(action)).slice(0, 12)
    : [];

  return {
    message: asString(parsed.message) || "I reviewed your lists.",
    actions,
  };
}

export async function readAgentListContext() {
  const [goals, todos, routines] = await Promise.all([readGoals(), readTodos(), readRoutines()]);
  return {
    goals,
    todos,
    routines: routines.map((routine) => ({
      id: routine.id,
      title: routine.title,
      memo: routine.memo,
      startDate: routine.startDate,
      endDate: routine.endDate,
      createdAt: routine.createdAt,
    })),
  };
}

async function callOpenAiCompatibleChat(input: { apiKey: string; model: string; prompt: string; context: unknown }) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You manage a personal planning app. Return only JSON with keys message and actions. " +
            "Actions must be an array of allowed action objects. Use existing ids for updates/deletes. " +
            "Allowed types: add_todo, update_todo, delete_todo, add_goal, update_goal, add_routine, update_routine. " +
            "Use YYYY-MM-DD dates. If the user asks only for analysis, return an empty actions array.",
        },
        {
          role: "user",
          content: JSON.stringify({
            today: new Date().toISOString().slice(0, 10),
            request: input.prompt,
            lists: input.context,
          }),
        },
      ],
    }),
  });

  const data = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  } | null;

  if (!response.ok) {
    const message = data?.error?.message || "LLM request failed";
    if (response.status === 401 || /incorrect api key|invalid api key/i.test(message)) {
      throw new Error("Saved OpenAI API key is invalid. Open Settings and replace it with a full key that starts with sk-.");
    }
    throw new Error(message);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM did not return content");
  return parseAgentResponse(content);
}

async function applyAction(action: AgentAction) {
  if (action.type === "add_todo") {
    await addTodo(action.title, action.targetDate, action.category ?? "");
    return;
  }

  if (action.type === "update_todo") {
    await updateTodo(action.id, {
      title: action.title,
      targetDate: action.targetDate,
      category: action.category,
      completed: action.completed,
    });
    return;
  }

  if (action.type === "delete_todo") {
    await deleteTodo(action.id);
    return;
  }

  if (action.type === "add_goal") {
    await addGoal({
      title: action.title,
      memo: action.memo ?? "",
      target: action.target ?? 1,
      unit: action.unit ?? "units",
      deadline: action.deadline ?? "",
    });
    return;
  }

  if (action.type === "update_goal") {
    await updateGoal(action.id, {
      title: action.title,
      memo: action.memo,
      target: action.target,
      unit: action.unit,
      deadline: action.deadline,
    });
    return;
  }

  if (action.type === "add_routine") {
    await addRoutine({
      title: action.title,
      memo: action.memo ?? "",
      startDate: action.startDate,
      endDate: action.endDate,
    });
    return;
  }

  await updateRoutine(action.id, {
    title: action.title,
    memo: action.memo,
    startDate: action.startDate,
    endDate: action.endDate,
  });
}

export async function runListAgent(prompt: string, apply: boolean): Promise<AgentResult> {
  const request = prompt.trim();
  if (!request) throw new Error("Agent request is required");

  const credentials = await readAgentCredentials();
  const context = await readAgentListContext();
  const agentResponse = await callOpenAiCompatibleChat({
    apiKey: credentials.apiKey,
    model: credentials.model,
    prompt: request,
    context,
  });

  if (apply) {
    for (const action of agentResponse.actions) {
      await applyAction(action);
    }
  }

  return {
    ...agentResponse,
    applied: apply,
    data: await readAgentListContext(),
  };
}
