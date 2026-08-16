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
  deleteRoutine,
  permanentlyDeleteRoutine,
  readArchivedRoutines,
  readDeletedRoutines,
  readRoutines,
  restoreRoutine,
  updateRoutine,
} from "@/lib/routineStore";
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

type AgentAction =
  | { type: "add_todo"; title: string; targetDate: string; category?: string }
  | { type: "update_todo"; id: string; title?: string; targetDate?: string; category?: string; completed?: boolean }
  | { type: "delete_todo"; id: string }
  | { type: "archive_todo"; id: string }
  | { type: "restore_todo"; id: string }
  | { type: "permanently_delete_todo"; id: string }
  | { type: "add_goal"; title: string; memo?: string; target?: number; unit?: string; deadline?: string; createdAt?: number }
  | { type: "update_goal"; id: string; title?: string; memo?: string; target?: number; unit?: string; deadline?: string; createdAt?: number }
  | { type: "delete_goal"; id: string }
  | { type: "archive_goal"; id: string }
  | { type: "restore_goal"; id: string }
  | { type: "permanently_delete_goal"; id: string }
  | { type: "add_goal_entry"; goalId: string; value: number; memo?: string; createdAt?: number }
  | { type: "update_goal_entry"; goalId: string; entryId: string; value?: number; memo?: string; createdAt?: number }
  | { type: "delete_goal_entry"; goalId: string; entryId: string }
  | { type: "add_routine"; title: string; memo?: string; startDate: string; endDate: string }
  | { type: "update_routine"; id: string; title?: string; memo?: string; startDate?: string; endDate?: string }
  | { type: "delete_routine"; id: string }
  | { type: "archive_routine"; id: string }
  | { type: "restore_routine"; id: string }
  | { type: "permanently_delete_routine"; id: string };

type ListKind = "goal" | "todo" | "routine";
type AgentTargetList = ListKind | "archive" | "bin" | "unknown";

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

function startOfWeek(date: Date) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function resolveTaskQueryRange(request: string, today = new Date()) {
  const text = request.toLowerCase();
  const todayAtNoon = new Date(today);
  todayAtNoon.setHours(12, 0, 0, 0);

  if (/today|\uC624\uB298/.test(text)) {
    const date = toLocalDateInputValue(todayAtNoon);
    return { label: date, endDate: date };
  }

  if (/tomorrow|\uB0B4\uC77C/.test(text)) {
    const date = toLocalDateInputValue(addDays(todayAtNoon, 1));
    return { label: date, endDate: date };
  }

  if (/next\s*week|\uB2E4\uC74C\s*\uC8FC/.test(text)) {
    const endDate = toLocalDateInputValue(addDays(startOfWeek(todayAtNoon), 13));
    return { label: `through ${endDate}`, endDate };
  }

  if (/this\s*week|\uC774\uBC88\s*\uC8FC/.test(text)) {
    const endDate = toLocalDateInputValue(addDays(startOfWeek(todayAtNoon), 6));
    return { label: `through ${endDate}`, endDate };
  }

  const explicitDate = request.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (explicitDate) return { label: `through ${explicitDate}`, endDate: explicitDate };

  return null;
}

function isReadOnlyTaskQuery(request: string) {
  const text = request.toLowerCase();
  const asksForTasks = /\b(tasks?|todos?|to-?dos?)\b|\uD560\s*\uC77C|\uB2E8\uC21C\s*\uD560\s*\uC77C|\uD0DC\uC2A4\uD06C|\uC791\uC5C5/.test(text);
  const asksToList = /show|list|tell|what|which|\uC54C\uB824\s*\uC918|\uBCF4\uC5EC\s*\uC918|\uC870\uD68C|\uBB50/.test(text);
  return asksForTasks && asksToList && !looksLikeMutationRequest(request);
}

