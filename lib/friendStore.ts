import { addGoal, type NewGoalInput } from "@/lib/goalStore";
import { addRoutine, type NewRoutineInput } from "@/lib/routineStore";
import { addTodo } from "@/lib/todoStore";
import { requireLoginId } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase";

export type FriendProfile = {
  loginId: string;
  displayName: string | null;
};

export type Friendship = {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: "pending" | "accepted" | "declined";
  createdAt: number;
  respondedAt?: number;
  friend: FriendProfile;
  direction: "sent" | "received";
};

export type AssignmentKind = "goal" | "todo" | "routine";

export type Assignment = {
  id: string;
  assignerId: string;
  assigneeId: string;
  kind: AssignmentKind;
  title: string;
  memo: string;
  target?: number;
  unit?: string;
  deadline?: string;
  startDate?: string;
  endDate?: string;
  targetDate?: string;
  category: string;
  status: "pending" | "accepted" | "declined";
  appliedItemId?: string;
  createdAt: number;
  respondedAt?: number;
  assigner?: FriendProfile;
  assignee?: FriendProfile;
  observed?: AssignedObservation | null;
};

export type AssignedObservation = {
  kind: AssignmentKind;
  id: string;
  title: string;
  statusText: string;
  progressText: string;
  updatedAt?: number;
};

export type AssignmentDetail =
  | (Assignment & {
      detail: {
        kind: "goal";
        item: {
          id: string;
          title: string;
          memo: string;
          target: number;
          unit: string;
          deadline: string;
          createdAt: number;
          entries: Array<{ id: string; createdAt: number; value: number; memo: string }>;
        };
      };
    })
  | (Assignment & {
      detail: {
        kind: "todo";
        item: {
          id: string;
          title: string;
          completed: boolean;
          createdAt: number;
          targetDate?: string;
          category: string;
        };
      };
    })
  | (Assignment & {
      detail: {
        kind: "routine";
        item: {
          id: string;
          title: string;
          memo: string;
          startDate: string;
          endDate: string;
          createdAt: number;
          marks: Array<{ id: string; routineId: string; date: string; status: "success" | "failure"; createdAt: number }>;
        };
      };
    });

export type AssignmentInput =
  | ({ kind: "goal" } & NewGoalInput & { assigneeId: string })
  | ({ kind: "todo"; assigneeId: string; title: string; targetDate: string; category?: string; memo?: string })
  | ({ kind: "routine" } & NewRoutineInput & { assigneeId: string });

const TODO_GOAL_MEMO = "__boostmaster_todo__";
const TODO_GOAL_MEMO_PREFIX = `${TODO_GOAL_MEMO}:`;
const TODO_GOAL_UNIT = "__todo__";
const TODO_COMPLETED_DEADLINE = "completed";
const TODO_COMPLETED_TARGET = 2;
const ROUTINE_GOAL_UNIT = "__routine__";
const ROUTINE_MARK_MEMO_PREFIX = "__boostmaster_routine_mark__:";

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isMissingTableError(error: unknown, tableName: string) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  return record.code === "PGRST205" && String(record.message ?? "").includes(`public.${tableName}`);
}

