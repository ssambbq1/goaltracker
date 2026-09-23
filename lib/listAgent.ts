import {
  addEntry,
  addGoal,
  archiveGoal,
  deleteEntry,
  deleteGoal,
  permanentlyDeleteGoal,
  readArchivedGoals,
  readDeletedGoals,
  readGoals,
  restoreGoal,
  updateEntry,
  updateGoal,
} from "@/lib/goalStore";
import {
  addRoutine,
  archiveRoutine,
  clearRoutineMark,
  deleteRoutine,
  permanentlyDeleteRoutine,
  readArchivedRoutines,
  readDeletedRoutines,
  readRoutines,
  restoreRoutine,
  setRoutineMark,
  updateRoutine,
} from "@/lib/routineStore";
import { summarizeRoutineForAgent } from "@/lib/routineAgentSummary";
import {
  addTodo,
  archiveTodo,
  deleteTodo,
  permanentlyDeleteTodo,
  readArchivedTodos,
  readDeletedTodos,
  readTodos,
  restoreTodo,
  updateTodo,
} from "@/lib/todoStore";
import { readAgentCredentials } from "@/lib/agentSettingsStore";
import { getTaskOverdueDays } from "@/lib/taskQueryFilters";

type AgentAction =
  | { type: "add_todo"; title: string; targetDate: string; category?: string }
  | { type: "update_todo"; id: string; title?: string; targetDate?: string; category?: string; completed?: boolean; focused?: boolean }
  | { type: "delete_todo"; id: string }
  | { type: "archive_todo"; id: string }
  | { type: "restore_todo"; id: string }
  | { type: "permanently_delete_todo"; id: string }
  | { type: "add_goal"; title: string; memo?: string; target?: number; unit?: string; deadline?: string; createdAt?: number }
  | { type: "update_goal"; id: string; title?: string; memo?: string; target?: number; unit?: string; deadline?: string; createdAt?: number; focused?: boolean }
  | { type: "delete_goal"; id: string }
  | { type: "archive_goal"; id: string }
  | { type: "restore_goal"; id: string }
  | { type: "permanently_delete_goal"; id: string }
  | { type: "add_goal_entry"; goalId: string; value: number; memo?: string; createdAt?: number }
  | { type: "update_goal_entry"; goalId: string; entryId: string; value?: number; memo?: string; createdAt?: number }
  | { type: "delete_goal_entry"; goalId: string; entryId: string }
  | { type: "add_routine"; title: string; memo?: string; startDate: string; endDate: string }
  | { type: "update_routine"; id: string; title?: string; memo?: string; startDate?: string; endDate?: string; focused?: boolean }
  | { type: "set_routine_mark"; routineId: string; date: string; status: "success" | "failure" }
  | { type: "clear_routine_mark"; routineId: string; date: string }
  | { type: "delete_routine"; id: string }
  | { type: "archive_routine"; id: string }
  | { type: "restore_routine"; id: string }
  | { type: "permanently_delete_routine"; id: string };

type ListKind = "goal" | "todo" | "routine";
type AgentTargetList = ListKind | "archive" | "bin" | "unknown";
type AgentSelectedList = Exclude<AgentTargetList, "unknown">;
type AgentListContext = Awaited<ReturnType<typeof readAgentListContext>>;

export type AgentResult = {
  message: string;
  actions: AgentAction[];
  applied: boolean;
  targetList: AgentTargetList;
  clarification?: {
    originalPrompt: string;
    question: string;
  };
  data: Awaited<ReturnType<typeof readAgentListContext>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

type AgentConversationMessage = {
  role: "user" | "agent";
  content: string;
};

function normalizeConversationHistory(value: unknown): AgentConversationMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const role = item.role === "agent" ? "agent" : item.role === "user" ? "user" : null;
      const content = asString(item.content);
      if (!role || !content) return null;
      return {
        role,
        content: content.slice(0, 1200),
      };
    })
    .filter((item): item is AgentConversationMessage => Boolean(item))
    .slice(-10);
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const separatedDate = text.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
  if (separatedDate) {
    const [, year, month, day] = separatedDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const lowerText = text.toLowerCase();
  if (/^(today|\uC624\uB298)$/.test(lowerText)) return toLocalDateInputValue();
  if (/^(tomorrow|\uB0B4\uC77C)$/.test(lowerText)) return toLocalDateInputValue(addDays(new Date(), 1));
  if (/^(next\s*week|\uB2E4\uC74C\s*\uC8FC)$/.test(lowerText)) return toLocalDateInputValue(addDays(new Date(), 7));

  return "";
}

function toLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + days);
  return next;
}

function asOptionalTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const date = normalizeDate(value);
  if (!date) return undefined;
  const timestamp = new Date(`${date}T12:00:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function firstStringField(record: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = asString(record[field]);
    if (value) return value;
  }
  return "";
}

function firstIdField(record: Record<string, unknown>, fields: string[]) {
  return firstStringField(record, fields);
}

function normalizeFuzzyText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function fuzzySimilarity(left: string, right: string) {
  const normalizedLeft = normalizeFuzzyText(left);
  const normalizedRight = normalizeFuzzyText(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return 0.9;

  const distance = levenshteinDistance(normalizedLeft, normalizedRight);
  return 1 - distance / Math.max(normalizedLeft.length, normalizedRight.length);
}

function findClosestItemId<T extends { id: string; title: string }>(items: T[], query: string, minimumScore = 0.45) {
  const normalizedQuery = normalizeFuzzyText(query);
  if (!normalizedQuery) return "";

  const [best] = items
    .map((item) => ({ item, score: fuzzySimilarity(query, item.title) }))
    .sort((left, right) => right.score - left.score);

  return best && best.score >= minimumScore ? best.item.id : "";
}

function normalizeActionType(type: string) {
  const normalized = type.trim().toLowerCase().replaceAll("-", "_");
  if (["add_task", "create_task", "new_task"].includes(normalized)) return "add_todo";
  if (["update_task", "edit_task", "complete_task"].includes(normalized)) return "update_todo";
  if (["reschedule_task", "postpone_task", "change_task_date", "update_task_date", "set_task_date"].includes(normalized)) return "update_todo";
  if (["delete_task", "remove_task"].includes(normalized)) return "delete_todo";
  if (["create_todo", "new_todo"].includes(normalized)) return "add_todo";
  if (["edit_todo", "complete_todo"].includes(normalized)) return "update_todo";
  if (["reschedule_todo", "postpone_todo", "change_todo_date", "update_todo_date", "set_todo_date"].includes(normalized)) return "update_todo";
  if (["remove_todo"].includes(normalized)) return "delete_todo";
  if (["archive_task", "archive_todo", "move_task_to_archive", "move_todo_to_archive", "move_task_to_storage", "move_todo_to_storage", "send_task_to_archive", "send_todo_to_archive", "send_task_to_storage", "send_todo_to_storage"].includes(normalized)) return "archive_todo";
  if (["restore_task", "restore_todo", "restore_archived_task", "restore_archived_todo"].includes(normalized)) return "restore_todo";
  if (["delete_archived_task", "delete_archived_todo", "move_archived_task_to_bin", "move_archived_todo_to_bin"].includes(normalized)) return "delete_todo";
  if (["permanently_delete_task", "permanent_delete_task", "delete_task_forever"].includes(normalized)) return "permanently_delete_todo";
  if (["permanently_delete_todo", "permanent_delete_todo", "delete_todo_forever"].includes(normalized)) return "permanently_delete_todo";
  if (["create_goal", "new_goal"].includes(normalized)) return "add_goal";
  if (["edit_goal"].includes(normalized)) return "update_goal";
  if (["reschedule_goal", "postpone_goal", "change_goal_date", "update_goal_date", "set_goal_date", "change_goal_deadline", "update_goal_deadline", "set_goal_deadline"].includes(normalized)) return "update_goal";
  if (["delete_goal", "remove_goal"].includes(normalized)) return "delete_goal";
  if (["archive_goal", "move_goal_to_archive", "move_goal_to_storage", "send_goal_to_archive", "send_goal_to_storage"].includes(normalized)) return "archive_goal";
  if (["restore_goal", "restore_archived_goal"].includes(normalized)) return "restore_goal";
  if (["delete_archived_goal", "move_archived_goal_to_bin"].includes(normalized)) return "delete_goal";
  if (["permanently_delete_goal", "permanent_delete_goal", "delete_goal_forever"].includes(normalized)) return "permanently_delete_goal";
  if (["add_record", "create_record", "add_entry", "create_entry", "add_goal_record"].includes(normalized)) return "add_goal_entry";
  if (["update_record", "edit_record", "update_entry", "edit_entry", "update_goal_record"].includes(normalized)) return "update_goal_entry";
  if (["delete_record", "remove_record", "delete_entry", "remove_entry", "delete_goal_record"].includes(normalized)) return "delete_goal_entry";
  if (["add_habit", "create_habit", "new_habit"].includes(normalized)) return "add_routine";
  if (["update_habit", "edit_habit"].includes(normalized)) return "update_routine";
  if (["reschedule_habit", "postpone_habit", "change_habit_date", "update_habit_date", "set_habit_date"].includes(normalized)) return "update_routine";
  if (["delete_habit", "remove_habit", "delete_routine", "remove_routine"].includes(normalized)) return "delete_routine";
  if (["archive_habit", "archive_routine", "move_habit_to_archive", "move_routine_to_archive", "move_habit_to_storage", "move_routine_to_storage", "send_habit_to_archive", "send_routine_to_archive", "send_habit_to_storage", "send_routine_to_storage"].includes(normalized)) return "archive_routine";
  if (["restore_habit", "restore_routine", "restore_archived_habit", "restore_archived_routine"].includes(normalized)) return "restore_routine";
  if (["delete_archived_habit", "delete_archived_routine", "move_archived_habit_to_bin", "move_archived_routine_to_bin"].includes(normalized)) return "delete_routine";
  if (["permanently_delete_habit", "permanent_delete_habit", "delete_habit_forever"].includes(normalized)) return "permanently_delete_routine";
  if (["permanently_delete_routine", "permanent_delete_routine", "delete_routine_forever"].includes(normalized)) return "permanently_delete_routine";
  if (["reschedule_routine", "postpone_routine", "change_routine_date", "update_routine_date", "set_routine_date"].includes(normalized)) return "update_routine";
  return normalized;
}

function normalizeActionDate(record: Record<string, unknown>, fields: string[]) {
  return normalizeDate(firstStringField(record, fields));
}

function getRequestedListKinds(request: string) {
  const text = request.toLowerCase();
  const kinds: ListKind[] = [];
  if (/\b(tasks?|todos?|to-?dos?)\b|\uD560\s*\uC77C|\uB2E8\uC21C\s*\uD560\s*\uC77C|\uD0DC\uC2A4\uD06C|\uC791\uC5C5/.test(text)) kinds.push("todo");
  if (/\b(habits?|routines?)\b|\uC2B5\uAD00|\uB8E8\uD2F4|\uBC18\uBCF5/.test(text)) kinds.push("routine");
  if (/\bgoals?\b|\uBAA9\uD45C/.test(text)) kinds.push("goal");
  if (kinds.length > 0) return [...new Set(kinds)];
  if (/\b(tasks?|todos?|to-?dos?)\b|할\s*일|단순\s*할\s*일|태스크|작업/.test(text)) kinds.push("todo");
  if (/\b(habits?|routines?)\b|습관|루틴|반복/.test(text)) kinds.push("routine");
  if (/\bgoals?\b|장기\s*목표|목표(?!일)|달성/.test(text)) kinds.push("goal");
  return kinds;
}

function getRequestedListKind(request: string): ListKind | null {
  const kinds = getRequestedListKinds(request);
  return kinds.length === 1 ? kinds[0] : null;
}

function actionListKind(action: AgentAction): ListKind {
  if (action.type.endsWith("_todo")) return "todo";
  if (action.type.endsWith("_routine") || action.type.endsWith("_routine_mark")) return "routine";
  return "goal";
}

function listKindLabel(kind: Exclude<AgentTargetList, "unknown">) {
  if (kind === "todo") return "tasks";
  if (kind === "routine") return "habits";
  if (kind === "archive") return "archive";
  if (kind === "bin") return "bin";
  return "goals";
}

function listKindMessageLabel(kind: ListKind, isKorean: boolean) {
  if (kind === "todo") return isKorean ? "할일" : "tasks";
  if (kind === "routine") return isKorean ? "습관" : "habits";
  return isKorean ? "목표" : "goals";
}

function listKindItemScope(kinds: ListKind[], isKorean: boolean) {
  if (kinds.length === 0) return isKorean ? "항목" : "items";
  const labels = kinds.map((kind) => listKindMessageLabel(kind, isKorean)).join(isKorean ? ", " : ", ");
  return isKorean ? `${labels} 항목` : `${labels} items`;
}

function normalizeTargetList(value: unknown): AgentTargetList {
  const text = asString(value).toLowerCase().replaceAll("-", "_");
  if (["todo", "todos", "task", "tasks", "to_do", "to_dos"].includes(text)) return "todo";
  if (["goal", "goals"].includes(text)) return "goal";
  if (["routine", "routines", "habit", "habits"].includes(text)) return "routine";
  if (["archive", "archives", "storage", "saved", "saved_items", "저장소", "보관함", "아카이브"].includes(text)) return "archive";
  if (["bin", "trash", "deleted", "deleted_items"].includes(text)) return "bin";
  return "unknown";
}

function normalizeSelectedList(value: unknown): AgentSelectedList | null {
  const targetList = normalizeTargetList(value);
  return targetList === "unknown" ? null : targetList;
}

function getRequestTargetList(request: string, selectedList: AgentSelectedList | null): AgentTargetList {
  if (usesBinScope(request)) return "bin";
  if (isArchiveRequest(request)) return "archive";

  const requestedKinds = getRequestedListKinds(request);
  if (requestedKinds.length === 1) return requestedKinds[0];
  if (requestedKinds.length > 1) return "unknown";

  return selectedList ?? "unknown";
}

function getDefaultActiveListKind(request: string, selectedList: AgentSelectedList | null): ListKind | null {
  const targetList = getRequestTargetList(request, selectedList);
  return targetList === "goal" || targetList === "todo" || targetList === "routine" ? targetList : null;
}

function isPermanentDeleteAction(action: AgentAction) {
  return (
    action.type === "permanently_delete_todo" ||
    action.type === "permanently_delete_goal" ||
    action.type === "permanently_delete_routine"
  );
}

function isArchiveTargetAction(action: AgentAction) {
  return (
    action.type === "archive_todo" ||
    action.type === "archive_goal" ||
    action.type === "archive_routine" ||
    action.type === "restore_todo" ||
    action.type === "restore_goal" ||
    action.type === "restore_routine"
  );
}

function isArchiveScopedAction(action: AgentAction) {
  return (
    isArchiveTargetAction(action) ||
    action.type === "delete_todo" ||
    action.type === "delete_goal" ||
    action.type === "delete_routine"
  );
}

function inferTargetListFromActions(actions: AgentAction[]): AgentTargetList {
  if (actions.length > 0 && actions.every(isPermanentDeleteAction)) return "bin";
  if (actions.length > 0 && actions.every(isArchiveTargetAction)) return "archive";
  const kinds = new Set(actions.map(actionListKind));
  if (kinds.size !== 1) return "unknown";
  return [...kinds][0];
}

function usesBinScope(request: string) {
  return /\b(bin|trash|deleted items?)\b|\uD734\uC9C0\uD1B5/.test(request.toLowerCase());
}

function sanitizeActionsForRequest(actions: AgentAction[], request: string, selectedList: AgentSelectedList | null = null) {
  if (usesBinScope(request) || selectedList === "bin") return actions;
  return actions.filter((action) => !isPermanentDeleteAction(action));
}

function validateActionsForTarget(actions: AgentAction[], targetList: AgentTargetList, source: string) {
  if (actions.length === 0) return;
  if (targetList === "unknown") {
    throw new Error(
      `${source} did not identify whether this is a task, goal, or habit request. Please specify the list before applying changes.`,
    );
  }

  if (targetList === "bin") {
    const invalidAction = actions.find((action) => !isPermanentDeleteAction(action));
    if (invalidAction) {
      throw new Error(`${source} targeted the bin, but returned ${invalidAction.type}. Only permanent delete actions are allowed for bin cleanup.`);
    }
    return;
  }

  if (targetList === "archive") {
    const invalidAction = actions.find((action) => !isArchiveScopedAction(action));
    if (invalidAction) {
      throw new Error(`${source} targeted the archive, but returned ${invalidAction.type}. Only archive, restore, or move-to-bin actions are allowed for archive work.`);
    }
    return;
  }

  const mismatchedAction = actions.find((action) => actionListKind(action) !== targetList);
  if (mismatchedAction) {
    throw new Error(
      `${source} targeted ${listKindLabel(targetList)}, but returned ${mismatchedAction.type}. Please specify the correct list and try again.`,
    );
  }
}

function validateActionsForRequestedKinds(actions: AgentAction[], requestedKinds: ListKind[], source: string) {
  if (requestedKinds.length === 0 || actions.length === 0) return;
  const allowedKinds = new Set(requestedKinds);
  const invalidAction = actions.find((action) => !allowedKinds.has(actionListKind(action)));
  if (!invalidAction) return;

  throw new Error(
    `${source} returned ${invalidAction.type}, but the request only targeted ${requestedKinds
      .map((kind) => listKindLabel(kind))
      .join(", ")}. Apply only the requested list category.`,
  );
}

function isGoalEntryAction(action: AgentAction) {
  return action.type === "add_goal_entry" || action.type === "update_goal_entry" || action.type === "delete_goal_entry";
}

function requestAllowsGoalEntryActions(request: string) {
  return /\b(progress|record|records|entry|entries|log|logs|metric|metrics|value|amount)\b|기록|진행|진척|달성량|실적|수치|값/.test(
    request.toLowerCase(),
  );
}

function validateGoalActionIntent(actions: AgentAction[], request: string, source: string) {
  if (!actions.some(isGoalEntryAction) || requestAllowsGoalEntryActions(request)) return;
  throw new Error(
    `${source} returned a goal progress record action, but this request looks like a Goals list item change. Use add_goal for adding to the Goals list; use goal record actions only when the user explicitly asks for progress records.`,
  );
}

function enforceRequestedListKind(actions: AgentAction[], request: string, targetList: AgentTargetList) {
  const requestedKind = getRequestedListKind(request);
  if (!requestedKind) return;
  if (targetList === "archive" || targetList === "bin") return;

  if (targetList !== "unknown" && targetList !== requestedKind) {
    throw new Error(
      `The request explicitly targets ${listKindLabel(requestedKind)}, but the agent targeted ${listKindLabel(targetList)}. Try again with the item name or id from that list.`,
    );
  }

  validateActionsForTarget(actions, requestedKind, "The agent");
  if (requestedKind === "goal") validateGoalActionIntent(actions, request, "The agent");
}

function coerceAction(value: unknown): AgentAction | null {
  if (!isRecord(value)) return null;
  const type = normalizeActionType(asString(value.type));

  if (type === "add_todo") {
    const title = firstStringField(value, ["title", "task", "name"]);
    const targetDate = normalizeActionDate(value, ["targetDate", "dueDate", "deadline", "date"]) || toLocalDateInputValue();
    if (!title) return null;
    return { type, title, targetDate, category: asOptionalString(value.category) };
  }

  if (type === "update_todo") {
    const id = firstIdField(value, ["id", "todoId", "todo_id", "taskId", "task_id", "title", "task", "name"]);
    if (!id) return null;
    return {
      type,
      id,
      title: asOptionalString(value.title) ?? asOptionalString(value.task) ?? asOptionalString(value.name),
      targetDate:
        value.targetDate === undefined && value.dueDate === undefined && value.deadline === undefined && value.date === undefined
          ? undefined
          : normalizeActionDate(value, ["targetDate", "dueDate", "deadline", "date"]),
      category: asOptionalString(value.category),
      completed: asOptionalBoolean(value.completed),
      focused: asOptionalBoolean(value.focused),
    };
  }

  if (type === "delete_todo") {
    const id = firstIdField(value, ["id", "todoId", "todo_id", "taskId", "task_id", "title", "task", "name"]);
    return id ? { type, id } : null;
  }

  if (type === "archive_todo" || type === "restore_todo" || type === "permanently_delete_todo") {
    const id = firstIdField(value, ["id", "todoId", "todo_id", "taskId", "task_id", "title", "task", "name"]);
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
      createdAt: asOptionalTimestamp(value.createdAt) ?? asOptionalTimestamp(value.startDate) ?? asOptionalTimestamp(value.date),
    };
  }

  if (type === "update_goal") {
    const id = firstIdField(value, ["id", "goalId", "goal_id", "title", "goal", "name"]);
    if (!id) return null;
    return {
      type,
      id,
      title: asOptionalString(value.title),
      memo: asOptionalString(value.memo),
      target: asOptionalNumber(value.target),
      unit: asOptionalString(value.unit),
      deadline: value.deadline === undefined ? undefined : normalizeDate(value.deadline),
      createdAt:
        value.createdAt === undefined && value.startDate === undefined && value.date === undefined
          ? undefined
          : asOptionalTimestamp(value.createdAt) ?? asOptionalTimestamp(value.startDate) ?? asOptionalTimestamp(value.date),
      focused: asOptionalBoolean(value.focused),
    };
  }

  if (type === "delete_goal") {
    const id = firstIdField(value, ["id", "goalId", "goal_id", "title", "goal", "name"]);
    return id ? { type, id } : null;
  }

  if (type === "archive_goal" || type === "restore_goal" || type === "permanently_delete_goal") {
    const id = firstIdField(value, ["id", "goalId", "goal_id", "title", "goal", "name"]);
    return id ? { type, id } : null;
  }

  if (type === "add_goal_entry") {
    const goalId = asString(value.goalId) || asString(value.goal_id) || asString(value.id);
    const amount = asOptionalNumber(value.value) ?? asOptionalNumber(value.amount) ?? asOptionalNumber(value.progress);
    if (!goalId || amount === undefined) return null;
    return {
      type,
      goalId,
      value: amount,
      memo: asOptionalString(value.memo) ?? asOptionalString(value.note) ?? "",
      createdAt: asOptionalTimestamp(value.createdAt) ?? asOptionalTimestamp(value.date) ?? asOptionalTimestamp(value.recordedAt),
    };
  }

  if (type === "update_goal_entry") {
    const goalId = asString(value.goalId) || asString(value.goal_id);
    const entryId = asString(value.entryId) || asString(value.entry_id) || asString(value.id);
    if (!goalId || !entryId) return null;
    return {
      type,
      goalId,
      entryId,
      value: asOptionalNumber(value.value) ?? asOptionalNumber(value.amount) ?? asOptionalNumber(value.progress),
      memo: asOptionalString(value.memo) ?? asOptionalString(value.note),
      createdAt:
        value.createdAt === undefined && value.date === undefined && value.recordedAt === undefined
          ? undefined
          : asOptionalTimestamp(value.createdAt) ?? asOptionalTimestamp(value.date) ?? asOptionalTimestamp(value.recordedAt),
    };
  }

  if (type === "delete_goal_entry") {
    const goalId = asString(value.goalId) || asString(value.goal_id);
    const entryId = asString(value.entryId) || asString(value.entry_id) || asString(value.id);
    return goalId && entryId ? { type, goalId, entryId } : null;
  }

  if (type === "add_routine") {
    const title = asString(value.title);
    const startDate = normalizeDate(value.startDate);
    const endDate = normalizeDate(value.endDate);
    if (!title || !startDate || !endDate) return null;
    return { type, title, memo: asOptionalString(value.memo) ?? "", startDate, endDate };
  }

  if (type === "update_routine") {
    const id = firstIdField(value, ["id", "routineId", "routine_id", "habitId", "habit_id", "title", "habit", "routine", "name"]);
    if (!id) return null;
    return {
      type,
      id,
      title: asOptionalString(value.title),
      memo: asOptionalString(value.memo),
      startDate: value.startDate === undefined ? undefined : normalizeDate(value.startDate),
      endDate: value.endDate === undefined ? undefined : normalizeDate(value.endDate),
      focused: asOptionalBoolean(value.focused),
    };
  }

  if (type === "set_routine_mark") {
    const routineId = firstIdField(value, ["routineId", "routine_id", "habitId", "habit_id", "id", "title", "habit", "routine"]);
    const date = normalizeActionDate(value, ["date"]);
    const status = asString(value.status).toLowerCase();
    return routineId && date && (status === "success" || status === "failure")
      ? { type, routineId, date, status }
      : null;
  }

  if (type === "clear_routine_mark") {
    const routineId = firstIdField(value, ["routineId", "routine_id", "habitId", "habit_id", "id", "title", "habit", "routine"]);
    const date = normalizeActionDate(value, ["date"]);
    return routineId && date ? { type, routineId, date } : null;
  }

  if (type === "delete_routine") {
    const id = firstIdField(value, ["id", "routineId", "routine_id", "habitId", "habit_id", "title", "habit", "routine", "name"]);
    return id ? { type, id } : null;
  }

  if (type === "archive_routine" || type === "restore_routine" || type === "permanently_delete_routine") {
    const id = firstIdField(value, ["id", "routineId", "routine_id", "habitId", "habit_id", "title", "habit", "routine", "name"]);
    return id ? { type, id } : null;
  }

  return null;
}

function looksLikeMutationRequest(request: string) {
  if (/add|create|update|edit|delete|remove|complete|archive|restore|execute|\uCD94\uAC00|\uB9CC\uB4E4|\uC0DD\uC131|\uC218\uC815|\uBCC0\uACBD|\uBC14\uAFFF|\uC0AD\uC81C|\uC9C0\uC6CC|\uC81C\uAC70|\uC644\uB8CC|\uBCF4\uAD00|\uBCF5\uC6D0|\uAE30\uB85D|\uC2E4\uD589/i.test(request)) return true;
  return /add|create|update|edit|delete|remove|complete|archive|restore|추가|만들|수정|변경|바꿔|삭제|지워|제거|완료|보관|복원|기록/i.test(request);
}

function isSelectedListEmptyRequest(request: string) {
  return /\b(empty|clear|purge)\b|\uBE44\uC6B0|\uBAA8\uB450|\uC804\uCCB4/i.test(request);
}

function isEmptyBinRequest(request: string, selectedList: AgentSelectedList | null = null) {
  const text = request.toLowerCase();
  if (selectedList === "bin" && isSelectedListEmptyRequest(request)) return true;
  const mentionsBin = /\b(bin|trash|deleted items?)\b|휴지통/.test(text);
  const asksToEmpty = /\b(empty|clear|purge)\b|비우|비워|전부\s*삭제|전체\s*삭제|모두\s*삭제|완전\s*삭제/.test(text);
  const asksToDelete = /\b(delete|remove)\b|삭제|지워|제거/.test(text);
  return mentionsBin && (asksToEmpty || asksToDelete);
}

function isArchiveRequest(request: string) {
  return /\b(archive|archives|storage|saved items?)\b|저장소|보관함|아카이브/.test(request.toLowerCase());
}

function mentionsAllItems(request: string) {
  return /\b(all|every|everything|entire)\b|모두|전체|전부|다\s*(복원|삭제|지워|제거|이동)/.test(request.toLowerCase());
}

function isEmptyArchiveRequest(request: string, selectedList: AgentSelectedList | null = null) {
  const text = request.toLowerCase();
  if (selectedList === "archive" && isSelectedListEmptyRequest(request) && !/\b(restore|recover|unarchive)\b|\uBCF5\uC6D0|\uB418\uB3CC/i.test(request)) return true;
  const asksToEmpty = /\b(empty|clear)\b|비우|비워/.test(text);
  const asksToDelete = /\b(delete|remove|move to bin|move to trash)\b|삭제|지워|제거|휴지통/.test(text);
  return isArchiveRequest(request) && (asksToEmpty || (asksToDelete && mentionsAllItems(request)));
}

function isRestoreArchiveRequest(request: string, selectedList: AgentSelectedList | null = null) {
  if (selectedList === "archive" && mentionsAllItems(request) && /\b(restore|recover|unarchive)\b|\uBCF5\uC6D0|\uB418\uB3CC/i.test(request)) return true;
  return isArchiveRequest(request) && mentionsAllItems(request) && /\b(restore|recover|unarchive)\b|복원|되돌/.test(request.toLowerCase());
}

function buildEmptyBinMessage(request: string, count: number, applied: boolean, requestedKinds: ListKind[]) {
  const isKorean = /[\u3131-\uD79D]/.test(request);
  const scope = listKindItemScope(requestedKinds, isKorean);
  if (count === 0) return isKorean ? `휴지통에 해당 ${scope}이 없습니다.` : `There are no matching ${scope} in the bin.`;
  if (applied) return isKorean ? `휴지통의 ${scope} ${count}개를 영구 삭제했습니다.` : `Permanently deleted ${count} matching ${scope} from the bin.`;
  return isKorean ? `휴지통의 ${scope} ${count}개를 영구 삭제할 수 있습니다.` : `I can permanently delete ${count} matching ${scope} from the bin.`;
}

function buildArchiveMessage(request: string, count: number, applied: boolean, mode: "moveToBin" | "restore", requestedKinds: ListKind[]) {
  const isKorean = /[\u3131-\uD79D]/.test(request);
  const scope = listKindItemScope(requestedKinds, isKorean);
  if (count === 0) return isKorean ? `저장소에 해당 ${scope}이 없습니다.` : `There are no matching ${scope} in the archive.`;
  if (mode === "restore") {
    if (applied) return isKorean ? `저장소의 ${scope} ${count}개를 복원했습니다.` : `Restored ${count} matching archived ${scope}.`;
    return isKorean ? `저장소의 ${scope} ${count}개를 복원할 수 있습니다.` : `I can restore ${count} matching archived ${scope}.`;
  }
  if (applied) return isKorean ? `저장소의 ${scope} ${count}개를 휴지통으로 이동했습니다.` : `Moved ${count} matching archived ${scope} to the bin.`;
  return isKorean ? `저장소의 ${scope} ${count}개를 휴지통으로 이동할 수 있습니다.` : `I can move ${count} matching archived ${scope} to the bin.`;
}

function shouldApplyActionsImmediately(apply: boolean, actions: AgentAction[]) {
  return apply && actions.length > 0;
}

function buildMultiActionReviewMessage(request: string, actionCount: number) {
  return /[\u3131-\uD79D]/.test(request)
    ? `${actionCount}개 변경을 찾았습니다. 제안된 작업을 확인한 뒤 제안 실행을 눌러 적용하세요.`
    : `I found ${actionCount} changes. Review the proposed actions, then press Apply actions to run them.`;
}

function buildAppliedActionsMessage(request: string, actionCount: number) {
  return /[\u3131-\uD79D]/.test(request)
    ? `${actionCount}개 변경을 적용했습니다.`
    : `Applied ${actionCount} change${actionCount === 1 ? "" : "s"}.`;
}

function getRequestedCount(request: string, fallback: number) {
  const digitMatch = request.match(/(\d+)\s*(?:개|가지|items?|habits?|routines?)?/i);
  if (digitMatch) return Math.min(Math.max(Number(digitMatch[1]) || fallback, 1), 10);

  const koreanCounts: Array<[RegExp, number]> = [
    [/한\s*(?:개|가지)?/, 1],
    [/두\s*(?:개|가지)?/, 2],
    [/세\s*(?:개|가지)?/, 3],
    [/네\s*(?:개|가지)?/, 4],
    [/다섯\s*(?:개|가지)?/, 5],
  ];
  return koreanCounts.find(([pattern]) => pattern.test(request))?.[1] ?? fallback;
}

function buildFamousRecommendedHabitActions(request: string): Extract<AgentAction, { type: "add_routine" }>[] {
  const text = request.toLowerCase();
  const asksForHabits = /\b(habits?|routines?)\b|습관|루틴/.test(text);
  const asksToAdd = /\b(add|create|make|put)\b|추가|넣|만들|생성/.test(text);
  const asksForRecommendation = /\b(famous|successful|recommended|recommendations?|celebrities?|well-known)\b|유명|성공한|추천/.test(text);
  if (!asksForHabits || !asksToAdd || !asksForRecommendation) return [];

  const count = getRequestedCount(request, 5);
  const startDate = toLocalDateInputValue();
  const endDate = toLocalDateInputValue(addDays(new Date(), 365));
  const habits = [
    {
      title: "매일 20분 독서하기",
      memo: "워런 버핏, 빌 게이츠처럼 꾸준히 읽고 배운 내용을 짧게 남기기",
    },
    {
      title: "아침 운동하기",
      memo: "버락 오바마, 리처드 브랜슨처럼 하루 초반에 몸을 깨우기",
    },
    {
      title: "10분 명상하기",
      memo: "오프라 윈프리, 스티브 잡스처럼 마음을 정리하고 집중력 높이기",
    },
    {
      title: "감사 일기 쓰기",
      memo: "오프라 윈프리처럼 매일 감사한 일을 기록하며 관점 훈련하기",
    },
    {
      title: "하루 목표 3개 정하기",
      memo: "벤저민 프랭클린, 일론 머스크처럼 중요한 일부터 계획하기",
    },
    {
      title: "잠들기 전 회고하기",
      memo: "피터 드러커식 자기 점검처럼 오늘의 선택과 내일의 개선점을 적기",
    },
    {
      title: "깊은 작업 시간 확보하기",
      memo: "칼 뉴포트가 강조한 것처럼 알림을 끄고 한 가지 중요한 일에 몰입하기",
    },
    {
      title: "새 아이디어 3개 적기",
      memo: "제임스 알투처처럼 창의력을 매일 훈련하기",
    },
    {
      title: "건강한 수면 루틴 지키기",
      memo: "아리아나 허핑턴처럼 회복을 성과의 기반으로 관리하기",
    },
    {
      title: "중요한 사람에게 먼저 연락하기",
      memo: "성공한 리더들이 강조하는 관계 관리 습관을 매일 작게 실천하기",
    },
  ];

  return habits.slice(0, count).map((habit) => ({
    type: "add_routine",
    title: habit.title,
    memo: habit.memo,
    startDate,
    endDate,
  }));
}

function looksLikeAlreadySatisfiedAgentMessage(message: string) {
  return /already|done|completed|no\s+changes?|up[-\s]?to[-\s]?date|nothing\s+to\s+(?:do|change)|이미|완료|되어\s*있|변경할?\s*(?:내용|사항)?\s*없/i.test(
    message,
  );
}

function buildFreshRunRetryPrompt(request: string) {
  return [
    request,
    "",
    "Important: Re-evaluate this as a fresh command against the current provided lists.",
    "The user may have manually changed the database after a previous agent run.",
    "If the current list state still needs the requested change, return the required actions.",
    "Do not answer that it was already done because of any prior execution.",
  ].join("\n");
}

function buildAmbiguousListMessage(request: string) {
  const isKorean = /[\u3131-\uD79D]/.test(request);
  return isKorean
    ? "이 요청이 할일, 목표, 습관 중 어느 리스트에 대한 작업인지 명확하지 않습니다. 예: '할일에 추가', '목표에 추가', '습관에 추가'처럼 리스트를 지정해 주세요."
    : "I cannot tell whether this should change tasks, goals, or habits. Please specify the list, such as tasks, goals, or habits.";
}

function readClarificationSection(request: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nextLabel = "(?:Original request|Clarification question|Clarification answer|Combined command|Additional clarification)";
  const match = request.match(new RegExp(`${escapedLabel}:\\s*([\\s\\S]*?)(?=\\n${nextLabel}:|$)`, "i"));
  return match?.[1]?.trim() ?? "";
}

function extractAddTitle(request: string) {
  const text = request.trim();
  const koreanListFirstMatch = text.match(/(?:\uD560\s*\uC77C|\uD0DC\uC2A4\uD06C|\uC791\uC5C5)\uC5D0\s+(.+?)(?:\uC744|\uB97C)?\s*(?:\uCD94\uAC00|\uB9CC\uB4E4|\uC0DD\uC131)/);
  if (koreanListFirstMatch?.[1]) return koreanListFirstMatch[1].trim();

  const koreanMatch = text.match(/^(.+?)(?:\uC744|\uB97C)?\s*(?:\uCD94\uAC00|\uB9CC\uB4E4|\uC0DD\uC131)/);
  if (koreanMatch?.[1]) return koreanMatch[1].trim();

  const englishMatch = text.match(/(?:add|create|make)\s+(.+?)(?:\s+(?:to|as|in)\s+(?:tasks?|todos?|goals?|habits?|routines?))?\.?$/i);
  return englishMatch?.[1]?.trim() ?? "";
}

function extractDeleteTitle(request: string) {
  const text = request.trim();
  const koreanListFirstMatch = text.match(
    /(?:\uD560\s*\uC77C|\uD0DC\uC2A4\uD06C|\uC791\uC5C5)(?:\uC5D0\uC11C|\uC5D0)?\s*(.+?)(?:\uC744|\uB97C)?\s*(?:\uC0AD\uC81C|\uC9C0\uC6CC|\uC81C\uAC70)/,
  );
  if (koreanListFirstMatch?.[1]) return koreanListFirstMatch[1].trim();

  const strippedKorean = text
    .replace(/^(?:.*?)(?:\uD560\s*\uC77C|\uD0DC\uC2A4\uD06C|\uC791\uC5C5)(?:\uC5D0\uC11C|\uC5D0)?\s*/, "")
    .replace(/\s*(?:\uC744|\uB97C)?\s*(?:\uC0AD\uC81C|\uC9C0\uC6CC|\uC81C\uAC70)(?:\uD574|\uD574\uC918|\uD574\s*\uC8FC\uC138\uC694|\uD574\uC904\uB798|\uD574\uB77C)?[.!?\s]*$/i, "")
    .trim();
  if (strippedKorean && strippedKorean !== text) return strippedKorean;

  const koreanMatch = text.match(/^(.+?)(?:\uC744|\uB97C)?\s*(?:\uC0AD\uC81C|\uC9C0\uC6CC|\uC81C\uAC70)/);
  if (koreanMatch?.[1]) return koreanMatch[1].trim();

  const englishMatch = text.match(/(?:delete|remove)\s+(.+?)(?:\s+from\s+(?:tasks?|todos?|goals?|habits?|routines?))?\.?$/i);
  return englishMatch?.[1]?.trim() ?? "";
}

function buildExplicitDeleteAction(
  request: string,
  context: Awaited<ReturnType<typeof readAgentListContext>>,
  defaultKind: ListKind | null = null,
): AgentAction[] {
  const requestedKind = getRequestedListKind(request) ?? defaultKind;
  if (!requestedKind || !/\b(delete|remove)\b|\uC0AD\uC81C|\uC9C0\uC6CC|\uC81C\uAC70/.test(request)) return [];
  const title = extractDeleteTitle(request);
  if (!title) return [];

  if (requestedKind === "todo") {
    const id = findClosestItemId(context.todos, title, 0.25);
    return id ? [{ type: "delete_todo", id }] : [];
  }

  if (requestedKind === "goal") {
    const id = findClosestItemId(context.goals, title, 0.25);
    return id ? [{ type: "delete_goal", id }] : [];
  }

  const id = findClosestItemId(context.routines, title, 0.25);
  return id ? [{ type: "delete_routine", id }] : [];
}

function isTodoListOnlyClarification(request: string) {
  const text = normalizeFuzzyText(request);
  return text === normalizeFuzzyText("\uD560\uC77C\uC5D0") || text === normalizeFuzzyText("\uD560\uC77C\uC5D0\uC11C") || text === "todo" || text === "todos" || text === "tasks";
}

function buildClarifiedTodoDeleteAction(request: string, context: Awaited<ReturnType<typeof readAgentListContext>>): AgentAction[] {
  const originalRequest = readClarificationSection(request, "Original request");
  const clarificationAnswer = readClarificationSection(request, "Clarification answer");
  const combinedCommand = readClarificationSection(request, "Combined command");
  if (!originalRequest || !isTodoListOnlyClarification(clarificationAnswer || combinedCommand)) return [];

  const title = extractDeleteTitle(originalRequest) || originalRequest.trim();
  const id = findClosestItemId(context.todos, title, 0.25);
  return id ? [{ type: "delete_todo", id }] : [];
}

function buildItemReferenceClarification(request: string, context: Awaited<ReturnType<typeof readAgentListContext>>) {
  if (looksLikeMutationRequest(request) || getRequestedListKinds(request).length > 0) return null;
  const todoId = findClosestItemId(context.todos, request, 0.45);
  if (!todoId) return null;

  return {
    message: "\uD560\uC77C\uC5D0\uC11C \uC0AD\uC81C\uD560\uAE4C\uC694?",
    actions: [],
    applied: false,
    targetList: "unknown" as const,
    clarification: {
      originalPrompt: request,
      question: "\uD560\uC77C\uC5D0\uC11C \uC0AD\uC81C\uD560\uAE4C\uC694?",
    },
    data: context,
  };
}

function buildClarifiedAddTodoAction(request: string): AgentAction[] {
  const originalRequest = readClarificationSection(request, "Original request");
  const clarificationAnswer = readClarificationSection(request, "Clarification answer");
  const combinedCommand = readClarificationSection(request, "Combined command");
  if (!originalRequest || getRequestedListKind(clarificationAnswer || combinedCommand) !== "todo" || !looksLikeMutationRequest(originalRequest)) return [];

  const title = extractAddTitle(combinedCommand) || extractAddTitle(originalRequest);
  return title ? [{ type: "add_todo", title, targetDate: toLocalDateInputValue(), category: "" }] : [];
}

function resolveActionItemIds(
  actions: AgentAction[],
  context: Awaited<ReturnType<typeof readAgentListContext>>,
  targetList: AgentTargetList = "unknown",
) {
  return actions.map((action) => {
    if ("id" in action) {
      if (action.type.endsWith("_todo")) {
        const source: Array<{ id: string; title: string }> =
          action.type === "restore_todo" || targetList === "archive"
            ? context.archive.todos
            : action.type === "permanently_delete_todo" || targetList === "bin"
              ? context.bin.todos
              : context.todos;
        const id = source.some((item) => item.id === action.id) ? action.id : findClosestItemId(source, action.id);
        return id ? { ...action, id } : action;
      }

      if (action.type.endsWith("_goal")) {
        const source =
          action.type === "restore_goal" || targetList === "archive"
            ? context.archive.goals
            : action.type === "permanently_delete_goal" || targetList === "bin"
              ? context.bin.goals
              : context.goals;
        const id = source.some((item) => item.id === action.id) ? action.id : findClosestItemId(source, action.id);
        return id ? { ...action, id } : action;
      }

      if (action.type.endsWith("_routine")) {
        const source: Array<{ id: string; title: string }> =
          action.type === "restore_routine" || targetList === "archive"
            ? context.archive.routines
            : action.type === "permanently_delete_routine" || targetList === "bin"
              ? context.bin.routines
              : context.routines;
        const id = source.some((item) => item.id === action.id) ? action.id : findClosestItemId(source, action.id);
        return id ? { ...action, id } : action;
      }
    }

    if ("goalId" in action) {
      const goalId = context.goals.some((goal) => goal.id === action.goalId)
        ? action.goalId
        : findClosestItemId(context.goals, action.goalId);
      return goalId ? { ...action, goalId } : action;
    }

    if ("routineId" in action) {
      const routineId = context.routines.some((routine) => routine.id === action.routineId)
        ? action.routineId
        : findClosestItemId(context.routines, action.routineId);
      return routineId ? { ...action, routineId } : action;
    }

    return action;
  });
}

function parseAgentResponse(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const parsed = JSON.parse(fenced || trimmed) as unknown;
  if (!isRecord(parsed)) throw new Error("Agent returned an invalid response");

  const actions = Array.isArray(parsed.actions)
    ? parsed.actions.map(coerceAction).filter((action): action is AgentAction => Boolean(action)).slice(0, 50)
    : [];
  const targetList = parsed.targetList === undefined ? inferTargetListFromActions(actions) : normalizeTargetList(parsed.targetList);

  return {
    message: asString(parsed.message) || "I reviewed your lists.",
    actions,
    targetList,
    clarificationQuestion: asOptionalString(parsed.clarificationQuestion),
  };
}

export async function readAgentListContext() {
  const today = toLocalDateInputValue();
  const [
    goals,
    todos,
    routines,
    archivedGoals,
    archivedTodos,
    archivedRoutines,
    deletedGoals,
    deletedTodos,
    deletedRoutines,
  ] = await Promise.all([
    readGoals(),
    readTodos(),
    readRoutines(),
    readArchivedGoals(),
    readArchivedTodos(),
    readArchivedRoutines(),
    readDeletedGoals(),
    readDeletedTodos(),
    readDeletedRoutines(),
  ]);
  const summarizeRoutines = (
    items: Array<{
      id: string;
      title: string;
      memo: string;
      startDate: string;
      endDate: string;
      createdAt: number;
      archivedAt?: number;
      deletedAt?: number;
    }>,
  ) =>
    items.map((routine) => ({
      id: routine.id,
      title: routine.title,
      memo: routine.memo,
      startDate: routine.startDate,
      endDate: routine.endDate,
      createdAt: routine.createdAt,
      archivedAt: routine.archivedAt,
      deletedAt: routine.deletedAt,
    }));

  return {
    goals,
    todos: todos.map((todo) => {
      const daysOverdue = todo.completed ? 0 : getTaskOverdueDays(todo.targetDate, today);
      return {
        ...todo,
        timing: {
          isOverdue: daysOverdue > 0,
          daysOverdue,
        },
      };
    }),
    routines: routines.map((routine) => summarizeRoutineForAgent(routine, today)),
    archive: {
      goals: archivedGoals,
      todos: archivedTodos,
      routines: summarizeRoutines(archivedRoutines),
    },
    bin: {
      goals: deletedGoals,
      todos: deletedTodos,
      routines: summarizeRoutines(deletedRoutines),
    },
  };
}

function shouldIncludeListKind(kind: ListKind, requestedKinds: ListKind[]) {
  return requestedKinds.length === 0 || requestedKinds.includes(kind);
}

function buildEmptyBinActions(context: Awaited<ReturnType<typeof readAgentListContext>>, requestedKinds: ListKind[]): AgentAction[] {
  return [
    ...(shouldIncludeListKind("todo", requestedKinds) ? context.bin.todos.map((todo) => ({ type: "permanently_delete_todo" as const, id: todo.id })) : []),
    ...(shouldIncludeListKind("goal", requestedKinds) ? context.bin.goals.map((goal) => ({ type: "permanently_delete_goal" as const, id: goal.id })) : []),
    ...(shouldIncludeListKind("routine", requestedKinds)
      ? context.bin.routines.map((routine) => ({ type: "permanently_delete_routine" as const, id: routine.id }))
      : []),
  ];
}

function buildArchiveActions(context: Awaited<ReturnType<typeof readAgentListContext>>, mode: "moveToBin" | "restore", requestedKinds: ListKind[]): AgentAction[] {
  if (mode === "restore") {
    return [
      ...(shouldIncludeListKind("todo", requestedKinds) ? context.archive.todos.map((todo) => ({ type: "restore_todo" as const, id: todo.id })) : []),
      ...(shouldIncludeListKind("goal", requestedKinds) ? context.archive.goals.map((goal) => ({ type: "restore_goal" as const, id: goal.id })) : []),
      ...(shouldIncludeListKind("routine", requestedKinds) ? context.archive.routines.map((routine) => ({ type: "restore_routine" as const, id: routine.id })) : []),
    ];
  }

  return [
    ...(shouldIncludeListKind("todo", requestedKinds) ? context.archive.todos.map((todo) => ({ type: "delete_todo" as const, id: todo.id })) : []),
    ...(shouldIncludeListKind("goal", requestedKinds) ? context.archive.goals.map((goal) => ({ type: "delete_goal" as const, id: goal.id })) : []),
    ...(shouldIncludeListKind("routine", requestedKinds) ? context.archive.routines.map((routine) => ({ type: "delete_routine" as const, id: routine.id })) : []),
  ];
}

function looksLikeScheduleChangeRequest(request: string) {
  return /\b(schedule|reschedule|postpone|date|due|deadline|target\s*date|move|change|set)\b|\uC77C\uC815|\uB0A0\uC9DC|\uBAA9\uD45C\uC77C|\uB9C8\uAC10|\uAE30\uD55C|\uBBF8\uB904|\uBBF8\uB8E8|\uBCC0\uACBD|\uBC14\uAFFF/i.test(
    request,
  );
}

function isBulkScheduleScopeRequest(request: string) {
  return /\b(all|every|each|entire)\b|\uBAA8\uB4E0|\uC804\uCCB4|\uC804\uBD80|\uBAA8\uB450|\uB2E4\s*(?:\uBC14\uAFFF|\uBCC0\uACBD|\uBBF8\uB904|\uBBF8\uB8E8)/i.test(
    request,
  );
}

function stripKoreanParticles(value: string) {
  return value.replace(/(?:\uC758|\uC744|\uB97C|\uC740|\uB294|\uC774|\uAC00|\uC5D0|\uC5D0\uC11C)$/u, "").trim();
}

function extractRequestedTodoCategory(request: string) {
  const koreanMatch = request.match(/([^\s,.;:!?]+)\s*\uCE74\uD14C\uACE0\uB9AC/u);
  if (koreanMatch?.[1]) return stripKoreanParticles(koreanMatch[1]);

  const englishMatch = request.match(/\bcategory\s+["']?([^"',.;:!?]+)|\b["']?([^"',.;:!?]+)["']?\s+category\b/i);
  const category = englishMatch?.[1] ?? englishMatch?.[2] ?? "";
  return category.trim();
}

function extractScheduleDateFromRequest(request: string) {
  const directDate = request.match(/\d{4}[-./]\d{1,2}[-./]\d{1,2}/)?.[0];
  if (directDate) return normalizeDate(directDate);

  const text = request.toLowerCase();
  if (/today|\uC624\uB298/.test(text)) return toLocalDateInputValue();
  if (/tomorrow|\uB0B4\uC77C/.test(text)) return toLocalDateInputValue(addDays(new Date(), 1));
  if (/next\s*week|\uB2E4\uC74C\s*\uC8FC/.test(text)) return toLocalDateInputValue(addDays(new Date(), 7));

  return "";
}

function getBulkScheduleTodoTargetDate(actions: AgentAction[], request: string) {
  return (
    actions.find((action): action is Extract<AgentAction, { type: "update_todo" }> => action.type === "update_todo" && Boolean(action.targetDate))
      ?.targetDate ?? extractScheduleDateFromRequest(request)
  );
}

function getBulkScheduleGoalPatch(actions: AgentAction[], request: string) {
  const updateAction = actions.find((action): action is Extract<AgentAction, { type: "update_goal" }> => action.type === "update_goal");
  const deadline = updateAction?.deadline ?? extractScheduleDateFromRequest(request);
  if (!deadline) return {};
  const changesStartDate = /\b(start\s*date|starts?|begin|begins?)\b|\uC2DC\uC791\uC77C|\uC2DC\uC791/i.test(request);
  return changesStartDate ? { createdAt: asOptionalTimestamp(deadline) } : { deadline };
}

function getBulkScheduleRoutinePatch(actions: AgentAction[], request: string) {
  const updateAction = actions.find((action): action is Extract<AgentAction, { type: "update_routine" }> => action.type === "update_routine");
  const date = updateAction?.endDate ?? updateAction?.startDate ?? extractScheduleDateFromRequest(request);
  if (!date) return {};

  const changesStartDate = /\b(start\s*date|starts?|begin|begins?)\b|\uC2DC\uC791\uC77C|\uC2DC\uC791/i.test(request);
  const changesEndDate = /\b(end\s*date|ends?|deadline|due)\b|\uC885\uB8CC\uC77C|\uC885\uB8CC|\uB9C8\uAC10|\uAE30\uD55C/i.test(request);
  if (changesStartDate && !changesEndDate) return { startDate: date };
  return { endDate: date };
}

function mergeActionsByTypeAndId(actions: AgentAction[]) {
  const merged = new Map<string, AgentAction>();
  for (const action of actions) {
    const id = "id" in action ? action.id : "goalId" in action ? action.goalId : action.type;
    const key = `${action.type}:${id}`;
    merged.set(key, { ...merged.get(key), ...action } as AgentAction);
  }
  return [...merged.values()];
}

function completeBulkScheduleActions(actions: AgentAction[], request: string, context: AgentListContext, targetList: AgentTargetList) {
  if (!looksLikeScheduleChangeRequest(request) || !isBulkScheduleScopeRequest(request)) return actions;

  if (targetList === "todo") {
    const targetDate = getBulkScheduleTodoTargetDate(actions, request);
    if (!targetDate) return actions;

    const requestedCategory = extractRequestedTodoCategory(request);
    const normalizedCategory = normalizeFuzzyText(requestedCategory);
    const matchingTodos = context.todos.filter((todo) => {
      if (!normalizedCategory) return true;
      return normalizeFuzzyText(todo.category) === normalizedCategory;
    });
    const completedActions: AgentAction[] = matchingTodos.map((todo) => ({ type: "update_todo", id: todo.id, targetDate }));
    return mergeActionsByTypeAndId([...actions, ...completedActions]);
  }

  if (targetList === "goal") {
    const patch = getBulkScheduleGoalPatch(actions, request);
    if (patch.deadline === undefined && patch.createdAt === undefined) return actions;
    const completedActions: AgentAction[] = context.goals.map((goal) => ({ type: "update_goal", id: goal.id, ...patch }));
    return mergeActionsByTypeAndId([...actions, ...completedActions]);
  }

  if (targetList === "routine") {
    const patch = getBulkScheduleRoutinePatch(actions, request);
    if (patch.startDate === undefined && patch.endDate === undefined) return actions;
    const completedActions: AgentAction[] = context.routines.map((routine) => ({ type: "update_routine", id: routine.id, ...patch }));
    return mergeActionsByTypeAndId([...actions, ...completedActions]);
  }

  return actions;
}

type AgentRecordQuery = {
  collection: "todo" | "goal" | "routine" | "goal_entry" | "routine_mark" | "archive" | "bin";
  recordType: ListKind | null;
  search: string | null;
  status: "all" | "open" | "completed" | "success" | "failure" | "unmarked";
  focused: boolean | null;
  overdue: boolean | null;
  dateFrom: string | null;
  dateTo: string | null;
  sortBy: "relevance" | "title" | "created_at" | "target_date" | "deadline" | "days_overdue" | "progress" | "date";
  direction: "asc" | "desc";
  limit: number | null;
};

const QUERY_RECORDS_TOOL = {
  type: "function",
  name: "query_records",
  description:
    "Query the user's current tasks, goals, habits, goal progress entries, habit marks, archive, or bin. Combine filters, sorting, and limit exactly as requested. Always use this before making claims about stored records or proposing changes to existing records.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      collection: {
        type: "string",
        enum: ["todo", "goal", "routine", "goal_entry", "routine_mark", "archive", "bin"],
      },
      recordType: {
        type: ["string", "null"],
        enum: ["todo", "goal", "routine", null],
        description: "Optional item type filter, especially for archive or bin queries.",
      },
      search: { type: ["string", "null"], description: "Case-insensitive text to find in titles, memos, or categories." },
      status: {
        type: "string",
        enum: ["all", "open", "completed", "success", "failure", "unmarked"],
      },
      focused: { type: ["boolean", "null"], description: "true means bookmark/important mark is enabled." },
      overdue: { type: ["boolean", "null"], description: "Filter tasks by computed overdue state." },
      dateFrom: { type: ["string", "null"], description: "Inclusive YYYY-MM-DD lower date bound." },
      dateTo: { type: ["string", "null"], description: "Inclusive YYYY-MM-DD upper date bound." },
      sortBy: {
        type: "string",
        enum: ["relevance", "title", "created_at", "target_date", "deadline", "days_overdue", "progress", "date"],
      },
      direction: { type: "string", enum: ["asc", "desc"] },
      limit: { type: ["integer", "null"], minimum: 1, maximum: 100 },
    },
    required: ["collection", "recordType", "search", "status", "focused", "overdue", "dateFrom", "dateTo", "sortBy", "direction", "limit"],
    additionalProperties: false,
  },
} as const;

function parseAgentRecordQuery(value: unknown): AgentRecordQuery | null {
  if (!isRecord(value)) return null;
  const collection = asString(value.collection) as AgentRecordQuery["collection"];
  const status = asString(value.status) as AgentRecordQuery["status"];
  const sortBy = asString(value.sortBy) as AgentRecordQuery["sortBy"];
  const direction = asString(value.direction) as AgentRecordQuery["direction"];
  if (!QUERY_RECORDS_TOOL.parameters.properties.collection.enum.includes(collection)) return null;
  if (!QUERY_RECORDS_TOOL.parameters.properties.status.enum.includes(status)) return null;
  if (!QUERY_RECORDS_TOOL.parameters.properties.sortBy.enum.includes(sortBy)) return null;
  if (!QUERY_RECORDS_TOOL.parameters.properties.direction.enum.includes(direction)) return null;

  return {
    collection,
    recordType: value.recordType === "todo" || value.recordType === "goal" || value.recordType === "routine" ? value.recordType : null,
    search: typeof value.search === "string" ? value.search.trim() : null,
    status,
    focused: typeof value.focused === "boolean" ? value.focused : null,
    overdue: typeof value.overdue === "boolean" ? value.overdue : null,
    dateFrom: normalizeDate(value.dateFrom) || null,
    dateTo: normalizeDate(value.dateTo) || null,
    sortBy,
    direction,
    limit: typeof value.limit === "number" && Number.isInteger(value.limit) ? Math.max(1, Math.min(100, value.limit)) : null,
  };
}

function queryAgentRecords(query: AgentRecordQuery, context: AgentListContext) {
  const withType = (recordType: ListKind, item: object) => ({ recordType, ...item });
  let records: Array<Record<string, unknown>>;

  if (query.collection === "todo") records = context.todos.map((item) => withType("todo", item));
  else if (query.collection === "goal") records = context.goals.map((item) => withType("goal", item));
  else if (query.collection === "routine") records = context.routines.map((item) => withType("routine", item));
  else if (query.collection === "goal_entry") {
    records = context.goals.flatMap((goal) =>
      goal.entries.map((entry) => ({
        recordType: "goal_entry",
        goalId: goal.id,
        goalTitle: goal.title,
        ...entry,
        date: toLocalDateInputValue(new Date(entry.createdAt)),
      })),
    );
  } else if (query.collection === "routine_mark") {
    records = context.routines.flatMap((routine) =>
      routine.marks.map((mark) => ({ recordType: "routine_mark", routineId: routine.id, routineTitle: routine.title, ...mark })),
    );
  } else {
    const source = query.collection === "archive" ? context.archive : context.bin;
    records = [
      ...source.todos.map((item) => withType("todo", item)),
      ...source.goals.map((item) => withType("goal", item)),
      ...source.routines.map((item) => withType("routine", item)),
    ];
  }

  records = records.filter((record) => {
    if (query.recordType && record.recordType !== query.recordType) return false;
    if (query.search) {
      const haystack = [record.title, record.goalTitle, record.routineTitle, record.memo, record.category]
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .toLocaleLowerCase();
      if (!haystack.includes(query.search.toLocaleLowerCase())) return false;
    }
    if (query.status === "open" && record.completed !== false) return false;
    if (query.status === "completed" && record.completed !== true) return false;
    if (query.status === "success" || query.status === "failure") {
      const progress = isRecord(record.progress) ? record.progress : null;
      if (record.status !== query.status && progress?.todayStatus !== query.status) return false;
    }
    if (query.status === "unmarked") {
      const progress = isRecord(record.progress) ? record.progress : null;
      if (progress?.todayStatus !== "unmarked") return false;
    }
    if (query.focused !== null && record.focused !== query.focused) return false;
    if (query.overdue !== null) {
      const timing = isRecord(record.timing) ? record.timing : null;
      if (timing?.isOverdue !== query.overdue) return false;
    }
    const recordDate = [record.targetDate, record.deadline, record.date, record.startDate]
      .find((value): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
    if (query.dateFrom && (!recordDate || recordDate < query.dateFrom)) return false;
    if (query.dateTo && (!recordDate || recordDate > query.dateTo)) return false;
    return true;
  });

  const sortValue = (record: Record<string, unknown>) => {
    if (query.sortBy === "title") return String(record.title ?? record.goalTitle ?? record.routineTitle ?? "").toLocaleLowerCase();
    if (query.sortBy === "created_at") return Number(record.createdAt ?? 0);
    if (query.sortBy === "target_date") return String(record.targetDate ?? "9999-12-31");
    if (query.sortBy === "deadline") return String(record.deadline ?? "9999-12-31");
    if (query.sortBy === "date") return String(record.date ?? record.targetDate ?? record.deadline ?? "9999-12-31");
    if (query.sortBy === "days_overdue") {
      return isRecord(record.timing) ? Number(record.timing.daysOverdue ?? 0) : 0;
    }
    if (query.sortBy === "progress") {
      if (isRecord(record.progress)) return Number(record.progress.successRateAmongMarked ?? 0);
      if (typeof record.target === "number" && Array.isArray(record.entries)) {
        const latest = record.entries.at(-1);
        return isRecord(latest) && typeof latest.value === "number" && record.target !== 0 ? (latest.value / record.target) * 100 : 0;
      }
    }
    return 0;
  };
  if (query.sortBy !== "relevance") {
    const multiplier = query.direction === "asc" ? 1 : -1;
    records.sort((left, right) => {
      const leftValue = sortValue(left);
      const rightValue = sortValue(right);
      return (typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue))) * multiplier;
    });
  }

  const total = records.length;
  const limit = query.limit ?? 50;
  return { total, returned: Math.min(total, limit), records: records.slice(0, limit) };
}

async function callOpenAiCompatibleChat(input: {
  apiKey: string;
  model: string;
  prompt: string;
  context: unknown;
  selectedList: AgentSelectedList | null;
  conversationHistory: AgentConversationMessage[];
}) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You manage a personal planning app. Return only JSON with keys targetList, message, actions, and optionally clarificationQuestion. " +
            "Treat every request as a fresh independent command. Do not assume a previous agent run is still valid, and do not refuse because something was done earlier. " +
            "The user may have manually changed the database after your last run; the provided lists are the only source of truth. If the current lists show that the requested change is needed, return the action even if the same request may have been executed before. " +
            "Only return no actions for an already-satisfied request when the current provided lists already match the requested final state. " +
            "targetList must be one of todo, goal, routine, archive, bin, or unknown. Choose targetList before choosing actions. " +
            "A selectedList value is provided. If the user does not clearly name another list, selectedList is the target list. Do not ask which list to use when selectedList is present. " +
            "A recent conversationHistory may be provided. Use it only to interpret the current request when it is an explicit follow-up, answer, or clarification to your prior question. " +
            "If the current request is a short answer to a clarification question, combine it with the earlier user request and proceed with the resolved intent. " +
            "Do not let history override the current database lists; the provided current lists are the source of truth for ids, status, and whether work is already done. " +
            "If the user's request is in Korean, write the user-facing message and clarificationQuestion in Korean. If the request is in English, write them in English. " +
            "If selectedList is goal, use only goal actions by default; if todo, use only todo actions; if routine, use only routine actions; if archive, use only archive-scoped actions; if bin, use only permanent bin cleanup actions. " +
            "A clear user mention of another list overrides selectedList. If the user clearly names Tasks/todos, Goals, Habits/routines, archive/storage, or bin/trash, follow that named list instead. " +
            "Actions must be an array of allowed action objects for that exact targetList. Use existing ids for updates/deletes. " +
            "For multi-step requests, decompose the request into one action per concrete change, mention that the user should review the proposed actions before applying them, and never claim changes were applied unless the app reports applied true. " +
            "Schedule changes for multiple items are allowed and expected. When the user asks to change dates for several items in the same list, return one update action per item instead of asking them to run commands one at a time. " +
            "For multiple task schedule changes, return separate update_todo actions with id and targetDate. For multiple goal schedule changes, return separate update_goal actions with id and deadline, or createdAt only when the user clearly asks to change the start date. For multiple habit schedule changes, return separate update_routine actions with id, startDate, and/or endDate. " +
            "When a command says to move every matching item, all overdue items, all items due this week, or all selected-list items to one date, identify every matching item from the provided lists and include a separate update action for each one. " +
            "If the user provides a list of item/date pairs, map each named item to the closest existing item in the target list and return all corresponding update actions. " +
            "If a request combines independent changes across different list categories, prefer asking one clarification question over guessing. " +
            "If required details are missing or uncertain, including the target list, the exact existing item, or whether the user wants tasks/goals/habits, set targetList to unknown, return no actions, and ask one concise clarification question in both message and clarificationQuestion. " +
            "If the user names an existing item with a typo or near match, choose the closest existing item title from the provided lists and use its id instead of asking for clarification. " +
            "In the user-facing message, refer to items by their titles or names, not by ids or item numbers. " +
            "Allowed types: add_todo, update_todo, delete_todo, archive_todo, restore_todo, permanently_delete_todo, " +
            "add_goal, update_goal, delete_goal, archive_goal, restore_goal, permanently_delete_goal, " +
            "add_goal_entry, update_goal_entry, delete_goal_entry, " +
            "add_routine, update_routine, delete_routine, archive_routine, restore_routine, permanently_delete_routine. " +
            "For a task/todo add request, return {\"type\":\"add_todo\",\"title\":\"...\",\"targetDate\":\"YYYY-MM-DD\",\"category\":\"...\"}. If the user did not specify a date for a new task/todo, use today's date. " +
            "Each todo has a focused boolean. focused=true means its bookmark/focus ribbon (also called the important mark) is checked; focused=false means it is not bookmarked. When the user asks for bookmarked, starred, pinned, focused, important, 책갈피, 북마크, 즐겨찾기, 집중 표시, 중요, 중요 마크, 중요 표시, or 중요 체크 tasks, include only todos whose focused value is true. Do not treat completed as the bookmark state. " +
            "Each active todo also has timing.isOverdue and timing.daysOverdue, calculated relative to today. A task is overdue only when it is incomplete and its targetDate is earlier than today; tasks due today, future tasks, completed tasks, and tasks without a targetDate are not overdue. When the user asks for overdue, delayed, late, past-due, 지연, 연체, 늦은, 밀린, 기한 초과, or 마감이 지난 tasks, include only tasks whose timing.isOverdue is true and report timing.daysOverdue when relevant. " +
            "When the user asks for the single most overdue task using expressions such as most overdue, longest delayed, 가장 늦은, 제일 늦은, 가장 오래 지연된, or 최장 지연, return only the one incomplete task with the greatest timing.daysOverdue. Do not return the full overdue list. " +
            "For a habit/routine add request, return add_routine actions with title, memo, startDate, and endDate. If the user did not specify dates, use today as startDate and one year after today as endDate; do not merely say you will add habits. " +
            "Each active routine includes marks and progress. A mark status of success means achieved on that date, failure means explicitly not achieved, and no mark means unrecorded rather than failure. progress.todayStatus is success, failure, unmarked, or not_scheduled. progress.successCount is the achievement count through today, and successRateAmongMarked excludes unrecorded days. Use these fields when answering questions about habit completion, counts, or rates. " +
            "When the user asks to add several recommended habits, famous people's habits, or successful people's habits, create that many add_routine actions with practical habit titles and short memo explanations. " +
            "For adding a new item to the Goals list, always use add_goal with title/memo/target/unit/deadline; never use add_goal_entry for that. " +
            "Use add_goal_entry, update_goal_entry, or delete_goal_entry only when the user explicitly asks to add/update/delete a progress record, record, entry, log, value, amount, 기록, 진행, 진척, 달성량, 실적, 수치, or 값 for an existing goal. " +
            "If the user says 목표에 ... 추가, 목표 목록에 ... 추가, add ... to goals, or add a goal, this means add_goal unless progress record wording is explicit. " +
            "List selection is strict: if the user names Tasks/todos/할일/태스크/작업, targetList must be todo and only use *_todo actions; if they name Goals/목표, targetList must be goal and only use *_goal or *_goal_entry actions; if they name Habits/routines/습관/루틴, targetList must be routine and only use *_routine actions. " +
            "If the user request is ambiguous about whether an item belongs to tasks, goals, or habits, set targetList to unknown, return no actions, and ask which list to use. " +
            "If the user names more than one list in one mutation request, set targetList to unknown, return no actions, and ask them to run one list at a time. " +
            "If the user asks to send/move an active item to archive/storage/저장소/보관함/아카이브, targetList must be archive and use archive_todo, archive_goal, or archive_routine with the active item's id. " +
            "If the user asks about archive/storage/saved items/저장소/보관함/아카이브, targetList must be archive. For a single named archived item, use only that item's id. For archived items, use restore_todo/restore_goal/restore_routine to restore them, or delete_todo/delete_goal/delete_routine to move them from archive to bin. Only affect every archived item when the user explicitly says all/every/entire/모두/전체/전부/다 or asks to empty/clear the archive. " +
            "When the user asks to restore/delete/empty all archive or bin items and also names a category such as tasks/todos/할일, goals/목표, or habits/routines/습관/루틴, only return actions for that named category. Do not affect other categories. " +
            "If the user asks to empty/clear/purge the bin/trash or 휴지통, targetList must be bin and actions must only be permanently_delete_todo, permanently_delete_goal, or permanently_delete_routine for matching items already in bin. " +
            "Ordinary delete/remove/delete habits/delete tasks/delete goals requests affect only active list items and must use delete_todo, delete_goal, or delete_routine. Do not include permanently_delete_* unless the user explicitly says bin/trash/휴지통. " +
            "Never mix active-list delete_* actions with bin permanently_delete_* actions in one response. " +
            "Do not create a goal when the request says task/tasks/todo/todos/할일. Do not create a task when the request says goal/goals/목표. " +
            "For ordinary delete/remove requests, use delete_todo, delete_goal, or delete_routine to move items to bin. " +
            "You may use id, todoId, goalId, routineId, taskId, or habitId fields, but ids must come from the provided lists. " +
            "For goal start date changes, use update_goal with createdAt as YYYY-MM-DD. For goal deadline changes, use deadline as YYYY-MM-DD. " +
            "For goal progress records, use goalId plus entryId for updates/deletes, and date or createdAt as YYYY-MM-DD when a record date is specified. " +
            "Use restore_* only for archive/bin items and permanently_delete_* only for bin items. " +
            "If the user says due date or deadline, put that date in targetDate. Use today's date when the user says today. " +
            "Use YYYY-MM-DD dates. If the user asks only for analysis, return an empty actions array and do not claim changes were applied.",
        },
        {
          role: "user",
          content: JSON.stringify({
            today: new Date().toISOString().slice(0, 10),
            currentListsReadAt: new Date().toISOString(),
            executionPolicy:
              "Treat the current request as fresh for database state, but use conversationHistory to resolve direct follow-up answers to prior clarification questions. Use only current lists to decide ids and whether actions are needed. If request does not name a list and history does not resolve it, use selectedList.",
            selectedList: input.selectedList,
            conversationHistory: input.conversationHistory,
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

type ResponsesApiItem = {
  type?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: Array<{ type?: string; text?: string }>;
  [key: string]: unknown;
};

type ResponsesApiResult = {
  id?: string;
  output?: ResponsesApiItem[];
  error?: { message?: string };
};

function getResponsesOutputText(data: ResponsesApiResult) {
  return (data.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text ?? "")
    .join("");
}

async function callOpenAiResponsesAgent(input: {
  apiKey: string;
  model: string;
  prompt: string;
  context: AgentListContext;
  selectedList: AgentSelectedList | null;
  conversationHistory: AgentConversationMessage[];
}) {
  const instructions =
    "You are the conversational agent for a personal planning app. Understand natural language compositionally instead of matching fixed phrases. " +
    "Return only a JSON object with targetList, message, actions, and optional clarificationQuestion. targetList is todo, goal, routine, archive, bin, or unknown. " +
    "Use query_records before answering any question about stored records or before changing an existing record. Combine every requested filter, sort, direction, and count in one query when possible. " +
    "For comparisons or relationship analysis across record types, call query_records once for each relevant collection, retain all returned results, and compare their titles, memos, dates, categories, and progress before answering. " +
    "Examples: 'three most overdue tasks' means collection=todo, status=open, overdue=true, sortBy=days_overdue, direction=desc, limit=3. 'important tasks due this week' means focused=true plus the requested date range. Never silently replace a requested count with one. " +
    "The selected list is the default only when the user does not name a list. Use tool-returned ids for updates and deletes. Treat focused=true as bookmark/important mark. Treat timing.isOverdue and timing.daysOverdue as authoritative. " +
    "Allowed actions are add_todo, update_todo, delete_todo, archive_todo, restore_todo, permanently_delete_todo, add_goal, update_goal, delete_goal, archive_goal, restore_goal, permanently_delete_goal, add_goal_entry, update_goal_entry, delete_goal_entry, add_routine, update_routine, delete_routine, archive_routine, restore_routine, permanently_delete_routine, set_routine_mark, clear_routine_mark. " +
    "Todo fields: id, title, targetDate, category, completed, focused. Goal fields: id, title, memo, target, unit, deadline, createdAt, focused. Goal entry fields: goalId, entryId, value, memo, createdAt. Routine fields: id, title, memo, startDate, endDate, focused. Routine mark fields: routineId, date, status where status is success or failure. " +
    "For new todos without a date use today. For new routines without dates use today through one year after today. Use YYYY-MM-DD. For analysis or read-only requests return no actions. " +
    "For mutations, return one action per concrete change and say they are proposed for review; never claim they were applied. Permanent deletion is only for bin records. Ask one concise clarification only when a required detail cannot be resolved by querying. " +
    "Write message and clarificationQuestion in Korean for Korean requests and English for English requests.";

  const requestContext = {
    today: toLocalDateInputValue(),
    selectedList: input.selectedList,
    request: input.prompt,
  };
  let responseInput: unknown[] = [
    ...input.conversationHistory.map((message) => ({
      role: message.role === "agent" ? "assistant" : "user",
      content: message.content,
    })),
    {
      role: "user",
      content:
        "Process the following request context and return the final answer as a JSON object matching the required response fields.\n" +
        JSON.stringify(requestContext),
    },
  ];

  for (let turn = 0; turn < 6; turn += 1) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        store: false,
        instructions,
        input: responseInput,
        tools: [QUERY_RECORDS_TOOL],
        tool_choice: "auto",
        parallel_tool_calls: false,
        text: { format: { type: "json_object" } },
      }),
    });
    const data = (await response.json().catch(() => null)) as ResponsesApiResult | null;
    if (!response.ok || !data) {
      const message = data?.error?.message || "LLM request failed";
      if (response.status === 404 && turn === 0) return callOpenAiCompatibleChat(input);
      if (response.status === 401 || /incorrect api key|invalid api key/i.test(message)) {
        throw new Error("Saved OpenAI API key is invalid. Open Settings and replace it with a full key that starts with sk-.");
      }
      throw new Error(message);
    }

    const toolCalls = (data.output ?? []).filter(
      (item) => item.type === "function_call" && item.name === "query_records" && typeof item.call_id === "string",
    );
    if (toolCalls.length === 0) {
      const content = getResponsesOutputText(data);
      if (!content) throw new Error("LLM did not return content");
      return parseAgentResponse(content);
    }

    const toolOutputs = toolCalls.map((toolCall) => {
      let parsedArguments: unknown = null;
      try {
        parsedArguments = JSON.parse(toolCall.arguments ?? "{}");
      } catch {
        parsedArguments = null;
      }
      const query = parseAgentRecordQuery(parsedArguments);
      const output = query
        ? queryAgentRecords(query, input.context)
        : { error: "Invalid query_records arguments. Use the declared schema." };
      return {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: JSON.stringify(output),
      };
    });
    responseInput = [...responseInput, ...(data.output ?? []), ...toolOutputs];
  }

  throw new Error("Agent used too many tool calls without completing the request.");
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
      focused: action.focused,
    });
    return;
  }

  if (action.type === "delete_todo") {
    await deleteTodo(action.id);
    return;
  }

  if (action.type === "archive_todo") {
    await archiveTodo(action.id);
    return;
  }

  if (action.type === "restore_todo") {
    await restoreTodo(action.id);
    return;
  }

  if (action.type === "permanently_delete_todo") {
    await permanentlyDeleteTodo(action.id);
    return;
  }

  if (action.type === "add_goal") {
    await addGoal({
      title: action.title,
      memo: action.memo ?? "",
      target: action.target ?? 1,
      unit: action.unit ?? "units",
      deadline: action.deadline ?? "",
      createdAt: action.createdAt,
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
      createdAt: action.createdAt,
      focused: action.focused,
    });
    return;
  }

  if (action.type === "delete_goal") {
    await deleteGoal(action.id);
    return;
  }

  if (action.type === "archive_goal") {
    await archiveGoal(action.id);
    return;
  }

  if (action.type === "restore_goal") {
    await restoreGoal(action.id);
    return;
  }

  if (action.type === "permanently_delete_goal") {
    await permanentlyDeleteGoal(action.id);
    return;
  }

  if (action.type === "add_goal_entry") {
    await addEntry(action.goalId, {
      value: action.value,
      memo: action.memo ?? "",
      createdAt: action.createdAt,
    });
    return;
  }

  if (action.type === "update_goal_entry") {
    await updateEntry(action.goalId, action.entryId, {
      value: action.value,
      memo: action.memo,
      createdAt: action.createdAt,
    });
    return;
  }

  if (action.type === "delete_goal_entry") {
    await deleteEntry(action.goalId, action.entryId);
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

  if (action.type === "set_routine_mark") {
    await setRoutineMark(action.routineId, action.date, action.status);
    return;
  }

  if (action.type === "clear_routine_mark") {
    await clearRoutineMark(action.routineId, action.date);
    return;
  }

  if (action.type === "delete_routine") {
    await deleteRoutine(action.id);
    return;
  }

  if (action.type === "archive_routine") {
    await archiveRoutine(action.id);
    return;
  }

  if (action.type === "restore_routine") {
    await restoreRoutine(action.id);
    return;
  }

  if (action.type === "permanently_delete_routine") {
    const deletedRoutines = await readDeletedRoutines();
    if (!deletedRoutines.some((routine) => routine.id === action.id)) {
      throw new Error("Permanent habit deletion is only allowed for habits already in bin. Use delete_routine to move active habits to bin.");
    }
    await permanentlyDeleteRoutine(action.id);
    return;
  }

  await updateRoutine(action.id, {
    title: action.title,
    memo: action.memo,
    startDate: action.startDate,
    endDate: action.endDate,
    focused: action.focused,
  });
}

export async function runListAgent(
  prompt: string,
  apply: boolean,
  selectedListInput?: unknown,
  conversationHistoryInput?: unknown,
): Promise<AgentResult> {
  const request = prompt.trim();
  if (!request) throw new Error("Agent request is required");

  const selectedList = normalizeSelectedList(selectedListInput);
  const conversationHistory = normalizeConversationHistory(conversationHistoryInput);
  const context = await readAgentListContext();
  const requestedKinds = getRequestedListKinds(request);
  const requestTargetList = getRequestTargetList(request, selectedList);
  const defaultActiveListKind = getDefaultActiveListKind(request, selectedList);
  if (isEmptyBinRequest(request, selectedList)) {
    const actions = buildEmptyBinActions(context, requestedKinds);
    const shouldApply = shouldApplyActionsImmediately(apply, actions);
    if (shouldApply) {
      for (const action of actions) {
        await applyAction(action);
      }
    }

    return {
      message:
        apply && !shouldApply && actions.length > 1
          ? buildMultiActionReviewMessage(request, actions.length)
          : buildEmptyBinMessage(request, actions.length, shouldApply, requestedKinds),
      actions,
      applied: shouldApply,
      targetList: "bin",
      data: shouldApply ? await readAgentListContext() : context,
    };
  }

  if (isEmptyArchiveRequest(request, selectedList) || isRestoreArchiveRequest(request, selectedList)) {
    const mode = isRestoreArchiveRequest(request, selectedList) ? "restore" : "moveToBin";
    const actions = buildArchiveActions(context, mode, requestedKinds);
    const shouldApply = shouldApplyActionsImmediately(apply, actions);
    if (shouldApply) {
      for (const action of actions) {
        await applyAction(action);
      }
    }

    return {
      message:
        apply && !shouldApply && actions.length > 1
          ? buildMultiActionReviewMessage(request, actions.length)
          : buildArchiveMessage(request, actions.length, shouldApply, mode, requestedKinds),
      actions,
      applied: shouldApply,
      targetList: "archive",
      data: shouldApply ? await readAgentListContext() : context,
    };
  }

  const explicitDeleteActions = buildExplicitDeleteAction(request, context, defaultActiveListKind);
  if (explicitDeleteActions.length > 0) {
    const explicitDeleteTarget = inferTargetListFromActions(explicitDeleteActions);
    const shouldApply = shouldApplyActionsImmediately(apply, explicitDeleteActions);
    if (shouldApply) {
      for (const action of explicitDeleteActions) {
        await applyAction(action);
      }
    }

    return {
      message: shouldApply ? "Deleted the item." : "I can delete the item.",
      actions: explicitDeleteActions,
      applied: shouldApply,
      targetList: explicitDeleteTarget,
      data: shouldApply ? await readAgentListContext() : context,
    };
  }

  const clarifiedTodoDeleteActions = buildClarifiedTodoDeleteAction(request, context);
  if (clarifiedTodoDeleteActions.length > 0) {
    const shouldApply = shouldApplyActionsImmediately(apply, clarifiedTodoDeleteActions);
    if (shouldApply) {
      for (const action of clarifiedTodoDeleteActions) {
        await applyAction(action);
      }
    }

    return {
      message: shouldApply ? "Deleted the task." : "I can delete the task.",
      actions: clarifiedTodoDeleteActions,
      applied: shouldApply,
      targetList: "todo",
      data: shouldApply ? await readAgentListContext() : context,
    };
  }

  const clarifiedAddTodoActions = buildClarifiedAddTodoAction(request);
  if (clarifiedAddTodoActions.length > 0) {
    const shouldApply = shouldApplyActionsImmediately(apply, clarifiedAddTodoActions);
    if (shouldApply) {
      for (const action of clarifiedAddTodoActions) {
        await applyAction(action);
      }
    }

    return {
      message: shouldApply ? "Added the task." : "I can add the task.",
      actions: clarifiedAddTodoActions,
      applied: shouldApply,
      targetList: "todo",
      data: shouldApply ? await readAgentListContext() : context,
    };
  }

  const famousHabitActions = buildFamousRecommendedHabitActions(request);
  if (famousHabitActions.length > 0) {
    const shouldApply = shouldApplyActionsImmediately(apply, famousHabitActions);
    if (shouldApply) {
      for (const action of famousHabitActions) {
        await applyAction(action);
      }
    }

    return {
      message: shouldApply
        ? `유명 인물들이 자주 추천하는 습관 ${famousHabitActions.length}개를 추가했습니다.`
        : `유명 인물들이 자주 추천하는 습관 ${famousHabitActions.length}개를 추가할 수 있습니다.`,
      actions: famousHabitActions,
      applied: shouldApply,
      targetList: "routine",
      data: shouldApply ? await readAgentListContext() : context,
    };
  }

  const itemReferenceClarification = buildItemReferenceClarification(request, context);
  if (itemReferenceClarification) return itemReferenceClarification;

  if (looksLikeMutationRequest(request) && requestTargetList === "unknown" && !isArchiveRequest(request)) {
    const question = buildAmbiguousListMessage(request);
    return {
      message: question,
      actions: [],
      applied: false,
      targetList: "unknown",
      clarification: {
        originalPrompt: request,
        question,
      },
      data: context,
    };
  }

  const credentials = await readAgentCredentials();
  let agentResponse = await callOpenAiResponsesAgent({
    apiKey: credentials.apiKey,
    model: credentials.model,
    prompt: request,
    context,
    selectedList,
    conversationHistory,
  });
  if (
    looksLikeMutationRequest(request) &&
    agentResponse.actions.length === 0 &&
    !agentResponse.clarificationQuestion &&
    looksLikeAlreadySatisfiedAgentMessage(agentResponse.message)
  ) {
    agentResponse = await callOpenAiResponsesAgent({
      apiKey: credentials.apiKey,
      model: credentials.model,
      prompt: buildFreshRunRetryPrompt(request),
      context,
      selectedList,
      conversationHistory,
    });
  }
  const sanitizedAgentActions = sanitizeActionsForRequest(agentResponse.actions, request, selectedList);
  const removedBinActions = sanitizedAgentActions.length !== agentResponse.actions.length;
  const inferredTargetList =
    !usesBinScope(request) && requestTargetList !== "bin" && agentResponse.targetList === "bin"
      ? inferTargetListFromActions(sanitizedAgentActions)
      : agentResponse.targetList;
  const targetList = requestTargetList === "unknown" ? inferredTargetList : requestTargetList;
  const actions = completeBulkScheduleActions(resolveActionItemIds(sanitizedAgentActions, context, targetList), request, context, targetList);
  validateActionsForTarget(actions, targetList, "The agent");
  validateActionsForRequestedKinds(actions, requestedKinds, "The agent");
  enforceRequestedListKind(actions, request, targetList);

  const clarificationQuestion =
    agentResponse.clarificationQuestion ||
    (removedBinActions && actions.length === 0 && looksLikeMutationRequest(request)
      ? "I ignored bin permanent-delete actions because this request did not mention the bin. Specify the active item to delete, or say bin/trash if you want bin cleanup."
      : undefined) ||
    (actions.length === 0 && looksLikeMutationRequest(request)
      ? agentResponse.message
      : undefined);
  if (clarificationQuestion) {
    return {
      message: clarificationQuestion,
      actions: [],
      applied: false,
      targetList: "unknown",
      clarification: {
        originalPrompt: request,
        question: clarificationQuestion,
      },
      data: context,
    };
  }

  const shouldApply = shouldApplyActionsImmediately(apply, actions);
  if (shouldApply) {
    for (const action of actions) {
      await applyAction(action);
    }
  }

  return {
    ...agentResponse,
    message:
      shouldApply
        ? buildAppliedActionsMessage(request, actions.length)
        : apply && !shouldApply && actions.length > 1
        ? buildMultiActionReviewMessage(request, actions.length)
        : agentResponse.message,
    actions,
    applied: shouldApply,
    targetList,
    data: shouldApply ? await readAgentListContext() : context,
  };
}

export async function applyAgentActions(input: unknown): Promise<AgentResult> {
  const context = await readAgentListContext();
  const coercedActions = Array.isArray(input)
    ? input.map(coerceAction).filter((action): action is AgentAction => Boolean(action)).slice(0, 50)
    : [];
  if (coercedActions.some(isPermanentDeleteAction) && coercedActions.some((action) => !isPermanentDeleteAction(action))) {
    throw new Error("Permanent bin deletion cannot be mixed with ordinary list changes. Run bin cleanup separately.");
  }
  const actions = resolveActionItemIds(coercedActions, context, inferTargetListFromActions(coercedActions));
  const targetList = inferTargetListFromActions(actions);
  validateActionsForTarget(actions, targetList, "The proposed actions");

  if (actions.length === 0) {
    throw new Error("No valid agent actions to apply.");
  }

  for (const action of actions) {
    await applyAction(action);
  }

  return {
    message: "Applied the proposed actions.",
    actions,
    applied: true,
    targetList,
    data: await readAgentListContext(),
  };
}