function buildTaskQueryMessage(
  todos: Awaited<ReturnType<typeof readTodos>>,
  request: string,
  today = new Date(),
) {
  const isKorean = /[\u3131-\uD79D]/.test(request);
  const range = resolveTaskQueryRange(request, today);
  const targetTodos = todos
    .filter((todo) => !todo.completed)
    .filter((todo) => {
      if (!range) return true;
      const targetDate = todo.targetDate;
      return typeof targetDate === "string" && targetDate <= range.endDate;
    })
    .sort((a, b) => (a.targetDate ?? "9999-12-31").localeCompare(b.targetDate ?? "9999-12-31"));

  const rangeLabel = range && isKorean ? range.label.replace(/^through\s+/, "") : range?.label;
  const heading = range
    ? isKorean
      ? `${rangeLabel}까지 해야 할 tasks`
      : `Tasks due ${rangeLabel}`
    : isKorean
      ? "미완료 tasks"
      : "Open tasks";
  if (!targetTodos.length) {
    return isKorean ? `${heading}: 해당하는 미완료 task가 없습니다.` : `${heading}: no matching open tasks.`;
  }

  const lines = targetTodos.map((todo, index) => {
    const date = todo.targetDate ?? (isKorean ? "목표일 없음" : "no target date");
    const category = todo.category.trim() ? ` · ${todo.category.trim()}` : "";
    return `${index + 1}. ${todo.title} (${date}${category})`;
  });

  return `${heading}:\n${lines.join("\n")}`;
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

function normalizeActionType(type: string) {
  const normalized = type.trim().toLowerCase().replaceAll("-", "_");
  if (["add_task", "create_task", "new_task"].includes(normalized)) return "add_todo";
  if (["update_task", "edit_task", "complete_task"].includes(normalized)) return "update_todo";
  if (["delete_task", "remove_task"].includes(normalized)) return "delete_todo";
  if (["create_todo", "new_todo"].includes(normalized)) return "add_todo";
  if (["edit_todo", "complete_todo"].includes(normalized)) return "update_todo";
  if (["remove_todo"].includes(normalized)) return "delete_todo";
  if (["archive_task", "archive_todo", "move_task_to_archive", "move_todo_to_archive", "move_task_to_storage", "move_todo_to_storage", "send_task_to_archive", "send_todo_to_archive", "send_task_to_storage", "send_todo_to_storage"].includes(normalized)) return "archive_todo";
  if (["restore_task", "restore_todo", "restore_archived_task", "restore_archived_todo"].includes(normalized)) return "restore_todo";
  if (["delete_archived_task", "delete_archived_todo", "move_archived_task_to_bin", "move_archived_todo_to_bin"].includes(normalized)) return "delete_todo";
  if (["permanently_delete_task", "permanent_delete_task", "delete_task_forever"].includes(normalized)) return "permanently_delete_todo";
  if (["permanently_delete_todo", "permanent_delete_todo", "delete_todo_forever"].includes(normalized)) return "permanently_delete_todo";
  if (["create_goal", "new_goal"].includes(normalized)) return "add_goal";
  if (["edit_goal"].includes(normalized)) return "update_goal";
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
  if (["delete_habit", "remove_habit", "delete_routine", "remove_routine"].includes(normalized)) return "delete_routine";
  if (["archive_habit", "archive_routine", "move_habit_to_archive", "move_routine_to_archive", "move_habit_to_storage", "move_routine_to_storage", "send_habit_to_archive", "send_routine_to_archive", "send_habit_to_storage", "send_routine_to_storage"].includes(normalized)) return "archive_routine";
  if (["restore_habit", "restore_routine", "restore_archived_habit", "restore_archived_routine"].includes(normalized)) return "restore_routine";
  if (["delete_archived_habit", "delete_archived_routine", "move_archived_habit_to_bin", "move_archived_routine_to_bin"].includes(normalized)) return "delete_routine";
  if (["permanently_delete_habit", "permanent_delete_habit", "delete_habit_forever"].includes(normalized)) return "permanently_delete_routine";
  if (["permanently_delete_routine", "permanent_delete_routine", "delete_routine_forever"].includes(normalized)) return "permanently_delete_routine";
  return normalized;
}

function normalizeActionDate(record: Record<string, unknown>, fields: string[]) {
  return normalizeDate(firstStringField(record, fields));
}

function getRequestedListKinds(request: string) {
  const text = request.toLowerCase();
  const kinds: ListKind[] = [];
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
  if (action.type.endsWith("_routine")) return "routine";
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
    action.type === "restore_routine" ||
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
    const invalidAction = actions.find((action) => !isArchiveTargetAction(action));
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
    const targetDate = normalizeActionDate(value, ["targetDate", "dueDate", "deadline", "date"]);
    if (!title || !targetDate) return null;
    return { type, title, targetDate, category: asOptionalString(value.category) };
  }

  if (type === "update_todo") {
    const id = firstIdField(value, ["id", "todoId", "todo_id", "taskId", "task_id"]);
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
    };
  }

  if (type === "delete_todo") {
    const id = firstIdField(value, ["id", "todoId", "todo_id", "taskId", "task_id"]);
    return id ? { type, id } : null;
  }

  if (type === "archive_todo" || type === "restore_todo" || type === "permanently_delete_todo") {
    const id = firstIdField(value, ["id", "todoId", "todo_id", "taskId", "task_id"]);
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
    const id = firstIdField(value, ["id", "goalId", "goal_id"]);
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
    };
  }

  if (type === "delete_goal") {
    const id = firstIdField(value, ["id", "goalId", "goal_id"]);
    return id ? { type, id } : null;
  }

  if (type === "archive_goal" || type === "restore_goal" || type === "permanently_delete_goal") {
    const id = firstIdField(value, ["id", "goalId", "goal_id"]);
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
    const id = firstIdField(value, ["id", "routineId", "routine_id", "habitId", "habit_id"]);
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

  if (type === "delete_routine") {
    const id = firstIdField(value, ["id", "routineId", "routine_id", "habitId", "habit_id"]);
    return id ? { type, id } : null;
  }

  if (type === "archive_routine" || type === "restore_routine" || type === "permanently_delete_routine") {
    const id = firstIdField(value, ["id", "routineId", "routine_id", "habitId", "habit_id"]);
    return id ? { type, id } : null;
  }

  return null;
}