function normalizeDate(value: string | undefined) {
  const date = (value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function assertTitle(title: string) {
  const normalized = title.trim();
  if (!normalized) throw new Error("Title is required.");
  return normalized;
}

function toDateFromTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function decodeRoutineMarkMemo(value: string, createdAt: number, entryValue: number) {
  if (value.startsWith(ROUTINE_MARK_MEMO_PREFIX)) {
    try {
      const parsed = JSON.parse(value.slice(ROUTINE_MARK_MEMO_PREFIX.length)) as {
        date?: unknown;
        status?: unknown;
      };
      return {
        date: typeof parsed.date === "string" ? parsed.date : toDateFromTimestamp(createdAt),
        status: parsed.status === "failure" ? "failure" : "success",
      };
    } catch {
      return { date: toDateFromTimestamp(createdAt), status: entryValue >= 1 ? "success" : "failure" };
    }
  }

  return { date: toDateFromTimestamp(createdAt), status: entryValue >= 1 ? "success" : "failure" };
}

function decodeRoutineMemo(value: string) {
  const prefix = "__boostmaster_routine__:";
  if (!value.startsWith(prefix)) return { memo: value, startDate: "" };

  try {
    const parsed = JSON.parse(value.slice(prefix.length)) as {
      memo?: unknown;
      startDate?: unknown;
    };
    return {
      memo: typeof parsed.memo === "string" ? parsed.memo : "",
      startDate: typeof parsed.startDate === "string" ? parsed.startDate : "",
    };
  } catch {
    return { memo: "", startDate: "" };
  }
}

function decodeTodoCategory(memo: string) {
  if (!memo.startsWith(TODO_GOAL_MEMO_PREFIX)) return "";

  try {
    const parsed = JSON.parse(memo.slice(TODO_GOAL_MEMO_PREFIX.length)) as { category?: unknown };
    return typeof parsed.category === "string" ? parsed.category.trim().slice(0, 64) : "";
  } catch {
    return "";
  }
}

async function getProfiles(loginIds: string[]) {
  const uniqueIds = Array.from(new Set(loginIds.filter(Boolean)));
  if (!uniqueIds.length) return new Map<string, FriendProfile>();

  const { data, error } = await getSupabaseServerClient()
    .from("app_users")
    .select("login_id,display_name")
    .in("login_id", uniqueIds);
  if (error) throw error;

  return new Map(
    (data ?? []).map((user) => [
      user.login_id,
      {
        loginId: user.login_id,
        displayName: user.display_name ?? null,
      },
    ]),
  );
}

function mapFriendship(
  row: {
    id: string;
    requester_id: string;
    addressee_id: string;
    status: "pending" | "accepted" | "declined";
    created_at_ms: number;
    responded_at_ms: number | null;
  },
  loginId: string,
  profiles: Map<string, FriendProfile>,
): Friendship {
  const friendId = row.requester_id === loginId ? row.addressee_id : row.requester_id;
  return {
    id: row.id,
    requesterId: row.requester_id,
    addresseeId: row.addressee_id,
    status: row.status,
    createdAt: row.created_at_ms,
    respondedAt: row.responded_at_ms ?? undefined,
    friend: profiles.get(friendId) ?? { loginId: friendId, displayName: null },
    direction: row.requester_id === loginId ? "sent" : "received",
  };
}

function mapAssignment(
  row: {
    id: string;
    assigner_id: string;
    assignee_id: string;
    kind: AssignmentKind;
    title: string;
    memo: string;
    target: number | null;
    unit: string | null;
    deadline: string | null;
    start_date: string | null;
    end_date: string | null;
    target_date: string | null;
    category: string;
    status: "pending" | "accepted" | "declined";
    applied_item_id: string | null;
    created_at_ms: number;
    responded_at_ms: number | null;
  },
  profiles: Map<string, FriendProfile>,
): Assignment {
  return {
    id: row.id,
    assignerId: row.assigner_id,
    assigneeId: row.assignee_id,
    kind: row.kind,
    title: row.title,
    memo: row.memo,
    target: row.target ?? undefined,
    unit: row.unit ?? undefined,
    deadline: row.deadline ?? undefined,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    targetDate: row.target_date ?? undefined,
    category: row.category ?? "",
    status: row.status,
    appliedItemId: row.applied_item_id ?? undefined,
    createdAt: row.created_at_ms,
    respondedAt: row.responded_at_ms ?? undefined,
    assigner: profiles.get(row.assigner_id),
    assignee: profiles.get(row.assignee_id),
  };
}

export async function searchUsersByNickname(query: string) {
  const loginId = await requireLoginId();
  const term = query.trim();
  if (term.length < 2) return [];

  const { data, error } = await getSupabaseServerClient()
    .from("app_users")
    .select("login_id,display_name")
    .or(`display_name.ilike.%${term.replaceAll("%", "\\%")}%,login_id.ilike.%${term.replaceAll("%", "\\%")}%`)
    .neq("login_id", loginId)
    .limit(10);
  if (error) throw error;

  return (data ?? []).map((user) => ({
    loginId: user.login_id,
    displayName: user.display_name ?? null,
  }));
}

export async function readFriendships() {
  const loginId = await requireLoginId();
  const { data, error } = await getSupabaseServerClient()
    .from("friendships")
    .select("*")
    .or(`requester_id.eq.${loginId},addressee_id.eq.${loginId}`)
    .order("created_at_ms", { ascending: false });
  if (error) throw error;

  const profiles = await getProfiles((data ?? []).flatMap((friendship) => [friendship.requester_id, friendship.addressee_id]));
  return (data ?? []).map((friendship) => mapFriendship(friendship, loginId, profiles));
}

export async function requestFriend(addresseeId: string) {
  const requesterId = await requireLoginId();
  const friendId = addresseeId.trim();
  if (!friendId || friendId === requesterId) throw new Error("Choose another user.");

  const left = requesterId < friendId ? requesterId : friendId;
  const right = requesterId < friendId ? friendId : requesterId;
  const supabase = getSupabaseServerClient();
  const { data: existing, error: readError } = await supabase
    .from("friendships")
    .select("id,status")
    .or(`and(requester_id.eq.${left},addressee_id.eq.${right}),and(requester_id.eq.${right},addressee_id.eq.${left})`)
    .maybeSingle();
  if (readError) throw readError;
  if (existing?.status === "accepted") throw new Error("Already friends.");
  if (existing?.status === "pending") throw new Error("Friend request is already pending.");

  const { error } = await supabase.from("friendships").insert({
    id: makeId("friendship"),
    requester_id: requesterId,
    addressee_id: friendId,
    status: "pending",
    created_at_ms: Date.now(),
  });
  if (error) throw error;
  return readFriendships();
}

export async function respondToFriendship(friendshipId: string, status: "accepted" | "declined") {
  const loginId = await requireLoginId();
  const { error } = await getSupabaseServerClient()
    .from("friendships")
    .update({ status, responded_at_ms: Date.now() })
    .eq("id", friendshipId)
    .eq("addressee_id", loginId)
    .eq("status", "pending");
  if (error) throw error;
  return readFriendships();
}

export async function assertAcceptedFriend(leftId: string, rightId: string) {
  const { data, error } = await getSupabaseServerClient()
    .from("friendships")
    .select("id")
    .eq("status", "accepted")
    .or(`and(requester_id.eq.${leftId},addressee_id.eq.${rightId}),and(requester_id.eq.${rightId},addressee_id.eq.${leftId})`)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("You can assign items only to accepted friends.");
}

export async function createAssignment(input: AssignmentInput) {
  const assignerId = await requireLoginId();
  await assertAcceptedFriend(assignerId, input.assigneeId);

  const now = Date.now();
  const row = {
    id: makeId("assignment"),
    assigner_id: assignerId,
    assignee_id: input.assigneeId,
    kind: input.kind,
    title: assertTitle(input.title),
    memo: "memo" in input ? (input.memo ?? "").trim() : "",
    target: input.kind === "goal" ? (Number.isFinite(input.target) ? input.target : 1) : null,
    unit: input.kind === "goal" ? input.unit.trim() || "units" : null,
    deadline: input.kind === "goal" ? normalizeDate(input.deadline) : null,
    start_date: input.kind === "routine" ? normalizeDate(input.startDate) || normalizeDate(input.endDate) : null,
    end_date: input.kind === "routine" ? normalizeDate(input.endDate) || normalizeDate(input.startDate) : null,
    target_date: input.kind === "todo" ? normalizeDate(input.targetDate) : null,
    category: input.kind === "todo" ? (input.category ?? "").trim().slice(0, 64) : "",
    status: "pending" as const,
    created_at_ms: now,
  };
  if (input.kind === "todo" && !row.target_date) throw new Error("Task target date is required.");
  if (input.kind === "routine" && (!row.start_date || !row.end_date)) throw new Error("Habit date range is required.");

  const { error } = await getSupabaseServerClient().from("item_assignments").insert(row);
  if (error) throw error;
  return readAssignments();
}

export async function readAssignments() {
  const loginId = await requireLoginId();
  const { data, error } = await getSupabaseServerClient()
    .from("item_assignments")
    .select("*")
    .or(`assigner_id.eq.${loginId},assignee_id.eq.${loginId}`)
    .order("created_at_ms", { ascending: false });
  if (error) throw error;

  const profiles = await getProfiles((data ?? []).flatMap((assignment) => [assignment.assigner_id, assignment.assignee_id]));
  const assignments = (data ?? []).map((assignment) => mapAssignment(assignment, profiles));
  const observations = await readObservations(assignments.filter((assignment) => assignment.assignerId === loginId));
  return assignments.map((assignment) => ({
    ...assignment,
    observed: observations.get(assignment.id) ?? null,
  }));
}

async function readTodoObservationFromGoalRows(assignment: Assignment) {
  if (!assignment.appliedItemId) return null;

  const { data: todo, error } = await getSupabaseServerClient()
    .from("goals")
    .select("id,title,target,deadline,created_at_ms")
    .eq("id", assignment.appliedItemId)
    .eq("user_id", assignment.assigneeId)
    .eq("unit", TODO_GOAL_UNIT)
    .or(`memo.eq.${TODO_GOAL_MEMO},memo.like.${TODO_GOAL_MEMO_PREFIX}%`)
    .maybeSingle();
  if (error) throw error;
  if (!todo) return null;

  const completed = todo.deadline === TODO_COMPLETED_DEADLINE || todo.target === TODO_COMPLETED_TARGET;
  return {
    kind: "todo" as const,
    id: todo.id,
    title: todo.title,
    statusText: completed ? "Completed" : "Not completed",
    progressText: /^\d{4}-\d{2}-\d{2}$/.test(todo.deadline) ? `Target ${todo.deadline}` : "No target date",
    updatedAt: todo.created_at_ms,
  };
}

async function readRoutineObservationFromGoalRows(assignment: Assignment) {
  if (!assignment.appliedItemId) return null;

  const supabase = getSupabaseServerClient();
  const { data: routine, error } = await supabase
    .from("goals")
    .select("id,title,created_at_ms")
    .eq("id", assignment.appliedItemId)
    .eq("user_id", assignment.assigneeId)
    .eq("unit", ROUTINE_GOAL_UNIT)
    .maybeSingle();
  if (error) throw error;
  if (!routine) return null;

  const { data: entries, error: entriesError } = await supabase
    .from("progress_entries")
    .select("created_at_ms,value,memo")
    .eq("goal_id", routine.id)
    .order("created_at_ms", { ascending: false });
  if (entriesError) throw entriesError;

  const successCount = (entries ?? []).filter((entry) => {
    const decoded = decodeRoutineMarkMemo(entry.memo, entry.created_at_ms, entry.value);
    return decoded.status === "success";
  }).length;

  return {
    kind: "routine" as const,
    id: routine.id,
    title: routine.title,
    statusText: "Accepted",
    progressText: `${successCount} success marks`,
    updatedAt: entries?.[0]?.created_at_ms ?? routine.created_at_ms,
  };
}

async function readObservations(assignments: Assignment[]) {
  const result = new Map<string, AssignedObservation>();
  const supabase = getSupabaseServerClient();

  for (const assignment of assignments) {
    if (assignment.status !== "accepted" || !assignment.appliedItemId) continue;

    if (assignment.kind === "goal") {
      const { data: goal, error: goalError } = await supabase
        .from("goals")
        .select("id,title,target,unit,created_at_ms")
        .eq("id", assignment.appliedItemId)
        .eq("user_id", assignment.assigneeId)
        .maybeSingle();
      if (goalError) throw goalError;
      if (!goal) continue;
      const { data: entries, error: entriesError } = await supabase
        .from("progress_entries")
        .select("value,created_at_ms")
        .eq("goal_id", goal.id)
        .order("created_at_ms", { ascending: false })
        .limit(1);
      if (entriesError) throw entriesError;
      const latest = entries?.[0];
      result.set(assignment.id, {
        kind: "goal",
        id: goal.id,
        title: goal.title,
        statusText: "Accepted",
        progressText: `${latest?.value ?? 0} / ${goal.target} ${goal.unit}`,
        updatedAt: latest?.created_at_ms ?? goal.created_at_ms,
      });
    }

    if (assignment.kind === "todo") {
      const { data: todo, error } = await supabase
        .from("todos")
        .select("id,title,completed,created_at_ms,target_date")
        .eq("id", assignment.appliedItemId)
        .eq("user_id", assignment.assigneeId)
        .maybeSingle();
      if (error) {
        if (isMissingTableError(error, "todos")) {
          const observation = await readTodoObservationFromGoalRows(assignment);
          if (observation) result.set(assignment.id, observation);
          continue;
        }
        throw error;
      }
      if (!todo) continue;
      result.set(assignment.id, {
        kind: "todo",
        id: todo.id,
        title: todo.title,
        statusText: todo.completed ? "Completed" : "Not completed",
        progressText: todo.target_date ? `Target ${todo.target_date}` : "No target date",
        updatedAt: todo.created_at_ms,
      });
    }

    if (assignment.kind === "routine") {
      const { data: routine, error } = await supabase
        .from("routines")
        .select("id,title,start_date,end_date,created_at_ms")
        .eq("id", assignment.appliedItemId)
        .eq("user_id", assignment.assigneeId)
        .maybeSingle();
      if (error) {
        if (isMissingTableError(error, "routines")) {
          const observation = await readRoutineObservationFromGoalRows(assignment);
          if (observation) result.set(assignment.id, observation);
          continue;
        }
        throw error;
      }
      if (!routine) continue;
      const { count, error: countError } = await supabase
        .from("routine_marks")
        .select("id", { count: "exact", head: true })
        .eq("routine_id", routine.id)
        .eq("status", "success");
      if (countError) {
        if (isMissingTableError(countError, "routine_marks")) {
          const observation = await readRoutineObservationFromGoalRows(assignment);
          if (observation) result.set(assignment.id, observation);
          continue;
        }
        throw countError;
      }
      result.set(assignment.id, {
        kind: "routine",
        id: routine.id,
        title: routine.title,
        statusText: "Accepted",
        progressText: `${count ?? 0} success marks`,
        updatedAt: routine.created_at_ms,
      });
    }
  }

  return result;
}

export async function respondToAssignment(assignmentId: string, status: "accepted" | "declined") {
  const loginId = await requireLoginId();
  const supabase = getSupabaseServerClient();
  const { data: assignment, error: readError } = await supabase
    .from("item_assignments")
    .select("*")
    .eq("id", assignmentId)
    .eq("assignee_id", loginId)
    .eq("status", "pending")
    .maybeSingle();
  if (readError) throw readError;
  if (!assignment) return readAssignments();

  let appliedItemId: string | null = null;
  if (status === "accepted") {
    if (assignment.kind === "goal") {
      const result = await addGoal({
        title: assignment.title,
        memo: assignment.memo,
        target: assignment.target ?? 1,
        unit: assignment.unit ?? "units",
        deadline: assignment.deadline ?? "",
      });
      appliedItemId = result.goal.id;
    } else if (assignment.kind === "todo") {
      const result = await addTodo(assignment.title, assignment.target_date ?? "", assignment.category ?? "");
      appliedItemId = result.todo.id;
    } else {
      const result = await addRoutine({
        title: assignment.title,
        memo: assignment.memo,
        startDate: assignment.start_date ?? "",
        endDate: assignment.end_date ?? "",
      });
      appliedItemId = result.routine.id;
    }
  }

  const { error } = await supabase
    .from("item_assignments")
    .update({ status, applied_item_id: appliedItemId, responded_at_ms: Date.now() })
    .eq("id", assignmentId)
    .eq("assignee_id", loginId);
  if (error) throw error;
  return readAssignments();
}

export async function readAssignmentDetail(assignmentId: string) {
  const loginId = await requireLoginId();
  const supabase = getSupabaseServerClient();
  const { data: row, error } = await supabase
    .from("item_assignments")
    .select("*")
    .eq("id", assignmentId)
    .eq("assigner_id", loginId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("Assignment not found.");
  if (row.status !== "accepted" || !row.applied_item_id) throw new Error("This assignment has not been accepted yet.");

  const profiles = await getProfiles([row.assigner_id, row.assignee_id]);
  const assignment = mapAssignment(row, profiles);

  if (row.kind === "goal") {
    const { data: goal, error: goalError } = await supabase
      .from("goals")
      .select("id,title,memo,target,unit,deadline,created_at_ms")
      .eq("id", row.applied_item_id)
      .eq("user_id", row.assignee_id)
      .maybeSingle();
    if (goalError) throw goalError;
    if (!goal) throw new Error("Applied goal was not found.");

    const { data: entries, error: entriesError } = await supabase
      .from("progress_entries")
      .select("id,created_at_ms,value,memo")
      .eq("goal_id", goal.id)
      .order("created_at_ms", { ascending: true });
    if (entriesError) throw entriesError;

    return {
      ...assignment,
      detail: {
        kind: "goal" as const,
        item: {
          id: goal.id,
          title: goal.title,
          memo: goal.memo,
          target: goal.target,
          unit: goal.unit,
          deadline: goal.deadline,
          createdAt: goal.created_at_ms,
          entries: (entries ?? []).map((entry) => ({
            id: entry.id,
            createdAt: entry.created_at_ms,
            value: entry.value,
            memo: entry.memo,
          })),
        },
      },
    };
  }

  if (row.kind === "todo") {
    const { data: todo, error: todoError } = await supabase
      .from("todos")
      .select("id,title,completed,created_at_ms,target_date,category")
      .eq("id", row.applied_item_id)
      .eq("user_id", row.assignee_id)
      .maybeSingle();

    if (todoError && !isMissingTableError(todoError, "todos")) throw todoError;

    if (todoError && isMissingTableError(todoError, "todos")) {
      const { data: fallbackTodo, error: fallbackError } = await supabase
        .from("goals")
        .select("id,title,memo,target,deadline,created_at_ms")
        .eq("id", row.applied_item_id)
        .eq("user_id", row.assignee_id)
        .eq("unit", TODO_GOAL_UNIT)
        .or(`memo.eq.${TODO_GOAL_MEMO},memo.like.${TODO_GOAL_MEMO_PREFIX}%`)
        .maybeSingle();
      if (fallbackError) throw fallbackError;
      if (!fallbackTodo) throw new Error("Applied task was not found.");

      return {
        ...assignment,
        detail: {
          kind: "todo" as const,
          item: {
            id: fallbackTodo.id,
            title: fallbackTodo.title,
            completed: fallbackTodo.deadline === TODO_COMPLETED_DEADLINE || fallbackTodo.target === TODO_COMPLETED_TARGET,
            createdAt: fallbackTodo.created_at_ms,
            targetDate: /^\d{4}-\d{2}-\d{2}$/.test(fallbackTodo.deadline) ? fallbackTodo.deadline : undefined,
            category: decodeTodoCategory(fallbackTodo.memo),
          },
        },
      };
    }

    if (!todo) throw new Error("Applied task was not found.");
    return {
      ...assignment,
      detail: {
        kind: "todo" as const,
        item: {
          id: todo.id,
          title: todo.title,
          completed: todo.completed,
          createdAt: todo.created_at_ms,
          targetDate: todo.target_date ?? undefined,
          category: todo.category ?? "",
        },
      },
    };
  }

  const { data: routine, error: routineError } = await supabase
    .from("routines")
    .select("id,title,memo,start_date,end_date,created_at_ms")
    .eq("id", row.applied_item_id)
    .eq("user_id", row.assignee_id)
    .maybeSingle();

  if (routineError && !isMissingTableError(routineError, "routines")) throw routineError;

  if (routineError && isMissingTableError(routineError, "routines")) {
    const { data: fallbackRoutine, error: fallbackError } = await supabase
      .from("goals")
      .select("id,title,memo,deadline,created_at_ms")
      .eq("id", row.applied_item_id)
      .eq("user_id", row.assignee_id)
      .eq("unit", ROUTINE_GOAL_UNIT)
      .maybeSingle();
    if (fallbackError) throw fallbackError;
    if (!fallbackRoutine) throw new Error("Applied habit was not found.");

    const { data: entries, error: entriesError } = await supabase
      .from("progress_entries")
      .select("id,goal_id,created_at_ms,value,memo")
      .eq("goal_id", fallbackRoutine.id)
      .order("created_at_ms", { ascending: true });
    if (entriesError) throw entriesError;

    const decoded = decodeRoutineMemo(fallbackRoutine.memo);
    return {
      ...assignment,
      detail: {
        kind: "routine" as const,
        item: {
          id: fallbackRoutine.id,
          title: fallbackRoutine.title,
          memo: decoded.memo,
          startDate: decoded.startDate || fallbackRoutine.deadline,
          endDate: fallbackRoutine.deadline,
          createdAt: fallbackRoutine.created_at_ms,
          marks: (entries ?? []).map((entry) => {
            const mark = decodeRoutineMarkMemo(entry.memo, entry.created_at_ms, entry.value);
            return {
              id: entry.id,
              routineId: entry.goal_id,
              date: mark.date,
              status: mark.status,
              createdAt: entry.created_at_ms,
            };
          }),
        },
      },
    };
  }

  if (!routine) throw new Error("Applied habit was not found.");
  const { data: marks, error: marksError } = await supabase
    .from("routine_marks")
    .select("id,routine_id,date,status,created_at_ms")
    .eq("routine_id", routine.id)
    .order("date", { ascending: true });
  if (marksError) throw marksError;

  return {
    ...assignment,
    detail: {
      kind: "routine" as const,
      item: {
        id: routine.id,
        title: routine.title,
        memo: routine.memo,
        startDate: routine.start_date,
        endDate: routine.end_date,
        createdAt: routine.created_at_ms,
        marks: (marks ?? []).map((mark) => ({
          id: mark.id,
          routineId: mark.routine_id,
          date: mark.date,
          status: mark.status,
          createdAt: mark.created_at_ms,
        })),
      },
    },
  };
}