function looksLikeMutationRequest(request: string) {
  return /add|create|update|edit|delete|remove|complete|archive|restore|추가|만들|수정|변경|바꿔|삭제|지워|제거|완료|보관|복원|기록/i.test(request);
}

function isEmptyBinRequest(request: string) {
  const text = request.toLowerCase();
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

function isEmptyArchiveRequest(request: string) {
  const text = request.toLowerCase();
  const asksToEmpty = /\b(empty|clear)\b|비우|비워/.test(text);
  const asksToDelete = /\b(delete|remove|move to bin|move to trash)\b|삭제|지워|제거|휴지통/.test(text);
  return isArchiveRequest(request) && (asksToEmpty || (asksToDelete && mentionsAllItems(request)));
}

function isRestoreArchiveRequest(request: string) {
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

function buildAmbiguousListMessage(request: string) {
  const isKorean = /[\u3131-\uD79D]/.test(request);
  return isKorean
    ? "이 요청이 할일, 목표, 습관 중 어느 리스트에 대한 작업인지 명확하지 않습니다. 예: '할일에 추가', '목표에 추가', '습관에 추가'처럼 리스트를 지정해 주세요."
    : "I cannot tell whether this should change tasks, goals, or habits. Please specify the list, such as tasks, goals, or habits.";
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
    todos,
    routines: summarizeRoutines(routines),
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
            "You manage a personal planning app. Return only JSON with keys targetList, message, actions, and optionally clarificationQuestion. " +
            "targetList must be one of todo, goal, routine, archive, bin, or unknown. Choose targetList before choosing actions. " +
            "Actions must be an array of allowed action objects for that exact targetList. Use existing ids for updates/deletes. " +
            "If required details are missing or uncertain, including the target list, the exact existing item, the requested date, or whether the user wants tasks/goals/habits, set targetList to unknown, return no actions, and ask one concise clarification question in both message and clarificationQuestion. " +
            "In the user-facing message, refer to items by their titles or names, not by ids or item numbers. " +
            "Allowed types: add_todo, update_todo, delete_todo, archive_todo, restore_todo, permanently_delete_todo, " +
            "add_goal, update_goal, delete_goal, archive_goal, restore_goal, permanently_delete_goal, " +
            "add_goal_entry, update_goal_entry, delete_goal_entry, " +
            "add_routine, update_routine, delete_routine, archive_routine, restore_routine, permanently_delete_routine. " +
            "For a task/todo add request, return {\"type\":\"add_todo\",\"title\":\"...\",\"targetDate\":\"YYYY-MM-DD\",\"category\":\"...\"}. " +
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
  });
}

export async function runListAgent(prompt: string, apply: boolean): Promise<AgentResult> {
  const request = prompt.trim();
  if (!request) throw new Error("Agent request is required");

  const context = await readAgentListContext();
  const requestedKinds = getRequestedListKinds(request);
  if (isReadOnlyTaskQuery(request)) {
    return {
      message: buildTaskQueryMessage(context.todos, request),
      actions: [],
      applied: false,
      targetList: "todo",
      data: context,
    };
  }

  if (isEmptyBinRequest(request)) {
    const actions = buildEmptyBinActions(context, requestedKinds);
    if (apply) {
      for (const action of actions) {
        await applyAction(action);
      }
    }

    return {
      message: buildEmptyBinMessage(request, actions.length, apply, requestedKinds),
      actions,
      applied: apply,
      targetList: "bin",
      data: apply ? await readAgentListContext() : context,
    };
  }

  if (isEmptyArchiveRequest(request) || isRestoreArchiveRequest(request)) {
    const mode = isRestoreArchiveRequest(request) ? "restore" : "moveToBin";
    const actions = buildArchiveActions(context, mode, requestedKinds);
    if (apply) {
      for (const action of actions) {
        await applyAction(action);
      }
    }

    return {
      message: buildArchiveMessage(request, actions.length, apply, mode, requestedKinds),
      actions,
      applied: apply,
      targetList: "archive",
      data: apply ? await readAgentListContext() : context,
    };
  }

  if (looksLikeMutationRequest(request) && requestedKinds.length !== 1 && !isArchiveRequest(request)) {
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
  const agentResponse = await callOpenAiCompatibleChat({
    apiKey: credentials.apiKey,
    model: credentials.model,
    prompt: request,
    context,
  });
  const actions = agentResponse.actions;
  validateActionsForTarget(actions, agentResponse.targetList, "The agent");
  validateActionsForRequestedKinds(actions, requestedKinds, "The agent");
  enforceRequestedListKind(actions, request, agentResponse.targetList);

  const clarificationQuestion =
    agentResponse.clarificationQuestion ||
    (agentResponse.targetList === "unknown" && actions.length === 0 && looksLikeMutationRequest(request)
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

  if (apply && actions.length === 0 && looksLikeMutationRequest(request)) {
    throw new Error("The agent did not return any list changes to apply. Try the request again with a specific task, date, and list.");
  }

  if (apply) {
    for (const action of actions) {
      await applyAction(action);
    }
  }

  return {
    ...agentResponse,
    actions,
    applied: apply,
    data: await readAgentListContext(),
  };
}

export async function applyAgentActions(input: unknown): Promise<AgentResult> {
  const actions = Array.isArray(input)
    ? input.map(coerceAction).filter((action): action is AgentAction => Boolean(action)).slice(0, 50)
    : [];
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
